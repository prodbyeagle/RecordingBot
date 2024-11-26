import { 
    EmbedBuilder, 
    ButtonBuilder, 
    ActionRowBuilder, 
    ButtonStyle,
    User,
    GuildMember
} from 'discord.js';

/** Recording session events for audit log */
export interface RecordingEvent {
    type: 'JOIN' | 'LEAVE' | 'START' | 'END';
    user?: User;
    timestamp: Date;
}

/** Creates an embed for an active recording session */
export function createRecordingEmbed(events: RecordingEvent[]) {
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🎙️ Aktive Aufnahme')
        .setDescription('Eine Sprachkanal-Aufnahme ist im Gange.')
        .setTimestamp();

    // Add audit log field
    const auditLog = events
        .map(event => {
            const timestamp = event.timestamp.toLocaleTimeString();
            switch (event.type) {
                case 'START':
                    return `\`${timestamp}\` 🎥 Aufnahme gestartet`;
                case 'END':
                    return `\`${timestamp}\` ⏹️ Aufnahme beendet`;
                case 'JOIN':
                    return `\`${timestamp}\` ➡️ ${event.user?.tag} ist beigetreten`;
                case 'LEAVE':
                    return `\`${timestamp}\` ⬅️ ${event.user?.tag} hat verlassen`;
                default:
                    return '';
            }
        })
        .filter(Boolean)
        .join('\n');

    embed.addFields({ 
        name: '📝 Sitzungsprotokoll', 
        value: auditLog || 'Noch keine Ereignisse'
    });

    return embed;
}

/** Creates a button to end the recording */
export function createEndButton() {
    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('end_recording')
                .setLabel('End Recording')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⏹️')
        );
}

/** Updates the recording embed with new events */
export function updateRecordingEmbed(embed: EmbedBuilder, events: RecordingEvent[]) {
    const auditLog = events
        .map(event => {
            const timestamp = event.timestamp.toLocaleTimeString();
            switch (event.type) {
                case 'START':
                    return `\`${timestamp}\` 🎥 Aufnahme gestartet`;
                case 'END':
                    return `\`${timestamp}\` ⏹️ Aufnahme beendet`;
                case 'JOIN':
                    return `\`${timestamp}\` ➡️ ${event.user?.tag} ist beigetreten`;
                case 'LEAVE':
                    return `\`${timestamp}\` ⬅️ ${event.user?.tag} hat verlassen`;
                default:
                    return '';
            }
        })
        .filter(Boolean)
        .join('\n');

    embed.spliceFields(0, 1, { 
        name: '📝 Sitzungsprotokoll', 
        value: auditLog || 'Noch keine Ereignisse'
    });

    return embed;
}
