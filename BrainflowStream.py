# dependencies 
# pip install mne mne-bids numpy pandas brainflow pyserial pybv

# --- install these on windows setup 
# python -m pip install brainflow mne mne-bids pybv pyserial pandas

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
    'cyton-daisy':BoardIds.CYTON_DAISY_BOARD.value,
}

# Function to list available ports
def list_ports():
    return [port.device for port in lp.comports()]

class BrainFlowBoard:
    def __init__(self, board_name, default_port='COM7'):
        self.enabled = board_name!='none'

        if not self.enabled:
            print("BrainFlow board setup is disabled.")
            return
        
        BoardShim.enable_dev_board_logger()

        # Set up BrainFlow parameters
        self.params = BrainFlowInputParams()

        available_ports = list_ports()
        if default_port not in available_ports:
            if available_ports:
                default_port = available_ports[0]
                print(f"Using port {default_port} instead of COM7")
            else:
                raise ValueError("No available serial ports found. Please check your device connection.")

        self.params.serial_port = default_port

        # Initialize the BrainFlow board
        self.board_name = board_name.lower()
        self.board_id = board_ids.get(board_name.lower())
        self.board = BoardShim(self.board_id, self.params)

        print(BoardShim.get_board_descr(self.board_id))

        self.board.prepare_session()
        print(f"Board {board_name} initialized on port {default_port}.")
        self.board.start_stream()

    def insert_marker(self, marker):
        """
        Insert a marker into the BrainFlow stream.
        """
        if self.enabled:
            self.board.insert_marker(marker)
    
    def get_ch_names(self):
        if self.board_name == 'cyton':
            return [
                'pkt', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8',
                'acx', 'acy', 'acz', 'oth1', 'oth2', 'oth3', 'oth4', 'oth5',
                'oth6', 'oth7', 'ana1', 'ana2', 'ana3', 'timestamp', 'marker'
            ]
        elif self.board_name == 'cyton-daisy':
            return [
                'pkt', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8',
                'ch9', 'ch10', 'ch11', 'ch12', 'ch13', 'ch14', 'ch15', 'ch16',
                'acx', 'acy', 'acz', 'oth1', 'oth2', 'oth3', 'oth4', 'oth5',
                'oth6', 'oth7', 'ana1', 'ana2', 'ana3', 'timestamp', 'marker'
            ]
        elif self.board_name == 'synthetic':
            return [f'ch{i}' for i in range(1, 33)]
        else:
            return []
        
    def get_board_data(self):
        """
        Get the current board data.
        """
        if self.enabled:
            return self.board.get_board_data()
        else:
            print("BrainFlow board is not enabled.")
            return None

    def stop_and_save(self, bids_root='./bids_dataset', subject_id='01', task_name='reading'):
        """
        Stop the BrainFlow stream, save it BIDS format and release resources.
        """
        if self.enabled:
            # get the board data
            data = self.board.get_board_data()
            self.board.stop_stream()
            self.board.release_session()
            print("BrainFlow stream stopped and session released.")

            # Save EEG data (in BIDS format)
            if data.shape[1] > 0:
                channel_names = self.get_ch_names()

                # Identifying EEG and Markers 
                eeg_channels = BoardShim.get_eeg_channels(self.board_id)
                marker_channel = BoardShim.get_marker_channel(self.board_id)
                sample_rate = BoardShim.get_sampling_rate(self.board_id)

                # extract EEG data, convert microvolts to volts (MNE requirement)

                eeg_data = data[eeg_channels, :]/1000000

                # MNE info objects (metadata)
                ch_names = [f'EEG{i+1}' for i in range(len(eeg_channels))]
                ch_types = ['eeg'] * len(eeg_channels)
                info = mne.create_info(ch_names=ch_names, sfreq=sample_rate, ch_types=ch_types)
                info['line_freq'] = 50.0 # required by MNE
                # raw data object
                raw = mne.io.RawArray(eeg_data,info)

                events = []
                # channel for markers
                timestamp_row = data[marker_channel, :]

                for sample_index, val in enumerate(timestamp_row):
                    if val != 0.0:
                        events.append([sample_index, 0, int(val)])

                
                events = np.array(events) if len(events) > 0 else None        

                bids_path = BIDSPath(subject=subject_id, task=task_name, 
                                     datatype='eeg', root=bids_root)
                
                write_raw_bids(raw, bids_path, events=events, 
                               allow_preload=True,overwrite=True, format='BrainVision')
                
                print(f" BIDS Dataset saved to: {bids_root}")


            else:
                print("No EEG data collected. Check your device connection and settings.")
