import { createClient, PostgrestError } from '@supabase/supabase-js';
import { config } from './config';

// Definiere die Typen für unsere Datenbanktabellen
export interface Recording {
    id: number;
    created_at: string;
    file_path: string;
    channel_id: string;
    guild_id: string;
    duration: number;
    file_size: number;
    recorded_by: string;
}

export interface AutoJoinUser {
    id: number;
    user_id: string;
    guild_id: string;
    channel_id: string;
    created_at: string;
}

// Erstelle den Supabase-Client mit Service Role Key
const supabase = createClient(
    config.supabaseUrl,
    config.supabaseKey,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true
        },
        db: {
            schema: 'public'
        }
    }
);

// Hilfsfunktionen für Datenbankoperationen
export const db = {
    // Aufnahmen
    async addRecording(recording: Omit<Recording, 'id' | 'created_at'>): Promise<Recording> {
        try {
            console.log('Adding recording:', recording);
            const { data, error } = await supabase
                .from('recordings')
                .insert([recording])
                .select()
                .single();

            if (error) {
                console.error('Error adding recording:', {
                    error: error.message,
                    details: error.details,
                    hint: error.hint,
                    recording
                });
                throw error;
            }

            console.log('Recording added successfully:', data);
            return data as Recording;
        } catch (error) {
            console.error('Critical error in addRecording:', {
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack
                } : error,
                recording
            });
            throw error;
        }
    },

    async getRecordings(guildId: string): Promise<Recording[]> {
        try {
            console.log(`Fetching recordings for guild ${guildId}`);
            const { data, error } = await supabase
                .from('recordings')
                .select('*')
                .eq('guild_id', guildId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching recordings:', {
                    error: error.message,
                    details: error.details,
                    hint: error.hint,
                    guildId
                });
                throw error;
            }

            return data as Recording[] || [];
        } catch (error) {
            console.error('Critical error in getRecordings:', {
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack
                } : error,
                guildId
            });
            throw error;
        }
    },

    async deleteOldRecordings(daysOld: number): Promise<Recording[]> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);
            
            console.log(`Deleting recordings older than ${daysOld} days (${cutoffDate.toISOString()})`);
            
            const { data, error } = await supabase
                .from('recordings')
                .delete()
                .lt('created_at', cutoffDate.toISOString())
                .select();

            if (error) {
                console.error('Error deleting old recordings:', {
                    error: error.message,
                    details: error.details,
                    hint: error.hint,
                    daysOld,
                    cutoffDate
                });
                throw error;
            }

            const deletedCount = data?.length || 0;
            console.log(`Successfully deleted ${deletedCount} old recordings`);
            return data as Recording[] || [];
        } catch (error) {
            console.error('Critical error in deleteOldRecordings:', {
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack
                } : error,
                daysOld
            });
            throw error;
        }
    },

    // Auto-Join Users
    async addAutoJoinUser(user: Omit<AutoJoinUser, 'id' | 'created_at'>): Promise<AutoJoinUser> {
        try {
            console.log('Adding auto-join user:', user);
            const { data, error } = await supabase
                .from('auto_join_users')
                .insert([user])
                .select()
                .single();

            if (error) {
                console.error('Error adding auto-join user:', {
                    error: error.message,
                    details: error.details,
                    hint: error.hint,
                    user
                });
                throw error;
            }

            console.log('Auto-join user added successfully:', data);
            return data as AutoJoinUser;
        } catch (error) {
            console.error('Critical error in addAutoJoinUser:', {
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack
                } : error,
                user
            });
            throw error;
        }
    },

    async removeAutoJoinUser(userId: string, guildId: string): Promise<AutoJoinUser[]> {
        try {
            console.log(`Removing auto-join user: ${userId} from guild ${guildId}`);
            const { data, error } = await supabase
                .from('auto_join_users')
                .delete()
                .match({ user_id: userId, guild_id: guildId })
                .select();

            if (error) {
                console.error('Error removing auto-join user:', {
                    error: error.message,
                    details: error.details,
                    hint: error.hint,
                    userId,
                    guildId
                });
                throw error;
            }

            console.log('Auto-join user removed successfully');
            return data as AutoJoinUser[] || [];
        } catch (error) {
            console.error('Critical error in removeAutoJoinUser:', {
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack
                } : error,
                userId,
                guildId
            });
            throw error;
        }
    },

    async getAutoJoinUsers(guildId: string): Promise<AutoJoinUser[]> {
        try {
            console.log(`Fetching auto-join users for guild ${guildId}`);
            const { data, error } = await supabase
                .from('auto_join_users')
                .select('*')
                .eq('guild_id', guildId);

            if (error) {
                console.error('Error fetching auto-join users:', {
                    error: error.message,
                    details: error.details,
                    hint: error.hint,
                    guildId
                });
                throw error;
            }

            return data as AutoJoinUser[] || [];
        } catch (error) {
            console.error('Critical error in getAutoJoinUsers:', {
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack
                } : error,
                guildId
            });
            throw error;
        }
    },

    async isAutoJoinUser(userId: string, guildId: string): Promise<boolean> {
        try {
            console.log(`Checking if user ${userId} is auto-join user in guild ${guildId}`);
            const { data, error } = await supabase
                .from('auto_join_users')
                .select('*')
                .match({ user_id: userId, guild_id: guildId })
                .single();

            if (error && error.code !== 'PGRST116') { // Ignore "not found" error
                console.error('Error checking auto-join user:', {
                    error: error.message,
                    details: error.details,
                    hint: error.hint,
                    userId,
                    guildId
                });
                throw error;
            }

            return !!data;
        } catch (error) {
            console.error('Critical error in isAutoJoinUser:', {
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack
                } : error,
                userId,
                guildId
            });
            throw error;
        }
    }
};
