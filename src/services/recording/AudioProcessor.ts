import { Transform, TransformCallback } from 'stream';
import { RecordingOptions } from './types';

export class AudioProcessor extends Transform {
    private buffer: Buffer = Buffer.alloc(0);
    private silenceThreshold: number;
    private sampleRate: number;
    private channels: number;
    private totalSamples: number = 0;
    private peakAmplitude: number = 0;
    private sumAmplitude: number = 0;
    private silentSegments: number = 0;
    private lastNonSilentTime: number = Date.now();

    constructor(options: RecordingOptions) {
        super();
        this.silenceThreshold = options.silenceThreshold || -50;
        this.sampleRate = options.sampleRate || 48000;
        this.channels = options.channels || 2;
    }

    _transform(chunk: Buffer, encoding: string, callback: TransformCallback): void {
        try {
            // Add the new chunk to our buffer
            this.buffer = Buffer.concat([this.buffer, chunk]);

            // Process complete frames (2 bytes per sample per channel)
            const frameSize = 2 * this.channels;
            const completeFrames = Math.floor(this.buffer.length / frameSize);
            
            if (completeFrames > 0) {
                const processableSize = completeFrames * frameSize;
                const processableData = this.buffer.slice(0, processableSize);
                this.buffer = this.buffer.slice(processableSize);

                // Process the audio data
                const processedData = this.processAudioData(processableData);
                
                // Push the processed data
                this.push(processedData);
            }

            callback();
        } catch (error) {
            callback(error as Error);
        }
    }

    private processAudioData(data: Buffer): Buffer {
        const samples = new Int16Array(data.buffer, data.byteOffset, data.length / 2);
        const processedSamples = new Int16Array(samples.length);

        let isSilent = true;
        let maxAmplitude = 0;
        let sumAmplitude = 0;

        // Process each sample
        for (let i = 0; i < samples.length; i++) {
            let sample = samples[i];

            // Calculate amplitude in dB
            const amplitude = sample === 0 ? -Infinity : 20 * Math.log10(Math.abs(sample) / 32768);

            // Update statistics
            maxAmplitude = Math.max(maxAmplitude, Math.abs(sample));
            sumAmplitude += Math.abs(sample);

            // Apply noise gate
            if (amplitude > this.silenceThreshold) {
                isSilent = false;
                this.lastNonSilentTime = Date.now();
            }

            // Apply processing
            if (!isSilent) {
                // Here you can add more audio processing:
                // - Noise suppression
                // - Echo cancellation
                // - Normalization
                // For now, we'll just pass through the sample
                processedSamples[i] = sample;
            } else {
                processedSamples[i] = 0;
            }
        }

        // Update statistics
        this.totalSamples += samples.length;
        this.peakAmplitude = Math.max(this.peakAmplitude, maxAmplitude);
        this.sumAmplitude += sumAmplitude;

        // Check if this segment was silent
        if (isSilent) {
            this.silentSegments++;
        }

        return Buffer.from(processedSamples.buffer);
    }

    public getStats() {
        return {
            peakAmplitude: this.peakAmplitude,
            averageAmplitude: this.sumAmplitude / this.totalSamples,
            silentSegments: this.silentSegments,
            lastNonSilentTime: this.lastNonSilentTime
        };
    }

    _flush(callback: TransformCallback): void {
        // Process any remaining data in the buffer
        if (this.buffer.length > 0) {
            const processedData = this.processAudioData(this.buffer);
            this.push(processedData);
        }
        callback();
    }
}
