import { TransformCallback } from 'stream';
import { BaseAudioProcessor } from './BaseAudioProcessor';
import { AudioProcessorOptions } from '../../types';
import { opus } from 'prism-media';

export class MP3Processor extends BaseAudioProcessor {
    private opusEncoder!: opus.Encoder;
    private readonly FRAME_SIZE = 960;
    private readonly CHANNELS = 2;
    private readonly SAMPLE_RATE = 48000;
    private readonly BYTES_PER_SAMPLE = 2;

    constructor(options: AudioProcessorOptions) {
        super(options);
        this.setupEncoder();
    }

    private setupEncoder() {
        console.log('[MP3Processor] Setting up encoder');
        this.opusEncoder = new opus.Encoder({
            rate: this.SAMPLE_RATE,
            channels: this.CHANNELS,
            frameSize: this.FRAME_SIZE
        });

        this.opusEncoder.on('error', (error) => {
            console.error('[MP3Processor] Encoder error:', error);
        });
    }

    protected async processBuffer(callback: TransformCallback): Promise<void> {
        try {
            const bytesPerFrame = this.FRAME_SIZE * this.CHANNELS * this.BYTES_PER_SAMPLE;

            while (this.buffer.length >= bytesPerFrame) {
                const frameData = this.buffer.subarray(0, bytesPerFrame);
                this.buffer = this.buffer.subarray(bytesPerFrame);

                // Convert to proper PCM format and ensure correct endianness
                const pcmData = this.convertToPCM(frameData);
                
                // Encode frame
                const encoded = this.opusEncoder.write(pcmData);
                if (encoded && Buffer.isBuffer(encoded)) {
                    this.push(encoded);
                }
            }
            callback();
        } catch (error) {
            console.error('[MP3Processor] Error processing buffer:', error);
            callback(error as Error);
        }
    }

    private convertToPCM(buffer: Buffer): Buffer {
        // Ensure we have an even number of bytes for 16-bit samples
        const sampleCount = Math.floor(buffer.length / 2);
        const pcmBuffer = Buffer.alloc(sampleCount * 2);

        // Convert samples to 16-bit PCM with correct endianness
        for (let i = 0; i < sampleCount; i++) {
            const sample = buffer.readInt16LE(i * 2);
            pcmBuffer.writeInt16LE(sample, i * 2);
        }

        return pcmBuffer;
    }

    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
        try {
            // Ensure chunk size is a multiple of our frame size
            const newBuffer = Buffer.alloc(this.buffer.length + chunk.length);
            this.buffer.copy(newBuffer);
            chunk.copy(newBuffer, this.buffer.length);
            this.buffer = newBuffer;

            this.processBuffer(callback);
        } catch (error) {
            console.error('[MP3Processor] Error in transform:', error);
            callback(error as Error);
        }
    }

    _flush(callback: TransformCallback): void {
        try {
            if (this.buffer.length > 0) {
                // Pad the remaining data to match frame size if needed
                const remainingBytes = this.buffer.length;
                const requiredBytes = this.FRAME_SIZE * this.CHANNELS * this.BYTES_PER_SAMPLE;
                
                if (remainingBytes < requiredBytes) {
                    const paddingSize = requiredBytes - remainingBytes;
                    const padding = Buffer.alloc(paddingSize);
                    this.buffer = Buffer.concat([this.buffer, padding]);
                }

                this.processBuffer(() => {
                    this.opusEncoder.destroy();
                    callback();
                });
            } else {
                this.opusEncoder.destroy();
                callback();
            }
        } catch (error) {
            console.error('[MP3Processor] Error in flush:', error);
            callback(error as Error);
        }
    }
}
