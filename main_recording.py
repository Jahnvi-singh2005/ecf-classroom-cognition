import serial 
import time
import sys
import os
from BrainflowStream import BrainFlowBoard


# creating the bids folder 
script_dir = os.path.dirname(os.path.abspath(__file__))
bids_folder = os.path.join(script_dir, "my_bids_data")

BOARD_TYPE = 'cyton-daisy' # 'synthetic' for testing, 'cyton-daisy' for experiment


if sys.platform.startswith('win'):
    # WINDOWS SETTINGS
    # Find the appropriate ports as per the device !!!
    EEG_PORT = 'COM7'
    MARKER_PORT = 'COM4'

  

def run_experiment():


    sub_id = input("Enter Subject ID (e.g., 01, 02): ")
    # initialise the board
    eeg_board = BrainFlowBoard(board_name=BOARD_TYPE, default_port=EEG_PORT)

    # open serial port

    marker_serial = None

    try:
        marker_serial = serial.Serial(MARKER_PORT, baudrate=115200, timeout=0.001)
        print(f" Listening for hardware markers on {MARKER_PORT}")
    except Exception:
        print(f" Serial port {MARKER_PORT} not found.")
        print(" SIMULATION MODE: Press Ctrl+C to stop and save.")

    print("\n--- RECORDING STARTED ---")

    while True:
        try:
            # Check for REAL serial markers if port is open
            if marker_serial and marker_serial.in_waiting > 0:
                byte_data = marker_serial.read(1)
                marker_val = int.from_bytes(byte_data, byteorder='big')
                eeg_board.insert_marker(marker_val)
                print(f" Hardware Marker Injected: {marker_val}")

        except KeyboardInterrupt:
            print("\n⏹ Stopping recording and packaging BIDS data...")
            break
    eeg_board.stop_and_save(
        bids_root=bids_folder, 
        subject_id=sub_id, 
        task_name='reading'
    )

    if marker_serial:
        marker_serial.close()

if __name__ == "__main__":
    run_experiment()        
