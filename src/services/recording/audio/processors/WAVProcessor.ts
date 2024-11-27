import { TransformCallback } from 'stream';
import { BaseAudioProcessor } from './BaseAudioProcessor';
import { AudioProcessorOptions } from '../../types';

/**
 * WAV Audio Format Constants
 */
const WAV_CONSTANTS = {
    RIFF_HEADER_SIZE: 44,
    SAMPLE_SIZE: 16, // 16-bit audio
    FORMAT_PCM: 1,
    BYTES_PER_SAMPLE: 2
} as const;

/**
 * WAVProcessor - Handles the conversion and processing of audio data to WAV format
 */
export class WAVProcessor extends BaseAudioProcessor {
    private totalDataSize: number = 0;
    private readonly headerChunk: Buffer;
    private readonly bytesPerFrame: number;
    private dataChunks: Buffer[] = [];

    constructor(options: AudioProcessorOptions) {
        super(options);
        this.bytesPerFrame = this.options.channels * WAV_CONSTANTS.BYTES_PER_SAMPLE;
        this.headerChunk = this.createWavHeader();

        console.log(`[WAVProcessor] Initialized with:
            - Channels: ${this.options.channels}
            - Sample Rate: ${this.options.sampleRate}
            - Bytes per Frame: ${this.bytesPerFrame}`);
    }

    private createWavHeader(): Buffer {
        const header = Buffer.alloc(WAV_CONSTANTS.RIFF_HEADER_SIZE);
        let offset = 0;

        // RIFF chunk descriptor
        header.write('RIFF', offset); offset += 4;
        header.writeUInt32LE(0, offset); offset += 4; // File size (updated later)
        header.write('WAVE', offset); offset += 4;

        // Format chunk
        header.write('fmt ', offset); offset += 4;
        header.writeUInt32LE(16, offset); offset += 4; // Format chunk size
        header.writeUInt16LE(WAV_CONSTANTS.FORMAT_PCM, offset); offset += 2; // Audio format (PCM)
        header.writeUInt16LE(this.options.channels, offset); offset += 2; // Channels
        header.writeUInt32LE(this.options.sampleRate, offset); offset += 4; // Sample rate

        const byteRate = this.options.sampleRate * this.options.channels * WAV_CONSTANTS.BYTES_PER_SAMPLE;
        const blockAlign = this.options.channels * WAV_CONSTANTS.BYTES_PER_SAMPLE;

        header.writeUInt32LE(byteRate, offset); offset += 4; // Byte rate
        header.writeUInt16LE(blockAlign, offset); offset += 2; // Block align
        header.writeUInt16LE(WAV_CONSTANTS.SAMPLE_SIZE, offset); offset += 2; // Bits per sample

        // Data chunk header
        header.write('data', offset); offset += 4;
        header.writeUInt32LE(0, offset); // Data size (updated later)

        return header;
    }

    private updateWavHeader(): Buffer {
        const finalHeader = Buffer.from(this.headerChunk);
        const fileSize = this.totalDataSize + WAV_CONSTANTS.RIFF_HEADER_SIZE - 8;
        finalHeader.writeUInt32LE(fileSize, 4); // Update file size
        finalHeader.writeUInt32LE(this.totalDataSize, 40); // Update data size
        return finalHeader;
    }

    private convertToPCM(buffer: Buffer): Buffer {
        // Convert the incoming Opus data to PCM format
        const samples = new Int16Array(buffer.length / 2);
        
        // Process each sample
        for (let i = 0; i < samples.length; i++) {
            // Read the sample in the correct format (little-endian)
            const sample = buffer.readInt16LE(i * 2);
            
            // Normalize and convert to 16-bit PCM
            const normalizedSample = Math.max(-32768, Math.min(32767, sample));
            samples[i] = normalizedSample;
        }

        // Convert back to buffer
        return Buffer.from(samples.buffer);
    }

    protected processBuffer(callback: TransformCallback): void {
        try {
            // Write WAV header on first chunk
            if (this.isFirstChunk) {
                this.push(this.headerChunk);
                this.isFirstChunk = false;
            }

            if (this.buffer.length > 0) {
                // Process complete frames only
                const frameCount = Math.floor(this.buffer.length / this.bytesPerFrame);
                const processableSize = frameCount * this.bytesPerFrame;

                if (processableSize > 0) {
                    // Extract and process the audio data
                    const rawChunk = this.buffer.subarray(0, processableSize);
                    this.buffer = this.buffer.subarray(processableSize);

                    // Convert to PCM format
                    const audioChunk = this.convertToPCM(rawChunk);

                    // Update total size and store chunk
                    this.totalDataSize += audioChunk.length;
                    this.dataChunks.push(audioChunk);

                    // Push processed audio data
                    this.push(audioChunk);
                }
            }

            callback();
        } catch (error) {
            console.error('[WAVProcessor] Error processing buffer:', error);
            callback(error as Error);
        }
    }

    _flush(callback: TransformCallback): void {
        try {
            if (this.buffer.length > 0) {
                // Pad to nearest frame if necessary
                const remainingBytes = this.buffer.length;
                const paddingSize = this.bytesPerFrame - (remainingBytes % this.bytesPerFrame);

                if (paddingSize < this.bytesPerFrame) {
                    const padding = Buffer.alloc(paddingSize);
                    this.buffer = Buffer.concat([this.buffer, padding]);
                }

                // Process the final chunk
                const rawChunk = this.buffer;
                const finalChunk = this.convertToPCM(rawChunk);
                this.totalDataSize += finalChunk.length;
                this.dataChunks.push(finalChunk);
                this.push(finalChunk);
            }

            // Write the final header with correct sizes
            const finalHeader = this.updateWavHeader();
            this.push(finalHeader);

            // Clear stored chunks to free memory
            this.dataChunks = [];

            callback();
        } catch (error) {
            console.error('[WAVProcessor] Error in flush:', error);
            callback(error as Error);
        }
    }

    public getDuration(): number {
        return this.totalDataSize / (this.options.sampleRate * this.options.channels * WAV_CONSTANTS.BYTES_PER_SAMPLE);
    }
}
