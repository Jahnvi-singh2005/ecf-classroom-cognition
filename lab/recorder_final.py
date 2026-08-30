#pip install brainflow, pylsl, pyserial, pandas, numpy
# stream data from cyton board using brainflow
#save local csv files with eeg data and markers with timestamps
from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds
import time

import argparse

parser = argparse.ArgumentParser()
parser.add_argument("-B", "--board", default="cyton_daisy",help="Board ID for BrainFlow")
parser.add_argument("-T", "--trigger", default="serial", choices=["serial", "websocket"])
args = parser.parse_args()

params = BrainFlowInputParams()
params.serial_port = 'COM3'  

board_id = BoardIds[args.board.upper() + "_BOARD"].value
board = BoardShim(board_id, params)

board.prepare_session()
board.config_board('/2')
board.start_stream()

#import triggers from webapp 
marker_log = []

import serial
marker_serial = serial.Serial('COM4', 115200, timeout=0.01)  # Adjust COM port and baud rate as needed


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
pd.DataFrame(data.T).to_csv(r"C:\Data\eeg\eeg_data.csv", index=False)
pd.DataFrame(marker_log).to_csv(r"C:\Data\eeg\marker_log.csv", index=False)
print("saved")
