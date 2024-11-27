import dotenv from 'dotenv';

// Load environment variables before importing config
const result = dotenv.config();
if (result.error) {
    console.error('Error loading .env file:', result.error);
    process.exit(1);
}

// Debug: Log environment variables (without sensitive data)
console.log('Environment loaded:', {
    tokenExists: !!process.env.TOKEN,
    clientIdExists: !!process.env.CLIENT_ID,
});

import { Client, GatewayIntentBits, Events, TextChannel, VoiceState, Collection, REST, Routes } from 'discord.js';
import { RecordingManager } from './services/recording';
import { Logger } from './services/Logger';
import { botConfig } from './config';
import { AutojoinService } from './services/AutojoinService';
import { configManager } from './utils/configManager';
import * as settingsCommand from './commands/settings';
import * as autojoinCommand from './commands/autojoin';

interface Command {
    data: any;
    execute: (interaction: any) => Promise<void>;
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const commands = new Collection<string, Command>();
let logger: Logger;
let autojoinService: AutojoinService;

client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user?.tag}`);

    // Initialize logger with audit log channel if configured
    const guildId = (await client.guilds.fetch()).first()?.id;
    if (guildId) {
        const logChannelId = configManager.getLogChannelId(guildId);
        if (logChannelId) {
            const channel = await client.channels.fetch(logChannelId) as TextChannel;
            logger = new Logger(channel);
        } else {
            // Create a temporary logger that just console.logs until audit channel is set
            logger = new Logger({
                send: async (content: any) => {
                    console.log('[Audit Log]', content);
                    return null as any;
                }
            } as any);
        }
    } else {
        // Fallback logger if no guild is available
        logger = new Logger({
            send: async (content: any) => {
                console.log('[Audit Log]', content);
                return null as any;
            }
        } as any);
    }

    // Initialize services
    const recordingManager = new RecordingManager();
    autojoinService = new AutojoinService(client, recordingManager, logger);
    autojoinCommand.initializeCommand(autojoinService);

    // Register commands
    commands.set(settingsCommand.data.name, settingsCommand);
    commands.set(autojoinCommand.data.name, autojoinCommand);

    // Get the first guild the bot is in
    const guilds = await client.guilds.fetch();
    const firstGuild = guilds.first();
    if (!firstGuild) {
        console.error('Bot is not in any guild!');
        return;
    }

    // Register slash commands
    const rest = new REST().setToken(botConfig.token);
    const commandsData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());

    try {
        // First, delete all existing commands
        console.log('Clearing existing commands...');
        await rest.put(
            Routes.applicationGuildCommands(botConfig.clientId, firstGuild.id),
            { body: [] }
        );
        console.log('Successfully cleared all existing commands.');

        // Then register new commands
        console.log('Registering new commands...');
        await rest.put(
            Routes.applicationGuildCommands(botConfig.clientId, firstGuild.id),
            { body: commandsData }
        );
        console.log('Successfully registered new application commands.');
    } catch (error) {
        console.error('Error managing application commands:', error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        const errorMessage = { content: 'There was an error executing this command!', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
    await autojoinService?.handleVoiceStateUpdate(oldState, newState);
});

// Debug: Log token (length only for security)
console.log('Token length:', botConfig.token?.length || 0);

// Validate token before login
if (!botConfig.token) {
    console.error('No Discord token found in environment variables!');
    process.exit(1);
}

client.login(botConfig.token);
