import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    PermissionFlagsBits,
    ChannelType
} from 'discord.js';
import { settings } from '../utils/settings';

export const data = new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Verwalte die Bot-Einstellungen')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
        subcommand
            .setName('channel')
            .setDescription('Setze den Voice-Channel für Aufnahmen')
            .addChannelOption(option =>
                option
                    .setName('channel')
                    .setDescription('Der Voice-Channel')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildVoice)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('maxlength')
            .setDescription('Setze die maximale Aufnahmedauer in Stunden')
            .addIntegerOption(option =>
                option
                    .setName('hours')
                    .setDescription('Maximale Stunden (1-24)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(24)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('retention')
            .setDescription('Setze die Anzahl der Tage, die Aufnahmen aufbewahrt werden')
            .addIntegerOption(option =>
                option
                    .setName('days')
                    .setDescription('Anzahl der Tage (1-30)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(30)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('autojoin')
            .setDescription('Aktiviere/Deaktiviere automatisches Joinen')
            .addBooleanOption(option =>
                option
                    .setName('enabled')
                    .setDescription('Aktiviert oder deaktiviert')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('show')
            .setDescription('Zeige die aktuellen Einstellungen')
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
        await interaction.reply({ content: 'Dieser Befehl kann nur auf einem Server verwendet werden!', ephemeral: true });
        return;
    }

    const subcommand = interaction.options.getSubcommand();

    try {
        switch (subcommand) {
            case 'channel': {
                const channel = interaction.options.getChannel('channel', true);
                await settings.setTargetChannel(interaction.guildId, channel.id);
                await interaction.reply({ content: `Voice-Channel für Aufnahmen wurde auf ${channel.name} gesetzt.`, ephemeral: true });
                break;
            }

            case 'maxlength': {
                const hours = interaction.options.getInteger('hours', true);
                await settings.setMaxRecordingLength(interaction.guildId, hours);
                await interaction.reply({ content: `Maximale Aufnahmedauer wurde auf ${hours} Stunden gesetzt.`, ephemeral: true });
                break;
            }

            case 'retention': {
                const days = interaction.options.getInteger('days', true);
                await settings.setRetentionDays(interaction.guildId, days);
                await interaction.reply({ content: `Aufbewahrungsdauer wurde auf ${days} Tage gesetzt.`, ephemeral: true });
                break;
            }

            case 'autojoin': {
                const enabled = interaction.options.getBoolean('enabled', true);
                await settings.setAutoJoinEnabled(interaction.guildId, enabled);
                await interaction.reply({ 
                    content: `Automatisches Joinen wurde ${enabled ? 'aktiviert' : 'deaktiviert'}.`, 
                    ephemeral: true 
                });
                break;
            }

            case 'show': {
                const guildSettings = await settings.getGuildSettings(interaction.guildId);
                const channel = interaction.guild?.channels.cache.get(guildSettings.target_voice_channel);
                
                const settingsEmbed = {
                    color: 0x0099FF,
                    title: 'Bot Einstellungen',
                    fields: [
                        {
                            name: 'Voice-Channel',
                            value: channel ? channel.name : 'Nicht gesetzt',
                            inline: true
                        },
                        {
                            name: 'Max. Aufnahmedauer',
                            value: `${guildSettings.max_recording_length / (60 * 60 * 1000)} Stunden`,
                            inline: true
                        },
                        {
                            name: 'Aufbewahrungsdauer',
                            value: `${guildSettings.recording_retention_days} Tage`,
                            inline: true
                        },
                        {
                            name: 'Auto-Join',
                            value: guildSettings.auto_join_enabled ? 'Aktiviert' : 'Deaktiviert',
                            inline: true
                        }
                    ],
                    timestamp: new Date().toISOString()
                };

                await interaction.reply({ embeds: [settingsEmbed], ephemeral: true });
                break;
            }
        }
    } catch (error) {
        console.error('Error in settings command:', error);
        await interaction.reply({ 
            content: 'Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.', 
            ephemeral: true 
        });
    }
}
