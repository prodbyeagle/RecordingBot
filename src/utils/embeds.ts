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
        .setTitle('🎙️ Active Recording Session')
        .setDescription('A voice channel recording is in progress.')
        .setTimestamp();

    // Add audit log field
    const auditLog = events
        .map(event => {
            const timestamp = event.timestamp.toLocaleTimeString();
            switch (event.type) {
                case 'START':
                    return `\`${timestamp}\` 📱 Recording started`;
                case 'END':
                    return `\`${timestamp}\` ⏹️ Recording ended`;
                case 'JOIN':
                    return `\`${timestamp}\` ➡️ ${event.user?.tag} joined`;
                case 'LEAVE':
                    return `\`${timestamp}\` ⬅️ ${event.user?.tag} left`;
                default:
                    return '';
            }
        })
        .filter(Boolean)
        .join('\n');

    embed.addFields({ 
        name: '📝 Session Log', 
        value: auditLog || 'No events yet'
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
                    return `\`${timestamp}\` 📱 Recording started`;
                case 'END':
                    return `\`${timestamp}\` ⏹️ Recording ended`;
                case 'JOIN':
                    return `\`${timestamp}\` ➡️ ${event.user?.tag} joined`;
                case 'LEAVE':
                    return `\`${timestamp}\` ⬅️ ${event.user?.tag} left`;
                default:
                    return '';
            }
        })
        .filter(Boolean)
        .join('\n');

    embed.spliceFields(0, 1, { 
        name: '📝 Session Log', 
        value: auditLog || 'No events yet'
    });

    return embed;
}
