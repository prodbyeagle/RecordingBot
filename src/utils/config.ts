import { join } from 'path';
import dotenv from 'dotenv';

// Lade .env Datei
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

    if (!token) throw new Error('⚠️ DISCORD_TOKEN wird benötigt');
    if (!supabaseUrl) throw new Error('⚠️ SUPABASE_URL wird benötigt');
    if (!supabaseKey) throw new Error('⚠️ SUPABASE_KEY wird benötigt');

    return {
        token,
        supabaseUrl,
        supabaseKey,
        recordingsPath: process.env.RECORDINGS_PATH || join(__dirname, '../../recordings'),
        ffmpegOptions: {
            path: process.env.FFMPEG_PATH || 'ffmpeg'
        }
    };
}

/** Bot configuration */
export const config = validateConfig();
