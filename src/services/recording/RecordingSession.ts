import { VoiceChannel, User } from 'discord.js';
import { 
    VoiceConnection, 
    VoiceConnectionStatus, 
    VoiceReceiver, 
    joinVoiceChannel,
    getVoiceConnection,
    DiscordGatewayAdapterCreator,
    EndBehaviorType
} from '@discordjs/voice';
import { 
    RecordingOptions, 
    RecordingMetadata, 
    RecordingStats, 
    RecordingEvent, 
    RecordingEventData,
    AudioProcessorOptions,
    AudioFormat 
} from './types';
import { AudioProcessorFactory } from './audio/AudioProcessorFactory';
import { BaseAudioProcessor } from './audio/processors/BaseAudioProcessor';
import { EventEmitter } from 'events';
import { existsSync, mkdirSync, createWriteStream, WriteStream } from 'fs';
import { join } from 'path';
import { Transform } from 'stream';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { unlink } from 'fs/promises';
import prism from 'prism-media';

class AudioBuffer extends Transform {
    private buffer: Buffer[] = [];
    private readonly maxBufferSize: number;
    public isSpeaking: boolean = false;
    private silenceBuffer: Buffer;
    private silenceCount: number = 0;
    private readonly silenceLogInterval: number = 50; // Log alle 50 Silence-Chunks

    constructor(maxBufferSize: number = 1024 * 16) {
        super();
        this.maxBufferSize = maxBufferSize;
        // 20ms von Stille (960 Samples * 2 Channels * 2 Bytes pro Sample)
        this.silenceBuffer = Buffer.alloc(960 * 2 * 2, 0);
    }

    public setSpeaking(speaking: boolean) {
        this.isSpeaking = speaking;
        if (!speaking) {
            this.silenceCount = 0;
        }
    }

    _transform(chunk: Buffer, encoding: string, callback: Function) {
        if (this.isSpeaking) {
            this.buffer.push(chunk);
        } else {
            // Wenn nicht gesprochen wird, sende Stille
            this.push(this.silenceBuffer);
            this.silenceCount++;
            
            // Log alle X Silence-Chunks (1 Chunk = 20ms)
            if (this.silenceCount % this.silenceLogInterval === 0) {
                const silenceMs = this.silenceCount * 20;
                console.log(`[RecordingSession] Added ${silenceMs}ms of silence`);
            }
        }
        
        if (this.getBufferSize() >= this.maxBufferSize) {
            const concatenated = Buffer.concat(this.buffer);
            this.buffer = [];
            this.push(concatenated);
        }
        
        callback();
    }

    _flush(callback: Function) {
        if (this.buffer.length > 0) {
            this.push(Buffer.concat(this.buffer));
        }
        callback();
    }

    private getBufferSize(): number {
        return this.buffer.reduce((total, buf) => total + buf.length, 0);
    }
}

export class RecordingSession extends EventEmitter {
    private voiceConnection?: VoiceConnection;
    private voiceReceiver?: VoiceReceiver;
    private metadata: RecordingMetadata;
    private stats: RecordingStats;
    private audioBuffers: Map<string, AudioBuffer> = new Map();
    private opusDecoders: Map<string, prism.opus.Decoder> = new Map();
    private _isActive: boolean = false;
    private tempPCMFile: string;
    private pcmStream?: WriteStream;
    private readonly outputFormat: AudioFormat;

    constructor(
        private channel: VoiceChannel,
        private initiator: User,
        private options: RecordingOptions,
        private audioProcessorFactory: AudioProcessorFactory
    ) {
        super();
        this.validateAudioOptions(options);
        
        this.outputFormat = options.format || 'wav';
        this.tempPCMFile = join(
            options.storageDir || './recordings',
            `${this.generateSessionId()}.pcm`
        );
        
        this.metadata = {
            sessionId: this.generateSessionId(),
            guildId: this.channel.guild.id,
            channelId: this.channel.id,
            startTime: new Date(),
            options: this.options,
            participants: [],
            initiator: initiator.id
        };

        this.stats = {
            peakAmplitude: 0,
            averageAmplitude: 0,
            silentSegments: 0,
            totalSamples: 0
        };
    }

