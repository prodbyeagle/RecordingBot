export interface RecordingConfig {
    sampleRate: number;
    channels: number;
    bitrate: number;
    removeEmptyAudio: boolean;
    separateUserTracks: boolean;
    minNoiseLevel: number;  // Threshold for detecting silence
    silenceTimeout: number; // How long silence should be before cutting (in ms)
}

export const defaultConfig: RecordingConfig = {
    sampleRate: 48000,
    channels: 2,
    bitrate: 128000,
    removeEmptyAudio: true,
    separateUserTracks: true,
    minNoiseLevel: -45,
    silenceTimeout: 1000
};

export interface BotConfig {
    token: string;
    clientId: string;
    auditLogChannelId?: string; // Optional, wird über Command gesetzt
}

// Debug: Log environment variables during config load
console.log('Loading config from environment:', {
    tokenAvailable: !!process.env.TOKEN,
    clientIdAvailable: !!process.env.CLIENT_ID,
    tokenLength: process.env.TOKEN?.length || 0
});

// Load from environment variables with validation
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token) {
    throw new Error('TOKEN is required but not found in environment variables');
}

if (!clientId) {
    throw new Error('CLIENT_ID is required but not found in environment variables');
}

export const botConfig: BotConfig = {
    token,
    clientId,
};
