import { VoiceChannel, User } from 'discord.js';
import { 
    VoiceConnection, 
    joinVoiceChannel,
    createAudioPlayer,
    VoiceConnectionStatus,
    getVoiceConnection,
    entersState
} from '@discordjs/voice';
import { RecordingOptions, RecordingMetadata, RecordingStats, RecordingEvent, RecordingEventHandler } from './types';
import { join } from 'path';
import { createWriteStream, WriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { ulid } from 'ulid';
import { AudioProcessor } from './AudioProcessor';
import { existsSync, mkdirSync } from 'fs';
import { EventEmitter } from 'events';

export class RecordingSession extends EventEmitter {
    private metadata: RecordingMetadata;
    private connection?: VoiceConnection;
    private audioPlayer?: ReturnType<typeof createAudioPlayer>;
    private audioStreams: Map<string, WriteStream> = new Map();
    private processors: Map<string, AudioProcessor> = new Map();
    private eventHandlers: Set<RecordingEventHandler> = new Set();
    private stats: RecordingStats;
    private active: boolean = false;
    private paused: boolean = false;

    constructor(
        private channel: VoiceChannel,
        private initiator: User,
        private options: RecordingOptions
    ) {
        super();
        
        this.metadata = {
            id: ulid(),
            guildId: channel.guild.id,
            channelId: channel.id,
            initiator: initiator.id,
            startTime: new Date(),
            participants: [],
            options: this.normalizeOptions(options)
        };

        this.stats = {
            peakAmplitude: 0,
            averageAmplitude: 0,
            silentSegments: 0,
            totalSize: 0,
            duration: 0
        };
    }

    public async start(): Promise<void> {
        if (this.active) {
            throw new Error('Recording session is already active');
        }

        try {
            // Join the voice channel
            this.connection = joinVoiceChannel({
                channelId: this.channel.id,
                guildId: this.channel.guild.id,
                adapterCreator: this.channel.guild.voiceAdapterCreator as any, // Type assertion needed due to discord.js version mismatch
                selfDeaf: false // Need to hear others to record
            });

            // Wait for connection to be ready
            await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
            
            // Set active state
            this.active = true;
            
            // Emit start event
            await this.emitEvent('start');

            // Setup connection destroy handler
            this.connection.on(VoiceConnectionStatus.Destroyed, async () => {
                if (this.active) {
                    await this.stop();
                }
            });

            // Create audio player
            this.audioPlayer = createAudioPlayer();
            this.connection.subscribe(this.audioPlayer);

            // Set up recording for each user in the channel
            this.channel.members.forEach(member => {
                this.setupUserRecording(member.id);
            });

            // Listen for connection state changes
            this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await entersState(this.connection!, VoiceConnectionStatus.Signalling, 5_000);
                    await entersState(this.connection!, VoiceConnectionStatus.Connecting, 5_000);
                } catch {
                    await this.stop();
                }
            });

        } catch (error) {
            this.active = false;
            await this.emitEvent('error', { error: error as Error });
            throw error;
        }
    }

    public async stop(): Promise<void> {
        if (!this.active) {
            return; // Silently return if not active instead of throwing
        }

        try {
            // Update final stats
            this.updateFinalStats();

            // Set end time
            this.metadata.endTime = new Date();

            // Clean up resources
            await this.cleanup();

            // Set inactive
            this.active = false;

            // Emit stop event
            await this.emitEvent('stop');
        } catch (error) {
            await this.emitEvent('error', { error: error as Error });
            throw error;
        }
    }

    private setupUserRecording(userId: string): void {
        if (!this.connection) return;

        // Create directory if it doesn't exist
        const dir = join(this.metadata.options.storageDir || './recordings', this.metadata.id);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        // Create filename based on pattern
        const filename = this.metadata.options.filenamePattern || '{date}_{channel}_{user}'
            .replace('{date}', new Date().toISOString().replace(/[:.]/g, '-'))
            .replace('{channel}', this.channel.name)
            .replace('{user}', userId);

        // Create write stream
        const filePath = join(dir, `${filename}.${this.metadata.options.format || 'wav'}`);
        const fileStream = createWriteStream(filePath);

        // Create audio processor
        const processor = new AudioProcessor(this.metadata.options);

        // Store streams for cleanup
        this.audioStreams.set(userId, fileStream);
        this.processors.set(userId, processor);

        // Add user to participants if not already there
        if (!this.metadata.participants.includes(userId)) {
            this.metadata.participants.push(userId);
        }
    }

    private async cleanup(): Promise<void> {
        // Disconnect from voice channel
        this.connection?.destroy();
        
        // Close all streams
        for (const [userId, stream] of this.audioStreams) {
            stream.end();
        }
        
        // Clear maps
        this.audioStreams.clear();
        this.processors.clear();
    }

    private updateFinalStats(): void {
        let totalPeakAmplitude = 0;
        let totalSilentSegments = 0;

        // Aggregate stats from all processors
        for (const processor of this.processors.values()) {
            const stats = processor.getStats();
            totalPeakAmplitude = Math.max(totalPeakAmplitude, stats.peakAmplitude);
            totalSilentSegments += stats.silentSegments;
        }

        this.stats = {
            ...this.stats,
            peakAmplitude: totalPeakAmplitude,
            silentSegments: totalSilentSegments,
            duration: this.metadata.endTime 
                ? (this.metadata.endTime.getTime() - this.metadata.startTime.getTime()) / 1000 
                : 0
        };
    }

    public async pause(): Promise<void> {
        if (!this.active || this.paused) {
            throw new Error('Cannot pause: recording is not active or already paused');
        }

        this.paused = true;
        await this.emitEvent('pause');
    }

    public async resume(): Promise<void> {
        if (!this.active || !this.paused) {
            throw new Error('Cannot resume: recording is not active or not paused');
        }

        this.paused = false;
        await this.emitEvent('resume');
    }

    public onEvent(handler: RecordingEventHandler): void {
        this.eventHandlers.add(handler);
    }

    public offEvent(handler: RecordingEventHandler): void {
        this.eventHandlers.delete(handler);
    }

    private async emitEvent(
        type: RecordingEvent['type'],
        additional: Partial<RecordingEvent> = {}
    ): Promise<void> {
        const event: RecordingEvent = {
            type,
            timestamp: new Date(),
            metadata: this.metadata,
            stats: this.stats,
            ...additional
        };

        await Promise.all(
            Array.from(this.eventHandlers).map(handler => handler(event))
        );
    }

    public getMetadata(): RecordingMetadata {
        return { ...this.metadata };
    }

    public getStats(): RecordingStats {
        return { ...this.stats };
    }

    public isActive(): boolean {
        return this.active;
    }

    public isPaused(): boolean {
        return this.paused;
    }

    private normalizeOptions(options: RecordingOptions): RecordingOptions {
        return {
            sampleRate: 48000,
            channels: 2,
            bitrate: 128,
            separateUsers: true,
            format: 'wav',
            noiseSuppression: true,
            echoCancellation: true,
            silenceThreshold: -50,
            storageDir: './recordings',
            filenamePattern: '{date}_{channel}_{user}',
            maxDuration: 120,
            maxSize: 1000,
            ...options
        };
    }
}
