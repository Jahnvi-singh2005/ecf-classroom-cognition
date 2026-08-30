#LSL receiver script
from pylsl import StreamInfo, StreamInlet, resolve_byprop

#find streams on network
eeg_inlet = StreamInlet(resolve_byprop('name', 'CytonDaisyEEG', timeout=5)[0])
marker_inlet = StreamInlet(resolve_byprop('name', 'ExperimentMarkers')[0])

print("connected")

try:
    while True:

        sample, timestamp = eeg_inlet.pull_sample(timeout=1.0)
        if sample:
            print(timestamp, sample[:3])

        marker, m_timestamp = marker_inlet.pull_sample(timeout=0.0)
        if marker:
            print("MARKER", m_timestamp, marker[0])

except KeyboardInterrupt:
    print("\nStopped")

finally:
    eeg_inlet.close_stream()
    marker_inlet.close_stream()