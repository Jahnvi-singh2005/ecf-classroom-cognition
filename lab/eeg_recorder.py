#!/usr/bin/env python3
"""
eeg_recorder.py -- BrainFlow EEG acquisition with external experimental triggers.

Acquires from any BrainFlow-supported board, receives experiment triggers from a
JS webapp over either a virtual serial pair (com0com / WebSerial) or a WebSocket,
and produces two outputs:

  1. Local CSV files (EEG + markers + timestamps, trigger log, clock-sync log)
  2. LSL streams (EEG + Markers), recorded to .xdf by LabRecorder

Both the BrainFlow clock (Unix epoch) and the LSL clock (monotonic) are logged
for every sample and every trigger so their offset and drift can be measured
post hoc.

Usage
-----
    python eeg_recorder.py -B cyton_daisy -T serial    --serial-port COM3 --trigger-port COM4
    python eeg_recorder.py -B synthetic   -T websocket --ws-port 8765
    python eeg_recorder.py --list-boards

See --help for the full option set.
"""

from __future__ import annotations

import argparse
import json
import os
import queue
import re
import socket
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from brainflow.board_shim import (
    BoardShim,
    BoardIds,
    BrainFlowInputParams,
    BrainFlowError,
)

try:
    from pylsl import StreamInfo, StreamOutlet, local_clock
except ImportError:  # pragma: no cover
    sys.exit(
        "pylsl is required.  pip install pylsl\n"
        "On Linux you may also need liblsl: "
        "https://github.com/sccn/liblsl/releases"
    )


# =====================================================================
# CLOCKS
# =====================================================================

def clock_pair() -> Tuple[float, float, float]:
    """
    Sample the Unix (BrainFlow) clock and the LSL clock as close to
    simultaneously as possible.

    Returns (t_unix, t_lsl, read_uncertainty_seconds).

    The Unix clock is read on both sides of the LSL read and averaged, so the
    residual error is bounded by half the interval between the two reads.  That
    interval is returned so it can be logged -- if it is ever large (scheduler
    preemption between the two calls) the corresponding offset sample should be
    treated as suspect.
    """
    a = time.time()
    lsl = local_clock()
    b = time.time()
    return (a + b) / 2.0, lsl, (b - a)


def current_offset() -> float:
    """Unix-minus-LSL offset in seconds.  t_lsl = t_unix - offset."""
    t_unix, t_lsl, _ = clock_pair()
    return t_unix - t_lsl


# =====================================================================
# BOARD RESOLUTION
# =====================================================================

def resolve_board_id(spec: str) -> int:
    """Accept a numeric board id or a BoardIds member name (case-insensitive)."""
    spec = spec.strip()
    try:
        return int(spec)
    except ValueError:
        pass

    key = spec.upper().replace("-", "_").replace(" ", "_")
    names = {m.name: m.value for m in BoardIds}

    for candidate in (key, key + "_BOARD"):
        if candidate in names:
            return names[candidate]

    # Fall back to a substring match so "cyton_daisy" finds CYTON_DAISY_BOARD
    hits = [n for n in names if key in n]
    if len(hits) == 1:
        return names[hits[0]]
    if len(hits) > 1:
        raise argparse.ArgumentTypeError(
            f"Board '{spec}' is ambiguous.  Matches: {', '.join(sorted(hits))}"
        )
    raise argparse.ArgumentTypeError(
        f"Unknown board '{spec}'.  Run with --list-boards to see valid names."
    )


def board_name(board_id: int) -> str:
    for m in BoardIds:
        if m.value == board_id:
            return m.name
    return f"BOARD_{board_id}"


def print_board_list() -> None:
    print("Supported BrainFlow boards (pass the name or the id to -B):\n")
    rows = sorted(((m.value, m.name) for m in BoardIds), key=lambda r: r[0])
    for value, name in rows:
        short = name[:-6].lower() if name.endswith("_BOARD") else name.lower()
        print(f"  {value:>5}  {short:<28} ({name})")


def build_input_params(args: argparse.Namespace) -> BrainFlowInputParams:
    """Populate only the fields the user actually supplied."""
    p = BrainFlowInputParams()
    if args.serial_port:
        p.serial_port = args.serial_port
    if args.mac_address:
        p.mac_address = args.mac_address
    if args.ip_address:
        p.ip_address = args.ip_address
    if args.ip_port:
        p.ip_port = args.ip_port
    if args.ip_protocol:
        p.ip_protocol = args.ip_protocol
    if args.serial_number:
        p.serial_number = args.serial_number
    if args.other_info:
        p.other_info = args.other_info
    if args.file:
        p.file = args.file
    if args.master_board:
        p.master_board = resolve_board_id(args.master_board)
    if args.board_timeout:
        p.timeout = args.board_timeout
    return p


# =====================================================================
# CHANNEL LAYOUT
# =====================================================================

