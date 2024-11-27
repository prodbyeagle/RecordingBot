// import { Transform, TransformCallback } from 'stream';
// import { RecordingOptions } from './types';
// import { Lame } from 'node-lame';
// import { Readable } from 'stream';

// export class AudioProcessor extends Transform {
//     private buffer: Buffer = Buffer.alloc(0);
//     private silenceThreshold: number;
//     private sampleRate: number;
//     private channels: number;
//     private format: string;
//     private bitrate: number;
//     private mp3Encoder?: Lame;
//     private mp3Buffer: Buffer = Buffer.alloc(0);
//     private readonly CHUNK_SIZE = 16384; // Process in larger chunks for MP3
//     private isFirstChunk: boolean = true;
//     private totalSamples: number = 0;
//     private peakAmplitude: number = 0;
//     private sumAmplitude: number = 0;
//     private silentSegments: number = 0;

//     constructor(options: RecordingOptions) {
//         super();
//         this.silenceThreshold = options.silenceThreshold || -50;
//         this.sampleRate = options.sampleRate || 48000;
//         this.channels = options.channels || 2;
//         this.format = options.format || 'wav';
//         this.bitrate = options.bitrate || 128;

//         console.log(`[AudioProcessor] Initializing with format: ${this.format}`);
//         if (this.format === 'mp3') {
//             this.setupMp3Encoder();
//         }
//     }

//     private setupMp3Encoder() {
//         console.log('[AudioProcessor] Setting up MP3 encoder');
//         this.mp3Encoder = new Lame({
//             output: 'buffer',
//             bitrate: 128 as const,
//             raw: true,
//             sfreq: 48 as const,
//             mode: this.channels === 2 ? 'j' : 's',
//             'to-mono': this.channels === 1,
//             quality: 5 as const // Higher quality encoding
//         });
//     }

//     _transform(chunk: Buffer, encoding: string, callback: TransformCallback): void {
//         try {
//             // Add incoming chunk to our buffer
//             this.buffer = Buffer.concat([this.buffer, chunk]);

//             if (this.format === 'mp3') {
//                 this.handleMp3Chunks(callback);
//             } else {
//                 this.handleWavChunks(callback);
//             }
//         } catch (error) {
//             console.error('[AudioProcessor] Error in transform:', error);
//             callback(error as Error);
//         }
//     }

//     private async handleMp3Chunks(callback: TransformCallback) {
//         try {
//             // Process in larger chunks for better MP3 encoding
//             while (this.buffer.length >= this.CHUNK_SIZE) {
//                 const processableData = this.buffer.slice(0, this.CHUNK_SIZE);
//                 this.buffer = this.buffer.slice(this.CHUNK_SIZE);

//                 if (!this.mp3Encoder) {
//                     console.error('[AudioProcessor] MP3 encoder not initialized');
//                     callback(new Error('MP3 encoder not initialized'));
//                     return;
//                 }

//                 // Convert to proper PCM format
//                 const samples = new Int16Array(processableData.buffer, processableData.byteOffset, processableData.length / 2);
//                 const pcmBuffer = Buffer.from(samples.buffer);

//                 // Encode to MP3
//                 await this.mp3Encoder.setBuffer(pcmBuffer);
//                 await this.mp3Encoder.encode();
//                 const mp3Data = this.mp3Encoder.getBuffer();

//                 if (mp3Data && mp3Data.length > 0) {
//                     this.push(mp3Data);
//                 }
//             }
//             callback();
//         } catch (error) {
//             console.error('[AudioProcessor] Error encoding MP3:', error);
//             callback(error as Error);
//         }
//     }

//     private handleWavChunks(callback: TransformCallback) {
//         // Add WAV header for first chunk
//         if (this.isFirstChunk) {
//             const header = this.createWavHeader();
//             this.push(header);
//             this.isFirstChunk = false;
//         }

//         // Process complete frames (2 bytes per sample per channel)
//         const frameSize = 2 * this.channels;
//         const completeFrames = Math.floor(this.buffer.length / frameSize);
        
//         if (completeFrames > 0) {
//             const processableSize = completeFrames * frameSize;
//             const processableData = this.buffer.slice(0, processableSize);
//             this.buffer = this.buffer.slice(processableSize);

//             const processedData = this.processAudioData(processableData);
//             if (processedData.length > 0) {
//                 this.push(processedData);
//             }
//         }

//         callback();
//     }

//     private processAudioData(data: Buffer): Buffer {
//         if (data.length === 0) return Buffer.alloc(0);

//         const samples = new Int16Array(data.buffer, data.byteOffset, data.length / 2);
//         const processedSamples = new Int16Array(samples.length);

//         let maxAmplitude = 0;
//         let sumAmplitude = 0;

//         // Process each sample
//         for (let i = 0; i < samples.length; i++) {
//             const sample = samples[i];

//             // Calculate amplitude in dB
//             const amplitude = sample === 0 ? -Infinity : 20 * Math.log10(Math.abs(sample) / 32768);

//             // Update statistics
//             maxAmplitude = Math.max(maxAmplitude, Math.abs(sample));
//             sumAmplitude += Math.abs(sample);

//             // Store the processed sample
//             processedSamples[i] = sample;
//         }

//         // Update statistics
//         this.totalSamples += samples.length;
//         this.peakAmplitude = Math.max(this.peakAmplitude, maxAmplitude);
//         this.sumAmplitude += sumAmplitude;

//         return Buffer.from(processedSamples.buffer);
//     }

//     private createWavHeader(): Buffer {
//         const header = Buffer.alloc(44);
        
//         // RIFF chunk descriptor
//         header.write('RIFF', 0);
//         header.writeUInt32LE(0, 4); // File size (will be filled later)
//         header.write('WAVE', 8);
        
//         // Format chunk
//         header.write('fmt ', 12);
//         header.writeUInt32LE(16, 16); // Format chunk size
//         header.writeUInt16LE(1, 20); // Audio format (PCM)
//         header.writeUInt16LE(this.channels, 22); // Number of channels
//         header.writeUInt32LE(this.sampleRate, 24); // Sample rate
//         header.writeUInt32LE(this.sampleRate * this.channels * 2, 28); // Byte rate
//         header.writeUInt16LE(this.channels * 2, 32); // Block align
//         header.writeUInt16LE(16, 34); // Bits per sample
        
//         // Data chunk
//         header.write('data', 36);
//         header.writeUInt32LE(0, 40); // Data size (will be filled later)
        
//         return header;
//     }

//     public getStats() {
//         return {
//             peakAmplitude: this.peakAmplitude,
//             averageAmplitude: this.sumAmplitude / this.totalSamples,
//             silentSegments: this.silentSegments,
//             totalSamples: this.totalSamples
//         };
//     }

//     _flush(callback: TransformCallback): void {
//         // Process any remaining data in the buffer
//         if (this.buffer.length > 0) {
//             const processedData = this.processAudioData(this.buffer);
//             this.push(processedData);
//         }
//         callback();
//     }
// }
