import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

/** Configuration interface for the bot */
export interface BotConfig {
    /** Discord bot token */
    token: string;
    /** Supabase URL */
    supabaseUrl: string;
    /** Supabase service role key */
    supabaseKey: string;
    /** Path to recordings directory */
    recordingsPath: string;
    /** Channel ID for recording logs */
    logChannelId: string;
    /** FFmpeg configuration */
    ffmpegOptions: {
        path: string;
    };
}

/** Validates environment variables and returns config object */
function validateConfig(): BotConfig {
    const token = process.env.DISCORD_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    const logChannelId = process.env.LOG_CHANNEL_ID;

    if (!token) throw new Error('DISCORD_TOKEN is required');
    if (!supabaseUrl) throw new Error('SUPABASE_URL is required');
    if (!supabaseKey) throw new Error('SUPABASE_KEY is required');
    if (!logChannelId) throw new Error('LOG_CHANNEL_ID is required');

    return {
        token,
        supabaseUrl,
        supabaseKey,
        logChannelId,
        recordingsPath: join(__dirname, '../../recordings'),
        ffmpegOptions: {
            path: process.env.FFMPEG_PATH || 'ffmpeg'
        }
    };
}

/** Bot configuration */
export const config = validateConfig();