@dataclass
class ChannelLayout:
    board_id: int
    n_rows: int
    sampling_rate: int
    timestamp_row: int
    marker_row: Optional[int]
    eeg_rows: List[int]
    eeg_names: List[str]
    column_names: List[str]  # one per board row

    @staticmethod
    def _safe(fn, board_id, default=None):
        try:
            return fn(board_id)
        except Exception:
            return default if default is not None else []

    @classmethod
    def build(cls, board_id: int, name_override: Optional[List[str]] = None) -> "ChannelLayout":
        S = BoardShim
        n_rows = S.get_num_rows(board_id)
        sampling_rate = S.get_sampling_rate(board_id)
        timestamp_row = S.get_timestamp_channel(board_id)

        try:
            marker_row = S.get_marker_channel(board_id)
        except Exception:
            marker_row = None

        eeg_rows = cls._safe(S.get_eeg_channels, board_id)

        if name_override:
            if len(name_override) != len(eeg_rows):
                raise SystemExit(
                    f"--channel-names supplied {len(name_override)} names but board "
                    f"{board_name(board_id)} has {len(eeg_rows)} EEG channels."
                )
            eeg_names = list(name_override)
        else:
            eeg_names = cls._safe(S.get_eeg_names, board_id)
            if not eeg_names or len(eeg_names) != len(eeg_rows):
                eeg_names = [f"EEG{i + 1}" for i in range(len(eeg_rows))]

        # Start with generic row labels, then overwrite what we can identify.
        columns = [f"row_{i}" for i in range(n_rows)]

        def label(rows, fmt):
            for i, r in enumerate(rows):
                if 0 <= r < n_rows:
                    columns[r] = fmt(i)

        for group, fmt in (
            (cls._safe(S.get_package_num_channel, board_id, default=[]), lambda i: "package_num"),
            (cls._safe(S.get_accel_channels, board_id), lambda i: f"accel_{'xyz'[i] if i < 3 else i}"),
            (cls._safe(S.get_gyro_channels, board_id), lambda i: f"gyro_{'xyz'[i] if i < 3 else i}"),
            (cls._safe(S.get_analog_channels, board_id), lambda i: f"analog_{i + 1}"),
            (cls._safe(S.get_other_channels, board_id), lambda i: f"other_{i + 1}"),
            (cls._safe(S.get_ppg_channels, board_id), lambda i: f"ppg_{i + 1}"),
            (cls._safe(S.get_eda_channels, board_id), lambda i: f"eda_{i + 1}"),
            (cls._safe(S.get_emg_channels, board_id), lambda i: f"emg_{i + 1}"),
            (cls._safe(S.get_eog_channels, board_id), lambda i: f"eog_{i + 1}"),
            (cls._safe(S.get_temperature_channels, board_id), lambda i: f"temp_{i + 1}"),
            (cls._safe(S.get_resistance_channels, board_id), lambda i: f"resistance_{i + 1}"),
            (cls._safe(S.get_battery_channel, board_id, default=[]), lambda i: "battery"),
        ):
            if isinstance(group, int):
                group = [group]
            label(group, fmt)

        # EEG names last so they win over any overlapping generic group.
        for row, nm in zip(eeg_rows, eeg_names):
            columns[row] = nm

        columns[timestamp_row] = "timestamp_brainflow"
        if marker_row is not None:
            columns[marker_row] = "marker"

        return cls(
            board_id=board_id,
            n_rows=n_rows,
            sampling_rate=sampling_rate,
            timestamp_row=timestamp_row,
            marker_row=marker_row,
            eeg_rows=eeg_rows,
            eeg_names=eeg_names,
            column_names=columns,
        )


# =====================================================================
# TRIGGER PARSING
# =====================================================================

class CodeBook:
    """
    BrainFlow markers are floats, so non-numeric trigger labels need a numeric
    stand-in.  Labels are assigned codes on first sight, starting at `base`, and
    the mapping is written out with the results.
    """

    def __init__(self, base: int = 1000):
        self._map: Dict[str, int] = {}
        self._next = base
        self._lock = threading.Lock()

    def code_for(self, label: str) -> int:
        with self._lock:
            if label not in self._map:
                self._map[label] = self._next
                self._next += 1
            return self._map[label]

    def as_dict(self) -> Dict[str, int]:
        with self._lock:
            return dict(self._map)


_INT_RE = re.compile(r"^[+-]?\d+$")
_FLOAT_RE = re.compile(r"^[+-]?\d*\.\d+$")


def parse_trigger(raw: str, codebook: CodeBook,
                  mode: str = "auto") -> Optional[Tuple[float, str, Optional[float]]]:
    """
    Parse one trigger message.

    `mode` controls how permissive this is:
        "int"   -- only bare integers.  Anything else is rejected and logged as
                   unparsed.  Use this on a physical serial line: in "auto"
                   mode a corrupted byte sequence would be accepted as a novel
                   string label and inserted as a real marker.
        "json"  -- only JSON objects.
        "auto"  -- integers, floats, JSON, and bare strings (via the codebook).

    Accepts (in auto mode):
        "47"                                    -> code 47
        "47.0"                                  -> code 47.0
        "stim_onset"                            -> code from codebook
        '{"code": 12}'                          -> code 12
        '{"code": 12, "label": "cue"}'          -> code 12, label "cue"
        '{"label": "cue"}'                      -> code from codebook
        '{"code": 12, "t": 1691000000.123}'     -> plus webapp-side timestamp

    Returns (code, label, webapp_timestamp_or_None), or None if unparseable.
    """
    text = raw.strip()
    if not text:
        return None

    if mode == "int":
        return (float(int(text)), text, None) if _INT_RE.match(text) else None

    if text[0] in "{[":
        try:
            obj = json.loads(text)
        except json.JSONDecodeError:
            return None
        if isinstance(obj, list):
            obj = obj[0] if obj else {}
        if not isinstance(obj, dict):
            return None

        label = obj.get("label") or obj.get("name") or obj.get("event")
        code = obj.get("code", obj.get("trigger", obj.get("marker", obj.get("value"))))
        t_web = obj.get("t", obj.get("time", obj.get("timestamp")))

        if code is None and label is None:
            return None
        if code is None:
            code = codebook.code_for(str(label))
        try:
            code = float(code)
        except (TypeError, ValueError):
            return None
        try:
            t_web = float(t_web) if t_web is not None else None
        except (TypeError, ValueError):
            t_web = None
        return code, str(label) if label is not None else str(int(code)), t_web

    if mode == "json":
        return None

    if _INT_RE.match(text):
        return float(int(text)), text, None
    if _FLOAT_RE.match(text):
        return float(text), text, None

    return float(codebook.code_for(text)), text, None


# =====================================================================
# TRIGGER SOURCES
# =====================================================================

# Callback signature: (raw_text, t_unix, t_lsl, t_perf)
TriggerCallback = Callable[[str, float, float, float], None]


class TriggerSource(threading.Thread):
    def __init__(self, on_message: TriggerCallback, stop_event: threading.Event):
        super().__init__(daemon=True)
        self.on_message = on_message
        self.stop_event = stop_event
        self.error: Optional[BaseException] = None

    def describe(self) -> str:
        raise NotImplementedError

    def shutdown(self) -> None:
        pass


