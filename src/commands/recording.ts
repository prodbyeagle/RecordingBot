import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, VoiceChannel } from 'discord.js';
import { RecordingManager } from '../services/recording/RecordingManager';

let recordingManager: RecordingManager;

export function initializeCommand(manager: RecordingManager) {
    recordingManager = manager;
}

export const data = new SlashCommandBuilder()
    .setName('recording')
    .setDescription('Recording commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
        subcommand
            .setName('join')
            .setDescription('Join a voice channel and start recording')
            .addChannelOption(option =>
                option
                    .setName('channel')
                    .setDescription('The voice channel to join and record')
                    .addChannelTypes(ChannelType.GuildVoice)
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('end')
            .setDescription('Stop recording and leave the voice channel')
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'join') {
        const channel = interaction.options.getChannel('channel') as VoiceChannel;
        
        try {
            const session = await recordingManager.startRecording(channel, interaction.user);
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Recording Started')
                .setDescription(`Started recording in channel ${channel.name}`);
            
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Error')
                .setDescription('Failed to start recording. Please make sure I have the correct permissions.');
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } else if (subcommand === 'end') {
        try {
            const sessions = recordingManager.getActiveSessions();
            let stopped = false;

            for (const [sessionId, session] of sessions) {
                const metadata = session.getMetadata();
                if (metadata.guildId === interaction.guildId) {
                    await session.stop();
                    stopped = true;
                    break;
                }
            }

            if (stopped) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('Recording Ended')
                    .setDescription('Successfully stopped recording and left the voice channel.');
                
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('No Active Recording')
                    .setDescription('There is no active recording to stop.');
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Error')
                .setDescription('Failed to stop recording.');
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
}
