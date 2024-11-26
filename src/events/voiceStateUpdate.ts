import { VoiceState, ChannelType } from 'discord.js';
import { AudioRecorder } from '../utils/audioRecorder';
import { db } from '../utils/supabase';
import { settings } from '../utils/settings';

const recorder = new AudioRecorder();

export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
    try {
        // Ignoriere Bot-Bewegungen
        if (newState.member?.user.bot) return;

        // Hole die Guild-Einstellungen
        const guildSettings = await settings.getGuildSettings(newState.guild.id);
        if (!guildSettings) {
            console.error(`❌ Keine Einstellungen gefunden für Server ${newState.guild.id}`);
            return;
        }

        if (!guildSettings.auto_join_enabled) {
            return;
        }

        // Überprüfe, ob der User auf der Auto-Join Liste ist
        const autoJoinUsers = await db.getAutoJoinUsers(newState.guild.id);
        const isAutoJoinUser = autoJoinUsers.some(user => user.user_id === newState.member?.id);
        if (!isAutoJoinUser) return;

        // Überprüfe, ob der neue Channel ein Voice Channel ist
        if (newState.channel?.type === ChannelType.GuildVoice) {
            // Starte Aufnahme
            console.log(`🎙️ Starte Aufnahme für Benutzer ${oldState.member?.user.tag} in Kanal ${newState.channel.name}`);
            await recorder.startRecording(newState.channel, newState.guild.id);
        } else if (!newState.channel && oldState.channel) {
            // User hat den Voice Channel verlassen
            console.log(`👋 Benutzer ${oldState.member?.user.tag} hat den Kanal verlassen, stoppe Aufnahme`);
            await recorder.stopRecording(oldState.guild.id);
        }
    } catch (error) {
        console.error('⚠️ Fehler im Voice State Update Handler:', error instanceof Error ? error.message : error);
        // Versuche die Aufnahme zu stoppen, falls ein Fehler auftritt
        if (oldState.guild.id) {
            try {
                await recorder.stopRecording(oldState.guild.id);
            } catch (stopError) {
                console.error('❌ Fehler beim Stoppen der Aufnahme nach einem Fehler:', stopError instanceof Error ? stopError.message : stopError);
            }
        }
    }
}