class SerialTriggerSource(TriggerSource):
    """
    Reads newline-terminated trigger messages from a serial port.

    With com0com the browser holds one end of the virtual pair and this process
    opens the other -- so --trigger-port must be the port the *webapp is not*
    using.  A pair created as CNCA0<->CNCB0 means the page opens CNCA0 via
    WebSerial and this script opens CNCB0 (or whatever names the com0com setup
    assigned; check the com0com control panel if unsure).
    """

    def __init__(self, on_message, stop_event, port: str, baud: int):
        super().__init__(on_message, stop_event)
        self.port = port
        self.baud = baud
        self._ser = None

    def describe(self) -> str:
        return f"serial {self.port} @ {self.baud} baud"

    def run(self) -> None:
        try:
            import serial  # pyserial
        except ImportError:
            self.error = RuntimeError("pyserial is required for -T serial.  pip install pyserial")
            self.stop_event.set()
            return

        try:
            self._ser = serial.Serial(self.port, self.baud, timeout=0.01)
        except Exception as exc:
            self.error = RuntimeError(f"Could not open trigger port {self.port}: {exc}")
            self.stop_event.set()
            return

        # Partial-line buffer.  With a short read timeout, read() returns
        # whatever bytes have arrived so far -- a trigger like "47" can arrive
        # split as "4" then "7", and both halves parse as valid integers.
        # Only complete newline-terminated lines are ever handed upstream.
        buf = b""

        while not self.stop_event.is_set():
            try:
                chunk = self._ser.read(self._ser.in_waiting or 1)
            except Exception as exc:
                self.error = RuntimeError(f"Serial read failed: {exc}")
                self.stop_event.set()
                return

            if not chunk:
                continue

            # Timestamp the instant the bytes land, before any parsing work.
            t_unix, t_lsl, _ = clock_pair()
            t_perf = time.perf_counter()

            buf += chunk
            while b"\n" in buf:
                rawline, buf = buf.split(b"\n", 1)
                text = rawline.decode("utf-8", errors="ignore").strip()
                if text:
                    self.on_message(text, t_unix, t_lsl, t_perf)

            # Guard against a peer that never sends a newline.
            if len(buf) > 4096:
                buf = b""

    def shutdown(self) -> None:
        try:
            if self._ser is not None:
                self._ser.close()
        except Exception:
            pass


class WebSocketTriggerSource(TriggerSource):
    """Runs a WebSocket server; each received message is one trigger."""

    def __init__(self, on_message, stop_event, host: str, port: int):
        super().__init__(on_message, stop_event)
        self.host = host
        self.port = port

    def describe(self) -> str:
        return f"websocket ws://{self.host}:{self.port}"

    def run(self) -> None:
        try:
            import asyncio
            import websockets
        except ImportError:
            self.error = RuntimeError("websockets is required for -T websocket.  pip install websockets")
            self.stop_event.set()
            return

        # Signature accepts the optional `path` arg so this works on both
        # websockets >= 12 (handler(ws)) and older releases (handler(ws, path)).
        async def handler(ws, path=None):
            peer = getattr(ws, "remote_address", None)
            print(f"[trigger] webapp connected: {peer}")
            try:
                async for message in ws:
                    t_unix, t_lsl, _ = clock_pair()
                    t_perf = time.perf_counter()
                    if isinstance(message, bytes):
                        message = message.decode("utf-8", errors="ignore")
                    for line in message.splitlines() or [message]:
                        if line.strip():
                            self.on_message(line, t_unix, t_lsl, t_perf)
            except Exception:
                pass
            finally:
                print(f"[trigger] webapp disconnected: {peer}")

        async def main():
            stop_async = asyncio.Event()

            async def watchdog():
                while not self.stop_event.is_set():
                    await asyncio.sleep(0.1)
                stop_async.set()

            asyncio.create_task(watchdog())
            try:
                async with websockets.serve(handler, self.host, self.port):
                    await stop_async.wait()
            except OSError as exc:
                self.error = RuntimeError(f"Could not bind ws://{self.host}:{self.port}: {exc}")
                self.stop_event.set()

        try:
            asyncio.run(main())
        except Exception as exc:
            if self.error is None:
                self.error = exc
            self.stop_event.set()


def make_trigger_source(args, on_message, stop_event) -> TriggerSource:
    if args.trigger == "serial":
        if not args.trigger_port:
            raise SystemExit("-T serial requires --trigger-port (this process's end of the com0com pair)")
        return SerialTriggerSource(on_message, stop_event, args.trigger_port, args.trigger_baud)
    if args.trigger == "websocket":
        return WebSocketTriggerSource(on_message, stop_event, args.ws_host, args.ws_port)
    if args.trigger == "none":
        return None
    raise SystemExit(f"Unknown trigger type {args.trigger!r}")


# =====================================================================
# LSL OUTLETS
# =====================================================================

