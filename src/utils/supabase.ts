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
    created_at: string;
}

export interface BotConfig {
    id: number;
    guild_id: string;
    log_channel_id: string;
    created_at: string;
    updated_at: string;
}

// Erstelle den Supabase-Client mit Service Role Key
const supabase = createClient(
    config.supabaseUrl,
    config.supabaseKey,
    {
        auth: {
            persistSession: false
        }
    }
);

// Hilfsfunktionen für Datenbankoperationen
export const db = {
    // Aufnahmen
    async addRecording(recording: Omit<Recording, 'id' | 'created_at'>): Promise<Recording> {
        try {
            console.log('💾 Speichere neue Aufnahme');
            const { data, error } = await supabase
                .from('recordings')
                .insert([recording])
                .select()
                .single();

            if (error) {
                console.error('❌ Fehler beim Speichern der Aufnahme:', error.message);
                throw error;
            }

            console.log('✅ Aufnahme erfolgreich gespeichert');
            return data as Recording;
        } catch (error) {
            console.error('⚠️ Kritischer Fehler beim Speichern der Aufnahme:', error instanceof Error ? error.message : error);
            throw error;
        }
    },

    async getRecordings(guildId: string): Promise<Recording[]> {
        try {
            console.log(`🎵 Lade Aufnahmen für Server ${guildId}`);
            const { data, error } = await supabase
                .from('recordings')
                .select('*')
                .eq('guild_id', guildId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Fehler beim Laden der Aufnahmen:', error.message);
                throw error;
            }

            return data as Recording[] || [];
        } catch (error) {
            console.error('⚠️ Kritischer Fehler beim Laden der Aufnahmen:', error instanceof Error ? error.message : error);
            throw error;
        }
    },

    async deleteOldRecordings(daysOld: number): Promise<Recording[]> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);
            
            console.log(`🗑️ Lösche Aufnahmen älter als ${daysOld} Tage (${cutoffDate.toISOString()})`);
            
            const { data, error } = await supabase
                .from('recordings')
                .delete()
                .lt('created_at', cutoffDate.toISOString())
                .select();

            if (error) {
                console.error('❌ Fehler beim Löschen alter Aufnahmen:', error.message);
                throw error;
            }

            const deletedCount = data?.length || 0;
            console.log(`✅ ${deletedCount} alte Aufnahmen erfolgreich gelöscht`);
            return data as Recording[] || [];
        } catch (error) {
            console.error('⚠️ Kritischer Fehler beim Löschen alter Aufnahmen:', error instanceof Error ? error.message : error);
            throw error;
        }
    },

    // Auto-Join Users
    async addAutoJoinUser(user: Omit<AutoJoinUser, 'id' | 'created_at'>): Promise<AutoJoinUser> {
        try {
            console.log('👥 Füge Auto-Join Benutzer hinzu');
            const { data, error } = await supabase
                .from('auto_join_users')
                .insert([user])
                .select()
                .single();

            if (error) {
                console.error('❌ Fehler beim Hinzufügen des Auto-Join Benutzers:', error.message);
                throw error;
            }

            console.log('✅ Auto-Join Benutzer erfolgreich hinzugefügt');
            return data as AutoJoinUser;
        } catch (error) {
            console.error('⚠️ Kritischer Fehler beim Hinzufügen des Auto-Join Benutzers:', error);
            throw error;
        }
    },

    async removeAutoJoinUser(userId: string, guildId: string): Promise<AutoJoinUser[]> {
        try {
            console.log(`🚫 Entferne Auto-Join Benutzer: ${userId} von Server ${guildId}`);
            const { data, error } = await supabase
                .from('auto_join_users')
                .delete()
                .match({ user_id: userId, guild_id: guildId })
                .select();

            if (error) {
                console.error('❌ Fehler beim Entfernen des Auto-Join Benutzers:', error.message);
                throw error;
            }

            console.log('✅ Auto-Join Benutzer erfolgreich entfernt');
            return data as AutoJoinUser[] || [];
        } catch (error) {
            console.error('⚠️ Kritischer Fehler beim Entfernen des Auto-Join Benutzers:', error instanceof Error ? error.message : error);
            throw error;
        }
    },

    async getAutoJoinUsers(guildId: string): Promise<AutoJoinUser[]> {
        try {
            console.log(`👥 Lade Auto-Join Benutzer für Server ${guildId}`);
            const { data, error } = await supabase
                .from('auto_join_users')
                .select('*')
                .eq('guild_id', guildId);

            if (error) {
                console.error('❌ Fehler beim Laden der Auto-Join Benutzer:', error.message);
                throw error;
            }

            return data as AutoJoinUser[] || [];
        } catch (error) {
            console.error('⚠️ Kritischer Fehler beim Laden der Auto-Join Benutzer:', error instanceof Error ? error.message : error);
            throw error;
        }
    },

    async isAutoJoinUser(userId: string, guildId: string): Promise<boolean> {
        try {
            console.log(`🔍 Prüfe Auto-Join Status für Benutzer ${userId} auf Server ${guildId}`);
            const { data, error } = await supabase
                .from('auto_join_users')
                .select('*')
                .match({ user_id: userId, guild_id: guildId })
                .single();

            if (error && error.code !== 'PGRST116') { // Ignore "not found" error
                console.error('❌ Fehler beim Prüfen des Auto-Join Status:', error.message);
                throw error;
            }

            return !!data;
        } catch (error) {
            console.error('⚠️ Kritischer Fehler beim Prüfen des Auto-Join Status:', error instanceof Error ? error.message : error);
            throw error;
        }
    },

    // Bot Konfiguration
    async getGuildConfig(guildId: string): Promise<BotConfig | null> {
        try {
            console.log(`⚙️ Lade Konfiguration für Server ${guildId}`);
            const { data, error } = await supabase
                .from('bot_config')
                .select('*')
                .eq('guild_id', guildId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') { // Keine Konfiguration gefunden
                    return null;
                }
                console.error('❌ Fehler beim Laden der Konfiguration:', error.message);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('⚠️ Kritischer Fehler beim Laden der Konfiguration:', error instanceof Error ? error.message : error);
            throw error;
        }
    },

    async updateGuildConfig(guildId: string, config: Partial<Omit<BotConfig, 'id' | 'created_at' | 'guild_id'>>): Promise<BotConfig> {
        try {
            const existingConfig = await this.getGuildConfig(guildId);
            
            if (!existingConfig) {
                // Erstelle neue Konfiguration
                const { data, error } = await supabase
                    .from('bot_config')
                    .insert([{
                        guild_id: guildId,
                        ...config,
                        updated_at: new Date().toISOString()
                    }])
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Fehler beim Erstellen der Konfiguration:', error.message);
                    throw error;
                }

                return data;
            }

            // Aktualisiere bestehende Konfiguration
            const { data, error } = await supabase
                .from('bot_config')
                .update({
                    ...config,
                    updated_at: new Date().toISOString()
                })
                .eq('guild_id', guildId)
                .select()
                .single();

            if (error) {
                console.error('❌ Fehler beim Aktualisieren der Konfiguration:', error.message);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('⚠️ Kritischer Fehler beim Aktualisieren der Konfiguration:', error instanceof Error ? error.message : error);
            throw error;
        }
    },
};
