#pip install brainflow, pylsl, pyserial, pandas, numpy
# stream data from cyton board using brainflow
#save local csv files with eeg data and markers with timestamps
from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds
import time

import argparse
import os
import sys
import fnmatch

import serial
import serial.tools.list_ports


def find_port(patterns, exclude=()):
    """Return the device name of the first available serial port matching any of
    the given glob patterns, skipping any port already claimed via exclude."""
    for port in serial.tools.list_ports.comports():
        if port.device in exclude:
            continue
        if any(fnmatch.fnmatch(port.device, pattern) for pattern in patterns):
            return port.device
    return None


parser = argparse.ArgumentParser()
parser.add_argument("-B", "--board", default="cyton_daisy",help="Board ID for BrainFlow")
parser.add_argument("-T", "--trigger", default="serial", choices=["serial", "websocket"])
parser.add_argument("-S", "--serial-port", default=None,
                     help="Serial port for the BrainFlow board (default: COM3 on Windows, "
                          "first /dev/tty.usbserial* or /dev/cu.usbserial* on Mac)")
parser.add_argument("-M", "--marker-port", default=None,
                     help="Serial port for incoming markers (default: COM4 on Windows, "
                          "first /dev/ttys* on Mac)")
parser.add_argument("-O", "--output-dir", default="./recordings",
                     help="Directory to write eeg_data.csv and marker_log.csv into")
args = parser.parse_args()

os.makedirs(args.output_dir, exist_ok=True)

is_synthetic = args.board.lower() == "synthetic"

params = BrainFlowInputParams()
if not is_synthetic:
    serial_port = args.serial_port
    if serial_port is None:
        if sys.platform == "win32":
            serial_port = "COM3"
        elif sys.platform == "darwin":
            serial_port = find_port(["/dev/tty.usbserial*", "/dev/cu.usbserial*"])
            if serial_port is None:
                sys.exit("No board serial port found matching /dev/tty.usbserial* or "
                          "/dev/cu.usbserial* — pass --serial-port/-S explicitly.")
        else:
            sys.exit("Unsupported platform for board serial port autodetection — "
                      "pass --serial-port/-S explicitly.")
    params.serial_port = serial_port

board_id = BoardIds[args.board.upper() + "_BOARD"].value
board = BoardShim(board_id, params)

board.prepare_session()
if not is_synthetic:
    board.config_board('/2')
board.start_stream()

#import triggers from webapp
marker_log = []

marker_port = args.marker_port
if marker_port is None:
    if sys.platform == "win32":
        marker_port = "COM4"
    elif sys.platform == "darwin":
        marker_port = find_port(["/dev/ttys*"], exclude=(params.serial_port,))
        if marker_port is None:
            sys.exit("No marker serial port found matching /dev/ttys* — pass "
                      "--marker-port/-M explicitly.")
    else:
        sys.exit("Unsupported platform for marker serial port autodetection — "
                  "pass --marker-port/-M explicitly.")
marker_serial = serial.Serial(marker_port, 115200, timeout=0.01)  # Adjust COM port and baud rate as needed


#LSL streaming
#pushing multichannel EEG data to LSL stream

import time
from pylsl import StreamInfo, StreamOutlet

eeg_rows = BoardShim.get_eeg_channels(board_id)

eeg_out = StreamOutlet(StreamInfo('CytonDaisyEEG', 'EEG', len(eeg_rows), 125, 'float32', 'cyton_daisy_001'))
marker_out = StreamOutlet(StreamInfo('ExperimentMarkers', 'Markers', 1, 0, 'string', 'markers_001'))

print("streaming to LSL...")

blocks = []

try:
    while True:
        chunk = board.get_board_data()  # Get the latest chunk of data
        blocks.append(chunk)  # Store the chunk in the blocks list
        eeg_out.push_chunk(chunk[eeg_rows, :].T.tolist())

        line = marker_serial.readline().decode(errors="ignore").strip()  # Read a line from the serial port with a timeout
        if not line:
            continue  # Skip empty lines
        print("RAW:", repr(line))

        try:
            board.insert_marker(float(line))  # Insert the marker into the board data
            marker_out.push_sample([line])  # Push the marker to the LSL stream
            marker_log.append({"event_id": int(line), "received_time_s": time.time()})  # Log the marker
            print("trigger", line)

        except Exception as e:
            print("Parse error:", e)

except KeyboardInterrupt:
    print("\nInterrupted by user. Exiting...")
    
finally:
    blocks.append(board.get_board_data())
    board.stop_stream()
    board.release_session()
    marker_serial.close()

import numpy as np, pandas as pd
data = np.hstack(blocks)  # Concatenate all blocks into a single array
pd.DataFrame(data.T).to_csv(os.path.join(args.output_dir, "eeg_data.csv"), index=False)
pd.DataFrame(marker_log).to_csv(os.path.join(args.output_dir, "marker_log.csv"), index=False)
print("saved")
