import { Transform, TransformCallback } from 'stream';
import { AudioProcessorOptions } from '../../types';

export abstract class BaseAudioProcessor extends Transform {
    protected buffer: Buffer = Buffer.alloc(0);
    protected readonly CHUNK_SIZE = 16384;
    protected isFirstChunk: boolean = true;
    protected totalSamples: number = 0;
    protected peakAmplitude: number = 0;
    protected sumAmplitude: number = 0;
    protected silentSegments: number = 0;

    constructor(protected options: AudioProcessorOptions) {
        super();
    }

    _transform(chunk: Buffer, encoding: string, callback: TransformCallback): void {
        try {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            this.processBuffer(callback);
        } catch (error) {
            console.error(`[${this.constructor.name}] Error in transform:`, error);
            callback(error as Error);
        }
    }

    protected abstract processBuffer(callback: TransformCallback): void;

    public getStats() {
        return {
            peakAmplitude: this.peakAmplitude,
            averageAmplitude: this.sumAmplitude / this.totalSamples,
            silentSegments: this.silentSegments,
            totalSamples: this.totalSamples
        };
    }

    protected processAudioData(data: Buffer): Buffer {
        if (data.length === 0) return Buffer.alloc(0);

        const samples = new Int16Array(data.buffer, data.byteOffset, data.length / 2);
        const processedSamples = new Int16Array(samples.length);

        let maxAmplitude = 0;
        let sumAmplitude = 0;

        for (let i = 0; i < samples.length; i++) {
            const sample = samples[i];
            const amplitude = sample === 0 ? -Infinity : 20 * Math.log10(Math.abs(sample) / 32768);

            maxAmplitude = Math.max(maxAmplitude, Math.abs(sample));
            sumAmplitude += Math.abs(sample);
            processedSamples[i] = sample;
        }

        this.totalSamples += samples.length;
        this.peakAmplitude = Math.max(this.peakAmplitude, maxAmplitude);
        this.sumAmplitude += sumAmplitude;

        return Buffer.from(processedSamples.buffer);
    }
}