class LSLOutlets:
    def __init__(self, layout: ChannelLayout, args, session_id: str):
        self.layout = layout
        self.push_all = args.lsl_all_channels
        self._chunk_ok = True

        if self.push_all:
            rows = list(range(layout.n_rows))
            labels = list(layout.column_names)
        else:
            rows = list(layout.eeg_rows)
            labels = list(layout.eeg_names)

        self.rows = rows
        self.labels = labels

        eeg_info = StreamInfo(
            name=args.lsl_eeg_name,
            type="EEG",
            channel_count=len(rows),
            nominal_srate=float(layout.sampling_rate),
            channel_format="double64",
            source_id=f"{args.lsl_eeg_name}_{board_name(layout.board_id)}_{session_id}",
        )
        desc = eeg_info.desc()
        desc.append_child_value("manufacturer", "BrainFlow")
        desc.append_child_value("board", board_name(layout.board_id))
        desc.append_child_value("board_id", str(layout.board_id))
        chans = desc.append_child("channels")
        eeg_row_set = set(layout.eeg_rows)
        for row, lbl in zip(rows, labels):
            ch = chans.append_child("channel")
            ch.append_child_value("label", lbl)
            if row in eeg_row_set:
                ch.append_child_value("unit", "microvolts")
                ch.append_child_value("type", "EEG")
            else:
                ch.append_child_value("type", "Misc")
        self.eeg = StreamOutlet(eeg_info, chunk_size=32, max_buffered=360)

        marker_info = StreamInfo(
            name=args.lsl_marker_name,
            type="Markers",
            channel_count=1,
            nominal_srate=0.0,
            channel_format="string",
            source_id=f"{args.lsl_marker_name}_{session_id}",
        )
        marker_info.desc().append_child_value("source", "experiment_triggers")
        self.markers = StreamOutlet(marker_info)

        print(f"[lsl] EEG outlet    '{args.lsl_eeg_name}'    {len(rows)} ch @ {layout.sampling_rate} Hz")
        print(f"[lsl] Marker outlet '{args.lsl_marker_name}' (irregular)")

    def push_eeg(self, data: np.ndarray, offset: float) -> None:
        """
        data: (n_rows, n_samples) straight from BrainFlow.
        offset: Unix-minus-LSL offset measured at the moment this block was pulled.
        """
        if data.size == 0:
            return
        bf_ts = data[self.layout.timestamp_row]
        lsl_ts = bf_ts - offset
        samples = data[self.rows, :].T  # (n_samples, n_channels)

        if self._chunk_ok:
            try:
                self.eeg.push_chunk(samples.tolist(), lsl_ts.tolist())
                return
            except TypeError:
                # Older pylsl without per-sample timestamp support.
                self._chunk_ok = False

        for i in range(samples.shape[0]):
            self.eeg.push_sample(samples[i].tolist(), float(lsl_ts[i]))

    def push_marker(self, label: str, t_lsl: float) -> None:
        self.markers.push_sample([label], t_lsl)


# =====================================================================
# BOARD PUMP
# =====================================================================

class BoardPump(threading.Thread):
    """
    Single drain point for the BrainFlow ring buffer.

    Nothing else may call get_board_data() while this runs -- two consumers
    would split the stream between them.  Each pulled block is pushed to LSL and
    retained for the CSV, together with the clock offset measured at pull time.
    """

    def __init__(self, board: BoardShim, layout: ChannelLayout, outlets: LSLOutlets,
                 stop_event: threading.Event, interval: float = 0.05):
        super().__init__(daemon=True)
        self.board = board
        self.layout = layout
        self.outlets = outlets
        self.stop_event = stop_event
        self.interval = interval
        self.blocks: List[Tuple[np.ndarray, float]] = []
        self.n_samples = 0
        self.error: Optional[BaseException] = None
        self._lock = threading.Lock()

    def _drain_once(self) -> None:
        data = self.board.get_board_data()
        if data.size == 0:
            return
        offset = current_offset()
        with self._lock:
            self.blocks.append((data, offset))
            self.n_samples += data.shape[1]
        self.outlets.push_eeg(data, offset)

    def run(self) -> None:
        while not self.stop_event.is_set():
            try:
                self._drain_once()
            except BrainFlowError as exc:
                self.error = exc
                self.stop_event.set()
                return
            except Exception as exc:
                self.error = exc
                self.stop_event.set()
                return
            time.sleep(self.interval)

    def final_drain(self) -> None:
        """Pull whatever is left after the stream stops."""
        try:
            self._drain_once()
        except Exception as exc:
            print(f"[warn] final drain failed: {exc}")

    def assemble(self) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        """Returns (board_matrix, lsl_timestamps) or (None, None) if empty."""
        with self._lock:
            if not self.blocks:
                return None, None
            matrix = np.hstack([b for b, _ in self.blocks])
            lsl_ts = np.hstack(
                [b[self.layout.timestamp_row] - off for b, off in self.blocks]
            )
        return matrix, lsl_ts


# =====================================================================
# CLOCK SYNC HEARTBEAT
# =====================================================================

class ClockMonitor(threading.Thread):
    def __init__(self, stop_event: threading.Event, interval: float = 1.0):
        super().__init__(daemon=True)
        self.stop_event = stop_event
        self.interval = interval
        self.samples: List[dict] = []

    def run(self) -> None:
        while not self.stop_event.is_set():
            t_unix, t_lsl, unc = clock_pair()
            self.samples.append({
                "time_unix": t_unix,
                "time_lsl": t_lsl,
                "offset_unix_minus_lsl": t_unix - t_lsl,
                "read_uncertainty_s": unc,
            })
            self.stop_event.wait(self.interval)


def summarise_drift(samples: List[dict]) -> Optional[dict]:
    if len(samples) < 3:
        return None
    t = np.array([s["time_unix"] for s in samples])
    off = np.array([s["offset_unix_minus_lsl"] for s in samples])
    t0 = t - t[0]
    slope, intercept = np.polyfit(t0, off, 1)
    residual = off - (slope * t0 + intercept)
    resid_rms = float(np.sqrt((residual ** 2).mean()))

    # Standard error of the slope.  Over a short session the fit is dominated by
    # jitter, not drift, and the ppm figure is meaningless without this.
    denom = float(((t0 - t0.mean()) ** 2).sum())
    dof = max(len(samples) - 2, 1)
    slope_se = float(np.sqrt((residual ** 2).sum() / dof / denom)) if denom > 0 else float("nan")

    return {
        "n": len(samples),
        "span_s": float(t0[-1]),
        "offset_mean_s": float(off.mean()),
        "offset_range_us": float((off.max() - off.min()) * 1e6),
        "drift_ppm": float(slope * 1e6),
        "drift_se_ppm": slope_se * 1e6,
        "residual_rms_us": resid_rms * 1e6,
        "drift_significant": bool(abs(slope) > 2 * slope_se) if np.isfinite(slope_se) else False,
    }


# =====================================================================
# LABRECORDER
# =====================================================================

