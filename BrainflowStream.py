from os import path
from serial.tools import list_ports as lp
import pandas as pd
import numpy as np
import mne 
from mne_bids import BIDSPath, write_raw_bids

from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds

board_ids = {
    'cyton': BoardIds.CYTON_BOARD.value,
    'ganglion': BoardIds.GANGLION_BOARD.value,
    'synthetic': BoardIds.SYNTHETIC_BOARD.value,
    'cyton-daisy': BoardIds.CYTON_DAISY_BOARD.value,
}

def list_ports():
    return [port.device for port in lp.comports()]

class BrainFlowBoard:
    def __init__(self, board_name, default_port='COM7'):
        self.enabled = board_name.lower() != 'none'

        if not self.enabled:
            print("BrainFlow board setup is disabled.")
            return
        
        BoardShim.enable_dev_board_logger()
        self.params = BrainFlowInputParams()

        available_ports = list_ports()
        if default_port not in available_ports:
            if available_ports:
                default_port = available_ports[0]
                print(f"Port not found. Defaulting to {default_port}")
            else:
                raise ValueError("No available serial ports found.")

        self.params.serial_port = default_port
        self.board_name = board_name.lower()
        self.board_id = board_ids.get(self.board_name)
        self.board = BoardShim(self.board_id, self.params)

        self.board.prepare_session()
        print(f"Board {board_name} initialized on port {default_port}.")
        self.board.start_stream()

    def insert_marker(self, marker):
        if self.enabled:
            self.board.insert_marker(marker)
    
    def stop_and_save(self, bids_root='./bids_dataset', subject_id='01', task_name='reading'):
        if not self.enabled:
            return

        # 1. Grab data and shut down session
        data = self.board.get_board_data() 
        self.board.stop_stream()
        self.board.release_session()
        
        data_points = data.shape[1]
        print(f"Data points grabbed: {data_points}")

        if data_points > 0:
            eeg_channels = BoardShim.get_eeg_channels(self.board_id)
            marker_channel = BoardShim.get_marker_channel(self.board_id)
            sample_rate = BoardShim.get_sampling_rate(self.board_id)

            # 2. Extract EEG (Convert microvolts to Volts)
            eeg_data = data[eeg_channels, :] / 1000000
            ch_names = [f'EEG{i+1}' for i in range(len(eeg_channels))]
            ch_types = ['eeg'] * len(eeg_channels)
            
            info = mne.create_info(ch_names=ch_names, sfreq=sample_rate, ch_types=ch_types)
            info['line_freq'] = 50.0 
            
            raw = mne.io.RawArray(eeg_data, info)
            raw.set_meas_date(pd.Timestamp.now(tz='UTC'))

            # 3. Extract Markers/Events
            events_list = []
            marker_row = data[marker_channel, :]
            for sample_index, val in enumerate(marker_row):
                if val != 0.0:
                    events_list.append([sample_index, 0, int(val)])

            # 4. Handle Event Formatting
            events = None
            event_id = None
            if len(events_list) > 0:
                events = np.array(events_list, dtype=int) # Fix for the TypeError
                unique_markers = np.unique(events[:, 2])
                event_id = {str(m): int(m) for m in unique_markers}

            # 5. Define BIDS Path and Write
            bids_path = BIDSPath(subject=subject_id, task=task_name, 
                                 datatype='eeg', root=bids_root)
            
            write_raw_bids(raw, bids_path, events=events, event_id=event_id,
                           allow_preload=True, overwrite=True, format='BrainVision')
            
            print(f" BIDS Dataset saved to: {path.abspath(bids_root)}")
        else:
            print(" No data points were found in the buffer. Folder remains empty.")
