import { createClient } from '@supabase/supabase-js';
import { config } from './config';

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

/** Interface for guild settings */
export interface GuildSettings {
    /** Unique identifier */
    id?: number;
    /** Discord guild ID */
    guild_id: string;
    /** Target voice channel ID */
    target_voice_channel: string;
    /** Maximum recording length in milliseconds */
    max_recording_length: number;
    /** Number of days to retain recordings */
    recording_retention_days: number;
    /** Whether auto-join is enabled */
    auto_join_enabled: boolean;
    /** List of user IDs for auto-join */
    auto_join_users: string[];
    /** Creation timestamp */
    created_at?: string;
    /** Last update timestamp */
    updated_at?: string;
}

// Standard-Einstellungen
/** Default guild settings */
const DEFAULT_SETTINGS: Omit<GuildSettings, 'id' | 'created_at' | 'updated_at'> = {
    guild_id: '',
    target_voice_channel: '',
    max_recording_length: 12 * 60 * 60 * 1000, // 12 Stunden
    recording_retention_days: 10,
    auto_join_enabled: true,
    auto_join_users: []
};

class Settings {
    constructor() {
        this.initializeDatabase();
    }

    private async initializeDatabase() {
        try {
            console.log('Checking database connection...');
            const { error } = await supabase.from('guild_settings').select('count');
            
            if (error) {
                console.error('Database connection error:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint
                });
                return;
            }
            
            console.log('Successfully connected to database');
        } catch (error) {
            console.error('Failed to initialize database:', error);
        }
    }

    async getGuildSettings(guildId: string): Promise<GuildSettings> {
        try {
            console.log(`Fetching settings for guild ${guildId}`);
            const { data, error } = await supabase
                .from('guild_settings')
                .select('*')
                .eq('guild_id', guildId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') { // No data found
                    console.log(`No settings found for guild ${guildId}, creating default settings...`);
                    return this.createDefaultSettings(guildId);
                }
                
                console.error('Error fetching guild settings:', {
                    error: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint,
                    guildId
                });
                throw error;
            }

            return data;
        } catch (error) {
            const err = error as Error;
            console.error('Error in getGuildSettings:', {
                message: err.message,
                stack: err.stack,
                guildId
            });
            throw error;
        }
    }

    private async createDefaultSettings(guildId: string): Promise<GuildSettings> {
        try {
            const newSettings: GuildSettings = {
                ...DEFAULT_SETTINGS,
                guild_id: guildId,
            };

            console.log('Creating default settings:', newSettings);

            const { data, error } = await supabase
                .from('guild_settings')
                .insert([newSettings])
                .select()
                .single();

            if (error) {
                // Log the raw error object for debugging
                console.error('Raw Supabase error:', error);
                
                console.error('Error creating default settings:', {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint,
                    guildId,
                    newSettings
                });
                throw error;
            }

            if (!data) {
                throw new Error('No data returned after creating default settings');
            }

            console.log('Successfully created default settings:', data);
            return data;
        } catch (error) {
            // Log the raw error for debugging
            console.error('Raw error in createDefaultSettings:', error);
            
            const err = error as Error;
            console.error('Error in createDefaultSettings:', {
                message: err.message,
                stack: err.stack,
                guildId
            });
            throw error;
        }
    }

    async updateGuildSettings(guildId: string, updates: Partial<GuildSettings>): Promise<GuildSettings> {
        try {
            // First check if settings exist
            const existingSettings = await this.getGuildSettings(guildId);
            
            // Validate updates
            if (updates.auto_join_users && !Array.isArray(updates.auto_join_users)) {
                throw new Error('auto_join_users must be an array');
            }

            // If getGuildSettings didn't throw, we can proceed with the update
            const { data, error } = await supabase
                .from('guild_settings')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('guild_id', guildId)
                .select()
                .single();

            if (error) {
                // Check for specific database errors
                if (error.code === 'PGRST204' && error.message.includes('auto_join_users')) {
                    console.error('Database schema error: auto_join_users column is missing');
                    throw new Error('Database setup incomplete. Please run the required migrations.');
                }

                console.error('Error updating guild settings:', {
                    error: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint,
                    guildId,
                    updates
                });
                throw error;
            }

            if (!data) {
                throw new Error('No data returned after updating settings');
            }

            console.log('Successfully updated guild settings:', {
                guildId,
                updates,
                result: data
            });

            return data;
        } catch (error) {
            const err = error as Error;
            console.error('Error in updateGuildSettings:', {
                message: err.message,
                stack: err.stack,
                guildId,
                updates
            });
            throw error;
        }
    }

    async setTargetChannel(guildId: string, channelId: string): Promise<void> {
        await this.updateGuildSettings(guildId, { target_voice_channel: channelId });
    }

    async setMaxRecordingLength(guildId: string, hours: number): Promise<void> {
        await this.updateGuildSettings(guildId, { 
            max_recording_length: hours * 60 * 60 * 1000 
        });
    }

    async setRetentionDays(guildId: string, days: number): Promise<void> {
        await this.updateGuildSettings(guildId, { recording_retention_days: days });
    }

    async setAutoJoinEnabled(guildId: string, enabled: boolean): Promise<void> {
        await this.updateGuildSettings(guildId, { auto_join_enabled: enabled });
    }
}

const settings = new Settings();
export { settings };
