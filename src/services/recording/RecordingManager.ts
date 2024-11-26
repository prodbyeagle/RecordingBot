import { VoiceChannel, User } from 'discord.js';
import { RecordingSession } from './RecordingSession';
import { RecordingOptions, RecordingMetadata, RecordingEventHandler } from './types';
import { configManager } from '../../utils/configManager';

export class RecordingManager {
    private sessions: Map<string, RecordingSession> = new Map();
    private globalEventHandlers: Set<RecordingEventHandler> = new Set();
    private defaultOptions: RecordingOptions = {
        sampleRate: 48000,
        channels: 2,
        bitrate: 128,
        format: 'wav',
        noiseSuppression: true,
        echoCancellation: true,
        silenceThreshold: -50,
        storageDir: './recordings'
    };

    constructor() {
        // Load default settings from config
        this.loadSettings();
    }

    private loadSettings(): void {
        // Load settings for each guild from configManager
        const guildId = process.env.DEFAULT_GUILD_ID;
        if (guildId) {
            const settings = configManager.getRecordingSettings(guildId);
            if (settings) {
                this.defaultOptions = {
                    ...this.defaultOptions,
                    ...settings
                };
            }
        }
    }

    public async startRecording(
        channel: VoiceChannel,
        initiator: User,
        options?: Partial<RecordingOptions>
    ): Promise<RecordingSession> {
        // Get guild-specific settings
        const guildSettings = configManager.getRecordingSettings(channel.guild.id);
        
        // Merge default options, guild settings, and provided options
        const mergedOptions: RecordingOptions = {
            ...this.defaultOptions,
            ...(guildSettings || {}),
            ...(options || {})
        } as RecordingOptions;

        // Create new recording session
        const session = new RecordingSession(channel, initiator, mergedOptions);
        this.sessions.set(session.getMetadata().id, session);

        // Add global event handlers
        this.globalEventHandlers.forEach(handler => {
            session.addListener('recordingEvent', handler);
        });

        return session;
    }

    public getSession(sessionId: string): RecordingSession | undefined {
        return this.sessions.get(sessionId);
    }

    public addGlobalEventHandler(handler: RecordingEventHandler): void {
        this.globalEventHandlers.add(handler);
        
        // Add handler to all existing sessions
        this.sessions.forEach(session => {
            session.addListener('recordingEvent', handler);
        });
    }

    public removeGlobalEventHandler(handler: RecordingEventHandler): void {
        this.globalEventHandlers.delete(handler);
        
        // Remove handler from all existing sessions
        this.sessions.forEach(session => {
            session.removeListener('recordingEvent', handler);
        });
    }

    public async stopAllSessions(): Promise<void> {
        await Promise.all(
            Array.from(this.sessions.values()).map(session => session.stop())
        );
        this.sessions.clear();
    }
}
