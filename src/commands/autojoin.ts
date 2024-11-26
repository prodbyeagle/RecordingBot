import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { AutojoinService } from '../services/AutojoinService';

let autojoinService: AutojoinService;

export function initializeCommand(service: AutojoinService) {
    autojoinService = service;
}

export const data = new SlashCommandBuilder()
    .setName('autojoin')
    .setDescription('Configure auto-join settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
        subcommand
            .setName('set')
            .setDescription('Set a voice channel for auto-joining')
            .addChannelOption(option =>
                option
                    .setName('channel')
                    .setDescription('The voice channel to auto-join')
                    .addChannelTypes(ChannelType.GuildVoice)
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('adduser')
            .setDescription('Add a user who can trigger the bot to join')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('The user to add')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('removeuser')
            .setDescription('Remove a user from the trigger list')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('The user to remove')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('List all configured users for auto-join')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('disable')
            .setDescription('Disable auto-join for this server')
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    switch (subcommand) {
        case 'set': {
            const channel = interaction.options.getChannel('channel');
            if (!channel) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription('Please select a valid voice channel!')
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            autojoinService.setChannel(guildId, channel.id);
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Auto-Join Channel Set')
                .setDescription(`Channel has been set to ${channel.name}!`)
                .addFields({ 
                    name: 'Next Steps', 
                    value: 'Use `/autojoin adduser` to configure which users can trigger the bot.' 
                })
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
            break;
        }

        case 'adduser': {
            const user = interaction.options.getUser('user');
            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription('Please select a valid user!')
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            if (autojoinService.addTriggerUser(guildId, user.id)) {
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ User Added')
                    .setDescription(`Added ${user.username} to the auto-join trigger list.`)
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription('Please set up an auto-join channel first using `/autojoin set`!')
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            break;
        }

        case 'removeuser': {
            const user = interaction.options.getUser('user');
            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription('Please select a valid user!')
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            if (autojoinService.removeTriggerUser(guildId, user.id)) {
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ User Removed')
                    .setDescription(`Removed ${user.username} from the auto-join trigger list.`)
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription(`${user.username} was not in the auto-join trigger list or no channel is configured.`)
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            break;
        }

        case 'list': {
            const config = autojoinService.getConfig(guildId);
            if (!config?.channelId) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription('No auto-join channel is configured!')
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            const channel = await interaction.guild?.channels.fetch(config.channelId);
            const userList = await Promise.all(
                Array.from(config.triggerUsers).map(async userId => {
                    const user = await interaction.guild?.members.fetch(userId);
                    return {
                        username: user?.user.username || 'Unknown User',
                        id: userId
                    };
                })
            );

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎙️ Auto-Join Configuration')
                .addFields(
                    { name: 'Channel', value: channel ? `<#${channel.id}>` : 'Unknown Channel' },
                    { 
                        name: 'Trigger Users', 
                        value: userList.length === 0 ? 'None' : userList.map(user => `• <@${user.id}>`).join('\n')
                    }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
            break;
        }

        case 'disable': {
            if (autojoinService.disable(guildId)) {
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Auto-Join Disabled')
                    .setDescription('Auto-join has been disabled for this server.')
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Error')
                    .setDescription('Auto-join was not configured for this server.')
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            break;
        }
    }
}