    private validateAudioOptions(options: RecordingOptions): void {
        if (!options.sampleRate || options.sampleRate !== 48000) {
            throw new Error('Sample rate must be 48000Hz for Discord compatibility');
        }

        if (!options.channels || options.channels !== 2) {
            throw new Error('Channels must be 2 for stereo audio');
        }

        if (!options.bitrate || options.bitrate < 64000 || options.bitrate > 384000) {
            throw new Error('Bitrate must be between 64000bps and 384000bps');
        }

        if (options.format && !['wav', 'mp3'].includes(options.format)) {
            throw new Error('Supported formats are wav and mp3');
        }
    }

    private generateSessionId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private async convertToFormat(inputPath: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const args = [
                '-f', 's16le',        // Input format: signed 16-bit little-endian
                '-ar', '48000',       // Sample rate: 48kHz
                '-ac', '2',           // Channels: 2 (stereo)
                '-i', inputPath       // Input file
            ];

            if (this.outputFormat === 'mp3') {
                args.push(
                    '-c:a', 'libmp3lame',
                    '-b:a', `${this.options.bitrate / 1000}k`
                );
            } else {
                args.push('-f', 'wav');
            }

            args.push(outputPath);

            const ffmpeg = spawn('ffmpeg', args);

            ffmpeg.stderr.on('data', (data) => {
                console.log(`[FFmpeg] ${data}`);
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg process exited with code ${code}`));
                }
            });

            ffmpeg.on('error', (err) => {
                reject(err);
            });
        });
    }

    public async start(): Promise<void> {
        try {
            let existingConnection = getVoiceConnection(this.channel.guild.id);
            if (existingConnection) {
                existingConnection.destroy();
            }

            const adapterCreator = this.channel.guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator;

            this.voiceConnection = joinVoiceChannel({
                channelId: this.channel.id,
                guildId: this.channel.guild.id,
                adapterCreator,
                selfDeaf: false,
                selfMute: true
            });

            this._isActive = true;

            const recordingsDir = this.options.storageDir || './recordings';
            if (!existsSync(recordingsDir)) {
                mkdirSync(recordingsDir, { recursive: true });
            }

            this.pcmStream = createWriteStream(this.tempPCMFile);

            this.voiceConnection.on('stateChange', async (_, newState) => {
                if (newState.status === VoiceConnectionStatus.Ready) {
                    this.voiceReceiver = this.voiceConnection?.receiver;
                    await this.setupRecording();
                }
            });

            this.voiceConnection.on('error', async (error) => {
                console.error('[RecordingSession] Voice connection error:', error);
                await this.handleError(error);
            });

            this.voiceConnection.on('stateChange', async (_, newState) => {
                if (newState.status === VoiceConnectionStatus.Disconnected) {
                    try {
                        await Promise.race([
                            this.waitForConnectionState(VoiceConnectionStatus.Ready, 5_000),
                            this.waitForConnectionState(VoiceConnectionStatus.Signalling, 5_000),
                        ]);
                    } catch (error) {
                        this.voiceConnection?.destroy();
                        await this.stop();
                    }
                }
            });

            const members = this.channel.members;
            members.forEach(member => {
                if (!member.user.bot) {
                    this.metadata.participants.push(member.id);
                }
            });

        } catch (error) {
            console.error('[RecordingSession] Failed to start recording:', error);
            this.emit('recordingEvent', 'error', { error } as RecordingEventData);
            throw error;
        }
    }

    private async setupRecording(): Promise<void> {
        if (!this.voiceReceiver) {
            throw new Error('Voice receiver not initialized');
        }

        try {
            let isRecording = false;
            let audioStream: any = null;
            let opusDecoder: any = null;

            // Erstelle einen Haupt-PCM-Stream
            const writePCM = (chunk: Buffer) => {
                if (this.pcmStream && this._isActive) {
                    this.pcmStream.write(chunk);
                }
            };

            // Funktion zum Schreiben von Stille
            const writeSilence = () => {
                if (!isRecording && this._isActive) {
                    // 20ms von Stille (960 Samples * 2 Channels * 2 Bytes pro Sample)
                    const silenceBuffer = Buffer.alloc(960 * 2 * 2, 0);
                    writePCM(silenceBuffer);
                }
            };

            const cleanupStream = () => {
                if (audioStream) {
                    try {
                        audioStream.destroy();
                    } catch (e) {
                        console.warn('[RecordingSession] Error destroying stream:', e);
                    }
                    audioStream = null;
                }
                if (opusDecoder) {
                    try {
                        opusDecoder.destroy();
                    } catch (e) {
                        console.warn('[RecordingSession] Error destroying decoder:', e);
                    }
                    opusDecoder = null;
                }
            };

            this.voiceReceiver.speaking.on('start', (userId) => {
                console.log(`[RecordingSession] User ${userId} started speaking`);
                
                // Cleanup vorheriger Stream
                cleanupStream();
                
                isRecording = true;
                
                // Erstelle neuen Stream
                audioStream = this.voiceReceiver!.subscribe(userId, {
                    end: {
                        behavior: EndBehaviorType.AfterSilence,
                        duration: 100
                    }
                });

                opusDecoder = new prism.opus.Decoder({
                    frameSize: 960,
                    channels: 2,
                    rate: 48000
                });

                // Pipe direkt in PCM
                audioStream.pipe(opusDecoder);
                
                opusDecoder.on('data', (chunk: Buffer) => {
                    writePCM(chunk);
                });

                audioStream.on('error', (error: Error) => {
                    console.warn(`[RecordingSession] Stream error:`, error);
                });

                this.emit('recordingEvent', 'speakingStart', { userId } as RecordingEventData);
            });

            this.voiceReceiver.speaking.on('end', (userId) => {
                console.log(`[RecordingSession] User ${userId} stopped speaking`);
                isRecording = false;
                cleanupStream();
                this.emit('recordingEvent', 'speakingEnd', { userId } as RecordingEventData);
            });

            // Stille-Timer
            const silenceInterval = setInterval(() => {
                if (!this._isActive) {
                    clearInterval(silenceInterval);
                    return;
                }
                writeSilence();
            }, 20);

            if (this.voiceConnection?.state.status !== VoiceConnectionStatus.Ready) {
                throw new Error('Voice connection not ready');
            }

            this.emit('recordingEvent', 'start');
            console.log(`[RecordingSession] Recording started, saving PCM to: ${this.tempPCMFile}`);

        } catch (error) {
            console.error('[RecordingSession] Failed to setup recording:', error);
            this.emit('recordingEvent', 'error', { error } as RecordingEventData);
            throw error;
        }
    }

    public async stop(): Promise<void> {
        if (!this._isActive) return;

        try {
            this._isActive = false;

            for (const [userId, decoder] of this.opusDecoders) {
                decoder.end();
                this.opusDecoders.delete(userId);
            }

            if (this.pcmStream) {
                this.pcmStream.end();
            }

            this.voiceConnection?.destroy();
            this.metadata.endTime = new Date();

            const finalPath = join(
                this.options.storageDir || './recordings',
                `${this.metadata.sessionId}.${this.outputFormat}`
            );

            console.log(`[RecordingSession] Converting PCM to ${this.outputFormat}...`);
            await this.convertToFormat(this.tempPCMFile, finalPath);

            await unlink(this.tempPCMFile);
            
            this.emit('recordingEvent', 'stop');
            console.log(`[RecordingSession] Recording stopped and converted to: ${finalPath}`);

        } catch (error) {
            console.error('[RecordingSession] Error stopping recording:', error);
            this.emit('recordingEvent', 'error', { error } as RecordingEventData);
            throw error;
        }
    }

    public getMetadata(): RecordingMetadata {
        return this.metadata;
    }

    public getStats(): RecordingStats {
        return this.stats;
    }

    public isActive(): boolean {
        return this._isActive;
    }

    private async waitForConnectionState(status: VoiceConnectionStatus, timeout: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const handler = (oldState: any, newState: any) => {
                if (newState.status === status) {
                    this.voiceConnection?.off('stateChange', handler);
                    resolve();
                }
            };

            this.voiceConnection?.on('stateChange', handler);

            setTimeout(() => {
                this.voiceConnection?.off('stateChange', handler);
                reject(new Error(`Connection failed to reach ${status} within ${timeout}ms`));
            }, timeout);
        });
    }

    private async handleError(error: Error): Promise<void> {
        console.error('[RecordingSession] Error:', error);
        this.emit('recordingEvent', 'error', { error } as RecordingEventData);
        await this.stop();
    }
}
