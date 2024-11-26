import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    PermissionFlagsBits,
    ChannelType
} from 'discord.js';
import { db } from '../utils/supabase';
import { Command } from './index';

/** Response messages for config operations */
const MESSAGES = {
    GUILD_ONLY: 'Dieser Befehl kann nur auf einem Server verwendet werden!',
    CONFIG_UPDATED: 'Die Konfiguration wurde erfolgreich aktualisiert.',
    ERROR: 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut.',
    CURRENT_CONFIG: 'Aktuelle Konfiguration:',
} as const;

/** Command builder for config functionality */
export const data = new SlashCommandBuilder()
    .setName('config')
    .setDescription('Verwalte die Bot-Konfiguration')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
        subcommand
            .setName('set')
            .setDescription('Setze einen Konfigurationswert')
            .addChannelOption(option =>
                option
                    .setName('logchannel')
                    .setDescription('Der Kanal für Bot-Logs')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('show')
            .setDescription('Zeige die aktuelle Konfiguration')
    );

/**
 * Handles the config command execution
 * @param interaction - The command interaction
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) {
        await interaction.reply({ content: MESSAGES.GUILD_ONLY, ephemeral: true });
        return;
    }

    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    try {
        switch (subcommand) {
            case 'set':
                await handleSetConfig(interaction);
                break;
            case 'show':
                await handleShowConfig(interaction);
                break;
        }
    } catch (error) {
        console.error('❌ Fehler im Config-Befehl:', error instanceof Error ? error.message : error);
        await interaction.editReply({ content: MESSAGES.ERROR });
    }
}

/**
 * Handles setting config values
 * @param interaction - The command interaction
 */
async function handleSetConfig(interaction: ChatInputCommandInteraction): Promise<void> {
    const logChannel = interaction.options.getChannel('logchannel', true);
    const guildId = interaction.guildId!;

    await db.updateGuildConfig(guildId, {
        log_channel_id: logChannel.id,
    });

    await interaction.editReply({ content: MESSAGES.CONFIG_UPDATED });
}

/**
 * Handles showing current config
 * @param interaction - The command interaction
 */
async function handleShowConfig(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const config = await db.getGuildConfig(guildId);

    if (!config) {
        await interaction.editReply({ content: 'Keine Konfiguration gefunden. Nutze `/config set` um eine zu erstellen.' });
        return;
    }

    const logChannel = interaction.guild?.channels.cache.get(config.log_channel_id);
    
    const configText = [
        MESSAGES.CURRENT_CONFIG,
        `- Log-Kanal: ${logChannel?.toString() || 'Nicht gefunden'} (${config.log_channel_id})`,
        `- Zuletzt aktualisiert: ${new Date(config.updated_at).toLocaleString()}`
    ].join('\n');

    await interaction.editReply({ content: configText });
}
