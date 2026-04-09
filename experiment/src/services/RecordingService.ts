/**
 * RecordingService — manages screen and front camera recording
 * using the browser's MediaRecorder API.
 *
 * Flow:
 *   1. requestPermissions() — prompts user for screen + camera access
 *   2. startAll()           — begins recording both streams
 *   3. stopAll()            — stops both, downloads one .zip archive containing both recordings
 */

import JSZip from 'jszip';

export interface RecordingFiles {
    screen: Blob | null;
    camera: Blob | null;
    archive: Blob | null;
}

export class RecordingService {
    private screenStream: MediaStream | null = null;
    private cameraStream: MediaStream | null = null;
    private screenRecorder: MediaRecorder | null = null;
    private cameraRecorder: MediaRecorder | null = null;
    private screenChunks: Blob[] = [];
    private cameraChunks: Blob[] = [];
    private participantName = '';
    private isRecording = false;
    private recordingMimeType = 'video/webm';

    /**
     * Request both screen-share and camera permissions.
     * Throws if either is denied.
     */
    async requestPermissions(): Promise<void> {
        this.stopStreams();

        // Request screen share
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
        });

        // Request front camera
        this.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false,
        });
    }

    /**
     * Start recording both streams. Must call requestPermissions() first.
     */
    startAll(participantName: string): void {
        if (!this.screenStream || !this.cameraStream) {
            throw new Error('Permissions must be granted before recording starts.');
        }

        if (this.isRecording) {
            return;
        }

        this.participantName = participantName;
        this.screenChunks = [];
        this.cameraChunks = [];
        this.recordingMimeType = this.getSupportedMimeType();

        if (this.screenStream) {
            this.screenRecorder = new MediaRecorder(this.screenStream, {
                mimeType: this.recordingMimeType,
            });
            this.screenRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.screenChunks.push(e.data);
            };
            this.screenRecorder.start(1000); // collect chunks every 1s
        }

        if (this.cameraStream) {
            this.cameraRecorder = new MediaRecorder(this.cameraStream, {
                mimeType: this.recordingMimeType,
            });
            this.cameraRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.cameraChunks.push(e.data);
            };
            this.cameraRecorder.start(1000);
        }

        this.isRecording = true;
    }

    /**
     * Stop both recordings and download the files.
     */
    async stopAll(): Promise<RecordingFiles> {
        if (!this.isRecording && !this.screenStream && !this.cameraStream) {
            return { screen: null, camera: null, archive: null };
        }

        const [screenBlob, cameraBlob] = await Promise.all([
            this.stopRecorder(this.screenRecorder, this.screenChunks),
            this.stopRecorder(this.cameraRecorder, this.cameraChunks),
        ]);

        // Stop all tracks to release hardware
        this.stopStreams();

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeName = this.participantName.replace(/[^a-zA-Z0-9]/g, '_');
        const extension = this.recordingMimeType.includes('mp4') ? 'mp4' : 'webm';

        const filesToZip: Array<{ filename: string; blob: Blob }> = [];
        if (screenBlob) {
            filesToZip.push({
                filename: `screen_recording_${safeName}_${timestamp}.${extension}`,
                blob: screenBlob,
            });
        }
        if (cameraBlob) {
            filesToZip.push({
                filename: `camera_recording_${safeName}_${timestamp}.${extension}`,
                blob: cameraBlob,
            });
        }

        let archiveBlob: Blob | null = null;
        if (filesToZip.length > 0) {
            archiveBlob = await this.createZipArchive(filesToZip);
            this.downloadBlob(archiveBlob, `recordings_${safeName}_${timestamp}.zip`);
        }

        // Cleanup
        this.screenRecorder = null;
        this.cameraRecorder = null;
        this.isRecording = false;

        return { screen: screenBlob, camera: cameraBlob, archive: archiveBlob };
    }

    // ─── Private Helpers ────────────────────────────────────────

    private stopRecorder(recorder: MediaRecorder | null, chunks: Blob[]): Promise<Blob | null> {
        return new Promise((resolve) => {
            if (!recorder || recorder.state === 'inactive') {
                resolve(chunks.length > 0 ? new Blob(chunks, { type: chunks[0].type }) : null);
                return;
            }
            recorder.onstop = () => {
                const blob = chunks.length > 0 ? new Blob(chunks, { type: chunks[0].type }) : null;
                resolve(blob);
            };
            recorder.stop();
        });
    }

    private downloadBlob(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private createZipArchive(files: Array<{ filename: string; blob: Blob }>): Promise<Blob> {
        const zip = new JSZip();
        files.forEach((file) => {
            zip.file(file.filename, file.blob);
        });

        return zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 },
        });
    }

    private getSupportedMimeType(): string {
        const types = [
            'video/mp4',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return 'video/webm';
    }

    private stopStreams(): void {
        this.screenStream?.getTracks().forEach((t) => t.stop());
        this.cameraStream?.getTracks().forEach((t) => t.stop());
        this.screenStream = null;
        this.cameraStream = null;
    }
}
