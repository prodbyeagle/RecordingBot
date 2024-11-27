import { VoiceChannel, User } from 'discord.js';

export type AudioFormat = 'wav' | 'mp3';

export interface AudioProcessorOptions {
    sampleRate: number;
    channels: number;
    bitrate: number;
    format: AudioFormat;
    noiseSuppression: boolean;
    echoCancellation: boolean;
    silenceThreshold: number;
    bitDepth: number;
}

export interface RecordingOptions {
    format: AudioFormat;
    sampleRate: number;
    channels: number;
    bitrate: number;
    noiseSuppression: boolean;
    echoCancellation: boolean;
    silenceThreshold: number;
    storageDir?: string;
    filenamePattern?: string;
    maxDuration?: number;
    maxSize?: number;
    separateUsers?: boolean;
}

export interface RecordingMetadata {
    sessionId: string;
    guildId: string;
    channelId: string;
    startTime: Date;
    endTime?: Date;
    options: RecordingOptions;
    participants: string[];
    initiator: string;
}

export interface RecordingStats {
    peakAmplitude: number;
    averageAmplitude: number;
    silentSegments: number;
    totalSamples: number;
}

export type RecordingEvent = 
    | 'start'
    | 'stop'
    | 'pause'
    | 'resume'
    | 'error'
    | 'userJoined'
    | 'userLeft'
    | 'speakingStart'
    | 'speakingEnd';

export interface RecordingEventData {
    userId?: string;
    error?: Error;
    metadata?: RecordingMetadata;
    stats?: RecordingStats;
}

export type RecordingEventHandler = (event: RecordingEvent, data?: RecordingEventData) => Promise<void>;
