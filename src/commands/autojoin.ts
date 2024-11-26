import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    PermissionFlagsBits,
    User
} from 'discord.js';
import { db } from '../utils/supabase';
import { settings } from '../utils/settings';
import { Command } from './index';

/** Response messages for autojoin operations */
const MESSAGES = {
    GUILD_ONLY: 'Dieser Befehl kann nur auf einem Server verwendet werden!',
    USER_ADDED: (user: User) => `${user.tag} wurde zur Auto-Join Liste hinzugefügt.`,
    USER_REMOVED: (user: User) => `${user.tag} wurde von der Auto-Join Liste entfernt.`,
    USER_NOT_FOUND: (user: User) => `${user.tag} ist nicht in der Auto-Join Liste.`,
    ERROR: 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut.',
    NO_USERS: 'Keine Auto-Join User konfiguriert.',
    USER_LIST: 'Auto-Join User:'
} as const;

/** Command builder for autojoin functionality */
export const data = new SlashCommandBuilder()
    .setName('autojoin')
    .setDescription('Verwalte Auto-Join User')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Füge einen User zur Auto-Join Liste hinzu')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('Der User, der hinzugefügt werden soll')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Entferne einen User von der Auto-Join Liste')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('Der User, der entfernt werden soll')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('Zeige alle Auto-Join User')
    );

/**
 * Handles the autojoin command execution
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
            case 'add':
                await handleAddUser(interaction);
                break;
            case 'remove':
                await handleRemoveUser(interaction);
                break;
            case 'list':
                await handleListUsers(interaction);
                break;
        }
    } catch (error) {
        console.error('Error in autojoin command:', error);
        await interaction.editReply({ content: MESSAGES.ERROR });
    }
}

/**
 * Handles adding a user to the auto-join list
 * @param interaction - The command interaction
 */
async function handleAddUser(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user', true);
    const guildId = interaction.guildId!;
    
    const guildSettings = await settings.getGuildSettings(guildId);
    const autoJoinUsers = new Set(guildSettings?.auto_join_users || []);
    
    autoJoinUsers.add(user.id);
    await settings.updateGuildSettings(guildId, { auto_join_users: Array.from(autoJoinUsers) });
    
    await interaction.editReply({ content: MESSAGES.USER_ADDED(user) });
}

/**
 * Handles removing a user from the auto-join list
 * @param interaction - The command interaction
 */
async function handleRemoveUser(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user', true);
    const guildId = interaction.guildId!;
    
    const guildSettings = await settings.getGuildSettings(guildId);
    const autoJoinUsers = new Set(guildSettings?.auto_join_users || []);
    
    if (!autoJoinUsers.has(user.id)) {
        await interaction.editReply({ content: MESSAGES.USER_NOT_FOUND(user) });
        return;
    }
    
    autoJoinUsers.delete(user.id);
    await settings.updateGuildSettings(guildId, { auto_join_users: Array.from(autoJoinUsers) });
    
    await interaction.editReply({ content: MESSAGES.USER_REMOVED(user) });
}

/**
 * Handles listing all auto-join users
 * @param interaction - The command interaction
 */
async function handleListUsers(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const guildSettings = await settings.getGuildSettings(guildId);
    const autoJoinUsers = guildSettings?.auto_join_users || [];
    
    if (autoJoinUsers.length === 0) {
        await interaction.editReply({ content: MESSAGES.NO_USERS });
        return;
    }
    
    const userList = await Promise.all(
        autoJoinUsers.map(async (userId) => {
            try {
                const user = await interaction.client.users.fetch(userId);
                return `- ${user.tag}`;
            } catch {
                return `- Unknown User (${userId})`;
            }
        })
    );
    
    await interaction.editReply({
        content: `${MESSAGES.USER_LIST}\n${userList.join('\n')}`
    });
}
