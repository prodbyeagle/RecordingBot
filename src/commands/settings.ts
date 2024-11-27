import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { configManager } from '../utils/configManager';

export const data = new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure bot settings')
    .addSubcommand(subcommand =>
        subcommand
            .setName('recording')
            .setDescription('Configure recording settings')
            .addStringOption(option =>
                option
                    .setName('format')
                    .setDescription('Recording format')
                    .addChoices(
                        { name: 'WAV', value: 'wav' },
                        { name: 'MP3', value: 'mp3' }
                    )
            )
            .addIntegerOption(option =>
                option
                    .setName('bitrate')
                    .setDescription('Recording bitrate (kbps) (64-384)')
                    .setMinValue(64)
                    .setMaxValue(384)
            )
            .addBooleanOption(option =>
                option
                    .setName('noise_suppression')
                    .setDescription('Enable noise suppression')
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('logs')
            .setDescription('Configure log channel')
            .addChannelOption(option =>
                option
                    .setName('channel')
                    .setDescription('Channel for bot logs')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
            )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
        return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'recording') {
        const format = interaction.options.getString('format');
        const bitrate = interaction.options.getInteger('bitrate');
        const noiseSuppression = interaction.options.getBoolean('noise_suppression');

        const currentSettings = configManager.getRecordingSettings(guildId) || {};
        const newSettings = {
            ...currentSettings,
            ...(format && { format: format as 'wav' | 'ogg' | 'mp3' }),
            ...(bitrate && { bitrate }),
            ...(noiseSuppression !== null && { noiseSuppression })
        };

        configManager.setRecordingSettings(guildId, newSettings);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Recording Settings Updated')
            .addFields(
                { name: 'Format', value: newSettings.format || 'Default', inline: true },
                { name: 'Bitrate', value: `${newSettings.bitrate || 'Default'} kbps`, inline: true },
                { name: 'Noise Suppression', value: newSettings.noiseSuppression ? 'Enabled' : 'Disabled', inline: true }
            );

        await interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'logs') {
        const channel = interaction.options.getChannel('channel', true);
        
        configManager.setLogChannelId(guildId, channel.id);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Log Channel Updated')
            .setDescription(`Logs will now be sent to ${channel}`);

        await interaction.reply({ embeds: [embed] });
    }
}
