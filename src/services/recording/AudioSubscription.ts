import { WriteStream } from 'fs';
import { BaseAudioProcessor } from './audio';

export class AudioSubscription {
    constructor(
        private userId: string,
        private processor: BaseAudioProcessor,
        private fileStream: WriteStream
    ) {
        this.setupErrorHandlers();
    }

    private setupErrorHandlers() {
        this.processor.on('error', (error) => {
            console.error(`[AudioSubscription] Processor error for ${this.userId}:`, error);
        });

        this.fileStream.on('error', (error) => {
            console.error(`[AudioSubscription] File stream error for ${this.userId}:`, error);
        });
    }

    public processAudioData(data: Buffer): void {
        this.processor.write(data);
    }

    public stop(): void {
        this.processor.end();
        this.fileStream.end();
    }

    public getStats() {
        return this.processor.getStats();
    }
}
