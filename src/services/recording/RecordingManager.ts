import { VoiceBasedChannel, VoiceChannel, User } from 'discord.js';
import { RecordingSession } from './RecordingSession';
import { RecordingOptions, RecordingMetadata, RecordingEventHandler, AudioFormat, AudioProcessorOptions, RecordingEvent, RecordingEventData } from './types';
import { configManager } from '../../utils/configManager';
import { existsSync, mkdirSync } from 'fs';
import { AudioProcessorFactory } from './audio/AudioProcessorFactory';
import { Logger } from '../Logger';
import { createRecordingEventLogger } from './RecordingEventLogger';

export class RecordingManager {
    private sessions: Map<string, RecordingSession>;
    private globalEventHandlers: Set<RecordingEventHandler>;
    private defaultOptions: RecordingOptions;
    private readonly audioProcessorFactory: AudioProcessorFactory;
    private eventLogger?: RecordingEventHandler;

    constructor() {
        this.sessions = new Map();
        this.globalEventHandlers = new Set();
        this.audioProcessorFactory = new AudioProcessorFactory();

        this.defaultOptions = {
            format: 'wav' as AudioFormat,
            sampleRate: 48000,
            channels: 2,
            bitrate: 128000,
            noiseSuppression: true,
            echoCancellation: true,
            silenceThreshold: -50,
            storageDir: './recordings',
            separateUsers: false
        };

        if (!existsSync(this.defaultOptions.storageDir!)) {
            mkdirSync(this.defaultOptions.storageDir!, { recursive: true });
        }

        this.loadSettings();
    }

    private loadSettings(): void {
        const guildId = process.env.DEFAULT_GUILD_ID;
        if (guildId) {
            const settings = configManager.getRecordingSettings(guildId);
            if (settings) {
                const format = settings.format && ['wav', 'mp3'].includes(settings.format)
                    ? settings.format as AudioFormat
                    : 'wav' as AudioFormat;

                const bitrate = settings.bitrate ? settings.bitrate * 1000 : this.defaultOptions.bitrate;

                this.defaultOptions = {
                    ...this.defaultOptions,
                    ...settings,
                    format,
                    bitrate
                };
            }
        }
    }

    private createAudioProcessorOptions(options: RecordingOptions): AudioProcessorOptions {
        const format = options.format || 'wav';
        if (format !== 'wav' && format !== 'mp3') {
            throw new Error('Unsupported format. Only wav and mp3 are supported.');
        }

        const bitrate = typeof options.bitrate === 'number'
            ? (options.bitrate < 1000 ? options.bitrate * 1000 : options.bitrate)
            : 128000;

        return {
            sampleRate: options.sampleRate || 48000,
            channels: options.channels || 2,
            bitrate,
            format,
            noiseSuppression: options.noiseSuppression || true,
            echoCancellation: options.echoCancellation || true,
            silenceThreshold: options.silenceThreshold || -50,
            bitDepth: 16
        };
    }

    public addGlobalEventHandler(handler: RecordingEventHandler): void {
        this.globalEventHandlers.add(handler);
        this.sessions.forEach(session => {
            session.addListener('recordingEvent', handler);
        });
    }

    public removeGlobalEventHandler(handler: RecordingEventHandler): void {
        this.globalEventHandlers.delete(handler);
        this.sessions.forEach(session => {
            session.removeListener('recordingEvent', handler);
        });
    }

    public setLogger(logger: Logger): void {
        this.eventLogger = createRecordingEventLogger(logger);
        this.globalEventHandlers.add(this.eventLogger);
    }

    public async startRecording(
        channel: VoiceChannel,
        initiator: User,
        options: Partial<RecordingOptions> = {}
    ): Promise<RecordingSession> {
        if (!(channel instanceof VoiceChannel)) {
            throw new Error('Recording is only supported in regular voice channels, not stage channels.');
        }

        console.log(`[RecordingManager] Starting recording in channel ${channel.name}`);

        const mergedOptions = { ...this.defaultOptions, ...options };
        const session = new RecordingSession(channel, initiator, mergedOptions, this.audioProcessorFactory);

        // Add global event handlers
        this.globalEventHandlers.forEach(handler => {
            session.on('recordingEvent', (event: RecordingEvent, eventData?: RecordingEventData) => {
                const metadata = session.getMetadata();
                handler(event, {
                    ...eventData,
                    metadata,
                    channel,
                    user: initiator,
                    userId: initiator.id
                });
            });
        });

        await session.start();
        this.sessions.set(session.getMetadata().sessionId, session);

        return session;
    }

    public getSession(sessionId: string): RecordingSession | undefined {
        return this.sessions.get(sessionId);
    }

    public async stopAllSessions(): Promise<void> {
        const stopPromises = Array.from(this.sessions.values()).map(session => session.stop());
        await Promise.all(stopPromises);
        this.sessions.clear();
    }

    public getActiveSessions(): Map<string, RecordingSession> {
        return new Map(this.sessions);
    }
}
