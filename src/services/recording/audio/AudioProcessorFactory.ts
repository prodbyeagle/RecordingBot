import { AudioProcessorOptions } from '../types';
import { BaseAudioProcessor, MP3Processor, WAVProcessor } from './processors';

export class AudioProcessorFactory {
    static createProcessor(options: AudioProcessorOptions): BaseAudioProcessor {
        console.log(`[AudioProcessorFactory] Creating processor for format: ${options.format}`);
        
        switch (options.format.toLowerCase()) {
            case 'mp3':
                return new MP3Processor(options);
            case 'wav':
                return new WAVProcessor(options);
            default:
                throw new Error(`Unsupported audio format: ${options.format}`);
        }
    }
}
