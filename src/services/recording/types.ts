import { VoiceChannel, User } from 'discord.js';

export interface RecordingOptions {
    // Basic recording settings
    sampleRate?: number;          // Audio sample rate (default: 48000)
    channels?: number;            // Number of audio channels (default: 2)
    bitrate?: number;            // Recording bitrate (default: 128)
    
    // Advanced settings
    separateUsers?: boolean;      // Record each user to a separate track
    format?: 'wav' | 'ogg' | 'mp3'; // Output format
    
    // Processing options
    noiseSuppression?: boolean;   // Enable noise suppression
    echoCancellation?: boolean;   // Enable echo cancellation
    silenceThreshold?: number;    // Silence detection threshold in dB
    
    // Storage settings
    storageDir?: string;         // Custom storage directory
    filenamePattern?: string;    // Custom filename pattern with variables like {date}, {user}, {channel}
    
    // Limits
    maxDuration?: number;        // Maximum recording duration in minutes
    maxSize?: number;            // Maximum file size in MB
}

export interface RecordingMetadata {
    id: string;                  // Unique recording ID
    guildId: string;            // Discord guild ID
    channelId: string;          // Discord channel ID
    startTime: Date;            // Recording start time
    endTime?: Date;             // Recording end time
    participants: string[];      // User IDs of participants
    initiator: string;          // User ID who started the recording
    options: RecordingOptions;   // Applied recording options
    fileSize?: number;          // Final file size in bytes
    duration?: number;          // Final duration in seconds
}

export interface RecordingStats {
    peakAmplitude: number;      // Peak audio amplitude
    averageAmplitude: number;   // Average audio amplitude
    silentSegments: number;     // Number of silent segments
    totalSize: number;          // Current file size
    duration: number;           // Current duration
}

export interface RecordingEvent {
    type: 'start' | 'stop' | 'pause' | 'resume' | 'user-join' | 'user-leave' | 'error';
    timestamp: Date;
    metadata?: RecordingMetadata;
    stats?: RecordingStats;
    error?: Error;
}

export type RecordingEventHandler = (event: RecordingEvent) => void | Promise<void>;