class LabRecorder:
    """
    Launches LabRecorder and, where possible, drives it over its Remote Control
    Server (RCS) socket.

    RCS is not on by default: LabRecorder only listens on 22345 when
    `RCSEnabled` is true in its config.  If the socket cannot be reached the
    recording still has to be armed by hand in the GUI -- the script says so
    rather than pretending the .xdf is being written.
    """

    def __init__(self, exe_path: Optional[str], host: str, port: int,
                 out_dir: str, template: str, config: Optional[str] = None):
        self.exe_path = exe_path
        self.host = host
        self.port = port
        self.out_dir = os.path.abspath(out_dir)
        self.template = template
        self.config = config
        self.proc: Optional[subprocess.Popen] = None
        self.rcs_ok = False
        self.recording = False

    # -- process ------------------------------------------------------
    def launch(self) -> bool:
        if not self.exe_path:
            return False
        if not os.path.exists(self.exe_path):
            print(f"[labrecorder] not found at {self.exe_path} -- skipping launch")
            return False
        cmd = [self.exe_path]
        if self.config:
            cmd += ["-c", self.config]
        try:
            self.proc = subprocess.Popen(
                cmd,
                cwd=os.path.dirname(self.exe_path) or None,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            print(f"[labrecorder] launched (pid {self.proc.pid})")
            return True
        except Exception as exc:
            print(f"[labrecorder] launch failed: {exc}")
            return False

    # -- remote control ----------------------------------------------
    def _send(self, command: str, timeout: float = 2.0) -> Optional[str]:
        try:
            with socket.create_connection((self.host, self.port), timeout=timeout) as s:
                s.settimeout(timeout)
                s.sendall((command.rstrip("\n") + "\n").encode("utf-8"))
                try:
                    return s.recv(4096).decode("utf-8", errors="ignore").strip()
                except socket.timeout:
                    return ""
        except OSError:
            return None

    def wait_for_rcs(self, timeout: float = 15.0) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self._send("update", timeout=1.0) is not None:
                self.rcs_ok = True
                return True
            time.sleep(0.5)
        return False

    def start_recording(self, run: int = 1) -> bool:
        if not self.rcs_ok:
            return False
        os.makedirs(self.out_dir, exist_ok=True)
        self._send("update")
        time.sleep(0.5)
        self._send("select all")
        self._send(f"filename {{root:{self.out_dir}}} {{template:{self.template}}} {{run:{run}}}")
        reply = self._send("start")
        self.recording = reply is not None
        if self.recording:
            print(f"[labrecorder] recording -> {os.path.join(self.out_dir, self.template)}")
        return self.recording

    def stop_recording(self) -> None:
        if self.recording:
            self._send("stop")
            print("[labrecorder] recording stopped")
            self.recording = False

    def terminate(self, kill: bool) -> None:
        if self.proc is None or not kill:
            return
        try:
            self.proc.terminate()
            self.proc.wait(timeout=5)
        except Exception:
            try:
                self.proc.kill()
            except Exception:
                pass


# =====================================================================
# SESSION
# =====================================================================

class Session:
    def __init__(self, args):
        self.args = args
        self.stop_event = threading.Event()
        self.codebook = CodeBook(base=args.label_code_base)
        self.trigger_log: List[dict] = []
        self.unparsed: List[dict] = []
        self._trigger_lock = threading.Lock()
        self.board: Optional[BoardShim] = None
        self.layout: Optional[ChannelLayout] = None
        self.outlets: Optional[LSLOutlets] = None
        self.pump: Optional[BoardPump] = None
        self.clock_monitor: Optional[ClockMonitor] = None
        self.source: Optional[TriggerSource] = None
        self.labrecorder: Optional[LabRecorder] = None
        self.session_id = time.strftime("%Y%m%d_%H%M%S")
        self.t_start_unix = None
        self.t_start_lsl = None

    # -- trigger handling --------------------------------------------
    def on_trigger_message(self, raw: str, t_unix: float, t_lsl: float, t_perf: float) -> None:
        parsed = parse_trigger(raw, self.codebook, self.args.trigger_format)
        if parsed is None:
            with self._trigger_lock:
                self.unparsed.append({"raw": raw, "time_unix": t_unix})
            print(f"[trigger] unparsed: {raw!r}")
            return

        code, label, t_web = parsed

        # insert_marker first: it is the only step whose latency lands inside
        # the recorded data.  Logging and printing happen after.
        marker_ok = True
        if self.board is not None and self.layout is not None and self.layout.marker_row is not None:
            try:
                # Exactly one insert per trigger.  Two markers less than one
                # sample period apart land on the same sample and one is lost,
                # which desynchronises the marker count from the trigger log.
                self.board.insert_marker(float(code))
            except Exception as exc:
                marker_ok = False
                print(f"[trigger] insert_marker({code}) failed: {exc}")

        if self.outlets is not None:
            try:
                self.outlets.push_marker(label, t_lsl)
            except Exception as exc:
                print(f"[trigger] LSL marker push failed: {exc}")

        with self._trigger_lock:
            self.trigger_log.append({
                "code": code,
                "label": label,
                "time_unix": t_unix,
                "time_lsl": t_lsl,
                "time_perf": t_perf,
                "offset_unix_minus_lsl": t_unix - t_lsl,
                "time_webapp": t_web,
                "webapp_minus_local_ms": (t_web - t_unix) * 1e3 if t_web is not None else None,
                "inserted_to_board": marker_ok,
                "raw": raw,
            })
            n = len(self.trigger_log)

        rel = t_unix - self.t_start_unix if self.t_start_unix else 0.0
        print(f"[trigger] #{n:<5} t+{rel:8.3f}s  code={code:g}  label={label}")

    # -- lifecycle ----------------------------------------------------
    def setup_board(self) -> None:
        a = self.args
        board_id = resolve_board_id(a.board)

        # Configure logging *before* probing channels: ChannelLayout asks every
        # board for every channel type, and the ones it does not have log an
        # error apiece.  Those are expected and would otherwise bury real output.
        if a.verbose:
            BoardShim.enable_dev_board_logger()
        else:
            BoardShim.disable_board_logger()

        self.layout = ChannelLayout.build(
            board_id,
            [s.strip() for s in a.channel_names.split(",")] if a.channel_names else None,
        )

        params = build_input_params(a)
        self.board = BoardShim(board_id, params)

        print(f"[board] {board_name(board_id)} (id {board_id})")
        print(f"[board] {len(self.layout.eeg_rows)} EEG channels @ {self.layout.sampling_rate} Hz")
        print(f"[board] channels: {', '.join(self.layout.eeg_names)}")

        self.board.prepare_session()

        if a.board_config:
            print(f"[board] config_board({a.board_config!r})")
            self.board.config_board(a.board_config)

    def compute_buffer(self) -> int:
        a = self.args
        if a.ring_buffer:
            return a.ring_buffer
        # The pump drains every 50 ms, so the ring only ever holds a fraction of
        # a second.  This is sized for one hour anyway, so a stalled pump loses
        # nothing recoverable.
        return max(450_000, self.layout.sampling_rate * 3600)

    def run(self) -> None:
        a = self.args
        self.setup_board()
        self.outlets = LSLOutlets(self.layout, a, self.session_id)

        # LabRecorder is launched *after* the outlets exist so "select all"
        # finds both streams.
        if a.labrecorder:
            self.labrecorder = LabRecorder(
                exe_path=a.labrecorder,
                host=a.lr_host,
                port=a.lr_port,
                out_dir=a.xdf_dir or a.output_dir,
                template=a.xdf_template.replace("%s", self.session_id),
                config=a.lr_config,
            )
            self.labrecorder.launch()
            time.sleep(a.lr_launch_delay)
            if self.labrecorder.wait_for_rcs(timeout=a.lr_rcs_timeout):
                self.labrecorder.start_recording(run=a.run)
            else:
                print("[labrecorder] RCS not reachable on "
                      f"{a.lr_host}:{a.lr_port} -- arm the recording manually in the GUI.")
                print("[labrecorder] (RCS needs RCSEnabled=true in LabRecorder's config file.)")

        if a.wait_for_recorder:
            input("\n>>> Recorder armed?  Press ENTER to start acquisition... ")

        self.clock_monitor = ClockMonitor(self.stop_event, a.clock_interval)
        self.clock_monitor.start()

        buffer_size = self.compute_buffer()
        self.board.start_stream(buffer_size)
        self.t_start_unix, self.t_start_lsl, _ = clock_pair()
        print(f"[board] streaming (ring buffer {buffer_size:,} samples "
              f"= {buffer_size / self.layout.sampling_rate / 60:.0f} min)")

        self.pump = BoardPump(self.board, self.layout, self.outlets,
                              self.stop_event, a.pump_interval)
        self.pump.start()

        if a.trigger != "none":
            self.source = make_trigger_source(a, self.on_trigger_message, self.stop_event)
            self.source.start()
            time.sleep(0.3)
            if self.source.error:
                raise SystemExit(f"[trigger] {self.source.error}")
            print(f"[trigger] listening on {self.source.describe()}")
        else:
            print("[trigger] disabled (-T none)")

        print("\n" + "-" * 60)
        print(f"  Recording.  Session {self.session_id}")
        if a.duration:
            print(f"  Auto-stop after {a.duration:g} s")
        print("  Press CTRL+C to stop")
        print("-" * 60 + "\n")

        deadline = time.time() + a.duration if a.duration else None
        try:
            while not self.stop_event.is_set():
                time.sleep(0.2)
                if deadline and time.time() >= deadline:
                    print("\n[main] duration reached")
                    break
                if self.pump.error:
                    print(f"\n[main] acquisition error: {self.pump.error}")
                    break
                if self.source is not None and self.source.error:
                    print(f"\n[main] trigger error: {self.source.error}")
                    break
        except KeyboardInterrupt:
            print("\n[main] interrupted")

    def shutdown(self) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        self.stop_event.set()

        if self.source is not None:
            self.source.shutdown()
            self.source.join(timeout=2.0)

        if self.pump is not None:
            self.pump.join(timeout=2.0)

        # Stop the stream, then take one last drain so samples buffered between
        # the final pump cycle and the stop are not dropped.
        if self.board is not None:
            try:
                self.board.stop_stream()
            except Exception as exc:
                print(f"[warn] stop_stream: {exc}")

        if self.pump is not None:
            self.pump.final_drain()

        if self.clock_monitor is not None:
            self.clock_monitor.join(timeout=2.0)

        if self.labrecorder is not None:
            self.labrecorder.stop_recording()
            self.labrecorder.terminate(kill=self.args.lr_kill)

        # Release last, and unconditionally -- an unreleased session leaves the
        # dongle's COM port locked and the vendor GUI unable to connect.
        if self.board is not None:
            try:
                self.board.release_session()
            except Exception as exc:
                print(f"[warn] release_session: {exc}")

        if self.pump is None:
            return None, None
        return self.pump.assemble()


# =====================================================================
# OUTPUT
# =====================================================================

def write_outputs(session: Session, matrix: Optional[np.ndarray],
                  lsl_ts: Optional[np.ndarray]) -> None:
    a = session.args
    layout = session.layout
    out_dir = os.path.abspath(a.output_dir)
    os.makedirs(out_dir, exist_ok=True)
    prefix = os.path.join(out_dir, f"{a.prefix}_{session.session_id}")

    print("\n" + "=" * 60)
    print("  RESULTS")
    print("=" * 60)

    # -- EEG ----------------------------------------------------------
    eeg_path = None
    if matrix is None or matrix.size == 0:
        print("[out] no EEG samples captured -- nothing to write")
    else:
        cols = {}
        cols["timestamp_brainflow"] = matrix[layout.timestamp_row]
        cols["timestamp_lsl"] = lsl_ts
        cols["t_rel_s"] = matrix[layout.timestamp_row] - matrix[layout.timestamp_row][0]
        if layout.marker_row is not None:
            cols["marker"] = matrix[layout.marker_row]
        for row, name in enumerate(layout.column_names):
            if name in ("timestamp_brainflow", "marker"):
                continue
            cols[name] = matrix[row]

        df = pd.DataFrame(cols)
        eeg_path = f"{prefix}_eeg.csv"
        df.to_csv(eeg_path, index=False, float_format=a.float_format)

        dur = matrix.shape[1] / layout.sampling_rate
        print(f"[out] EEG        {matrix.shape[1]:,} samples, {dur:.1f} s "
              f"({dur / 60:.1f} min), {matrix.shape[0]} rows")
        print(f"                 -> {eeg_path}")

        expected = int(round(dur * layout.sampling_rate))
        if abs(expected - matrix.shape[1]) > layout.sampling_rate:
            print(f"[warn] sample count {matrix.shape[1]:,} differs from "
                  f"{expected:,} expected for the elapsed time -- possible dropped packets")

    # -- triggers -----------------------------------------------------
    trig_path = None
    if session.trigger_log:
        tdf = pd.DataFrame(session.trigger_log)
        if session.t_start_unix:
            tdf.insert(0, "t_rel_s", tdf["time_unix"] - session.t_start_unix)
        trig_path = f"{prefix}_triggers.csv"
        tdf.to_csv(trig_path, index=False, float_format=a.float_format)
        print(f"[out] Triggers   {len(session.trigger_log)} logged")
        print(f"                 -> {trig_path}")
    else:
        print("[out] Triggers   none received")

    if session.unparsed:
        up_path = f"{prefix}_unparsed.csv"
        pd.DataFrame(session.unparsed).to_csv(up_path, index=False)
        print(f"[warn] {len(session.unparsed)} unparseable trigger messages -> {up_path}")

    # -- clock sync ---------------------------------------------------
    clock_path = None
    summary = None
    if session.clock_monitor and session.clock_monitor.samples:
        cdf = pd.DataFrame(session.clock_monitor.samples)
        clock_path = f"{prefix}_clocksync.csv"
        cdf.to_csv(clock_path, index=False, float_format="%.9f")
        summary = summarise_drift(session.clock_monitor.samples)
        print(f"[out] Clock sync {len(session.clock_monitor.samples)} pairs")
        print(f"                 -> {clock_path}")

    # -- label codebook -----------------------------------------------
    if session.codebook.as_dict():
        cb_path = f"{prefix}_codebook.json"
        with open(cb_path, "w") as fh:
            json.dump(session.codebook.as_dict(), fh, indent=2)
        print(f"[out] Codebook   {len(session.codebook.as_dict())} label->code mappings")
        print(f"                 -> {cb_path}")

    # -- marker reconciliation ----------------------------------------
    if matrix is not None and matrix.size and layout.marker_row is not None:
        markers = matrix[layout.marker_row]
        idx = np.flatnonzero(markers != 0)
        n_board = len(idx)
        n_log = len(session.trigger_log)

        print(f"\n[check] markers in EEG data : {n_board}")
        print(f"[check] triggers logged     : {n_log}")

        if n_board != n_log:
            gap_ms = 1000.0 / layout.sampling_rate
            print(f"[warn]  counts disagree.  BrainFlow stores one marker per sample, so two "
                  f"triggers less\n        than {gap_ms:.1f} ms apart (one sample at "
                  f"{layout.sampling_rate} Hz) collide and one is dropped.")
            if n_log >= 2:
                gaps = np.diff([t["time_unix"] for t in session.trigger_log]) * 1000.0
                tight = int((gaps < gap_ms).sum())
                if tight:
                    print(f"        {tight} inter-trigger interval(s) were below that "
                          f"threshold (min {gaps.min():.1f} ms).")
                print(f"        The LSL marker stream in the .xdf has no such limit -- "
                      f"use it as the\n        authoritative trigger record if counts differ.")

        if a.show_markers and n_board:
            print("\n[check] markers inserted into EEG:")
            bf_ts = matrix[layout.timestamp_row]
            for i in idx[: a.show_markers]:
                print(f"        code {int(markers[i]):<6} "
                      f"bf={bf_ts[i]:.6f}  lsl={lsl_ts[i]:.6f}")
            if n_board > a.show_markers:
                print(f"        ... and {n_board - a.show_markers} more")

    # -- clock report --------------------------------------------------
    if summary:
        print("\n[clock] BrainFlow (Unix) vs LSL clock")
        print(f"        samples          : {summary['n']} over {summary['span_s']:.0f} s")
        print(f"        mean offset      : {summary['offset_mean_s']:.6f} s")
        print(f"        offset range     : {summary['offset_range_us']:.1f} us")
        print(f"        drift            : {summary['drift_ppm']:.3f} "
              f"+/- {summary['drift_se_ppm']:.3f} ppm "
              f"({summary['drift_ppm'] * 3.6:.2f} ms/hour)")
        print(f"        residual RMS     : {summary['residual_rms_us']:.1f} us")
        if summary["span_s"] < 300:
            print(f"        NOTE: over only {summary['span_s']:.0f} s the fit is dominated by "
                  f"jitter, not drift.\n              Treat the ppm figure as noise until you "
                  f"have a session of 10+ minutes.")
        elif not summary["drift_significant"]:
            print("        (drift is not distinguishable from zero at this span)")
        print("        (t_lsl = t_unix - offset;  apply per-sample using the "
              "timestamp_lsl column)")

    if session.trigger_log:
        webs = [t["webapp_minus_local_ms"] for t in session.trigger_log
                if t.get("webapp_minus_local_ms") is not None]
        if webs:
            arr = np.array(webs)
            print(f"\n[clock] webapp timestamp vs local arrival: "
                  f"mean {arr.mean():+.2f} ms, sd {arr.std():.2f} ms, "
                  f"range {arr.min():+.2f} to {arr.max():+.2f} ms")

    # -- manifest ------------------------------------------------------
    manifest = {
        "session_id": session.session_id,
        "board": board_name(layout.board_id),
        "board_id": layout.board_id,
        "sampling_rate_hz": layout.sampling_rate,
        "eeg_channels": layout.eeg_names,
        "trigger_source": a.trigger,
        "started_unix": session.t_start_unix,
        "started_lsl": session.t_start_lsl,
        "n_samples": int(matrix.shape[1]) if matrix is not None and matrix.size else 0,
        "n_triggers": len(session.trigger_log),
        "files": {k: v for k, v in {
            "eeg": eeg_path, "triggers": trig_path, "clocksync": clock_path,
        }.items() if v},
        "clock_summary": summary,
        "lsl_streams": {"eeg": a.lsl_eeg_name, "markers": a.lsl_marker_name},
    }
    man_path = f"{prefix}_manifest.json"
    with open(man_path, "w") as fh:
        json.dump(manifest, fh, indent=2, default=str)
    print(f"\n[out] Manifest   -> {man_path}")
    print("=" * 60)


# =====================================================================
# CLI
# =====================================================================

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="eeg_recorder.py",
        description="BrainFlow EEG acquisition with webapp triggers, CSV + LSL/XDF output.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples
  # Cyton+Daisy, triggers over a com0com pair (webapp holds COM4, we read COM5)
  eeg_recorder.py -B cyton_daisy -T serial --serial-port COM3 --trigger-port COM5 \\
      --labrecorder "C:/Program Files/LabRecorder/LabRecorder.exe"

  # Any board, triggers over WebSocket
  eeg_recorder.py -B ganglion -T websocket --serial-port COM3 --ws-port 8765

  # Dry run with no hardware at all
  eeg_recorder.py -B synthetic -T websocket --duration 30
""",
    )

    p.add_argument("-B", "--board", default="synthetic",
                   help="BrainFlow board name or numeric id (default: synthetic)")
    p.add_argument("-T", "--trigger", default="websocket",
                   choices=["serial", "websocket", "none"],
                   help="trigger transport (default: websocket)")
    p.add_argument("--list-boards", action="store_true", help="list supported boards and exit")
    p.add_argument("--trigger-format", default="auto", choices=["auto", "int", "json"],
                   help="how to parse trigger messages.  'int' rejects anything that is not a "
                        "bare integer -- recommended on a physical serial line, where 'auto' "
                        "would accept line noise as a novel string label (default: auto)")

    g = p.add_argument_group("board connection (only set what your board needs)")
    g.add_argument("--serial-port", help="board serial port, e.g. COM3 or /dev/ttyUSB0")
    g.add_argument("--mac-address")
    g.add_argument("--ip-address")
    g.add_argument("--ip-port", type=int)
    g.add_argument("--ip-protocol", type=int)
    g.add_argument("--serial-number")
    g.add_argument("--other-info")
    g.add_argument("--file")
    g.add_argument("--master-board", help="for playback/streaming boards")
    g.add_argument("--board-timeout", type=int, help="BrainFlow discovery timeout (s)")
    g.add_argument("--board-config", help="string passed to config_board() after prepare_session")
    g.add_argument("--channel-names", help="comma-separated EEG labels, overriding board defaults")
    g.add_argument("--ring-buffer", type=int,
                   help="BrainFlow ring buffer in samples (default: 1 hour at the board rate)")

    g = p.add_argument_group("serial triggers (-T serial)")
    g.add_argument("--trigger-port",
                   help="THIS process's end of the com0com pair -- not the port the webapp opens")
    g.add_argument("--trigger-baud", type=int, default=115200,
                   help="nominal on a virtual pair, but WebSerial requires a value (default: 115200)")

    g = p.add_argument_group("websocket triggers (-T websocket)")
    g.add_argument("--ws-host", default="localhost")
    g.add_argument("--ws-port", type=int, default=8765)

    g = p.add_argument_group("LSL")
    g.add_argument("--lsl-eeg-name", default="BrainFlowEEG")
    g.add_argument("--lsl-marker-name", default="ExperimentMarkers")
    g.add_argument("--lsl-all-channels", action="store_true",
                   help="stream every board row to LSL, not just EEG channels")

    g = p.add_argument_group("LabRecorder / XDF")
    g.add_argument("--labrecorder", help="path to LabRecorder executable; launches it on start")
    g.add_argument("--lr-config", help="LabRecorder config file (-c)")
    g.add_argument("--lr-host", default="localhost")
    g.add_argument("--lr-port", type=int, default=22345, help="RCS port (default: 22345)")
    g.add_argument("--lr-launch-delay", type=float, default=2.0,
                   help="seconds to wait after launching before contacting RCS")
    g.add_argument("--lr-rcs-timeout", type=float, default=10.0)
    g.add_argument("--lr-kill", action="store_true",
                   help="close LabRecorder when the session ends")
    g.add_argument("--xdf-dir", help="XDF root directory (default: --output-dir)")
    g.add_argument("--xdf-template", default="sub-%s.xdf",
                   help="XDF filename template; %%s is replaced with the session id")
    g.add_argument("--run", type=int, default=1, help="run number passed to LabRecorder")
    g.add_argument("--wait-for-recorder", action="store_true",
                   help="pause for ENTER after arming the recorder, before acquisition starts")

    g = p.add_argument_group("output")
    g.add_argument("-o", "--output-dir", default="./recordings")
    g.add_argument("--prefix", default="session")
    g.add_argument("--float-format", default="%.6f")
    g.add_argument("--show-markers", type=int, default=20,
                   help="print this many inserted markers at the end (0 to disable)")

    g = p.add_argument_group("timing")
    g.add_argument("--duration", type=float, help="auto-stop after N seconds")
    g.add_argument("--pump-interval", type=float, default=0.05,
                   help="how often to drain the board into LSL/memory (default: 0.05 s)")
    g.add_argument("--clock-interval", type=float, default=1.0,
                   help="clock-offset sampling period (default: 1.0 s)")
    g.add_argument("--label-code-base", type=int, default=1000,
                   help="first numeric code assigned to non-numeric labels")
    g.add_argument("-v", "--verbose", action="store_true", help="enable BrainFlow's logger")

    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)

    if args.list_boards:
        print_board_list()
        return 0

    session = Session(args)
    matrix = lsl_ts = None
    exit_code = 0

    try:
        session.run()
    except BrainFlowError as exc:
        print(f"\n[error] BrainFlow: {exc}")
        exit_code = 1
    except SystemExit as exc:
        print(f"\n{exc}")
        exit_code = 1
    except Exception as exc:
        print(f"\n[error] {type(exc).__name__}: {exc}")
        exit_code = 1
    finally:
        # Always runs: an exception that skipped cleanup would leave the board
        # streaming and its port locked.
        try:
            matrix, lsl_ts = session.shutdown()
        except Exception as exc:
            print(f"[warn] shutdown: {exc}")

    if session.layout is not None:
        try:
            write_outputs(session, matrix, lsl_ts)
        except Exception as exc:
            print(f"[error] writing outputs: {type(exc).__name__}: {exc}")
            exit_code = 1

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
