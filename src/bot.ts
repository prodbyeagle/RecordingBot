import { Client, GatewayIntentBits, Events, Interaction, ChatInputCommandInteraction, ActivityType } from 'discord.js';
import { config } from './utils/config';
import { handleVoiceStateUpdate } from './events/voiceStateUpdate';
import { AudioRecorder } from './utils/audioRecorder';
import commands, { commandsData } from './commands';

/** Required gateway intents for the bot's functionality */
const REQUIRED_INTENTS = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
] as const;

/** Bot presence options */
const BOT_PRESENCE = {
    status: 'online' as const,
    activities: [{
        type: ActivityType.Custom,
        name: "EAGLE RECORDER",
        state: "🦅 Recording your voice!"
    }]
};

/** Discord client instance */
const client = new Client({ 
    intents: REQUIRED_INTENTS,
    presence: BOT_PRESENCE
});

/** Audio recorder instance for handling voice recordings */
new AudioRecorder();

/**
 * Handles errors during command execution
 * @param interaction - The command interaction that failed
 * @param error - The error that occurred
 */
async function handleCommandError(interaction: ChatInputCommandInteraction, error: unknown): Promise<void> {
    console.error('❌ Fehler bei der Ausführung des Befehls:', error instanceof Error ? error.message : error);
    
    const errorMessage = {
        content: 'Es ist ein Fehler beim Ausführen des Befehls aufgetreten.',
        ephemeral: true
    };
    
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    } catch (e) {
        console.error('❌ Fehler beim Senden der Fehlermeldung:', e instanceof Error ? e.message : e);
    }
}

/**
 * Handles incoming slash commands
 * @param interaction - The command interaction to handle
 */
async function handleCommand(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

// Initialize bot events
client.once(Events.ClientReady, async () => {
    console.log(`🚀 Bot ist bereit! Eingeloggt als ${client.user?.tag}`);
    
    try {
        // Set custom status
        client.user?.setPresence(BOT_PRESENCE);
        console.log('✅ Bot-Status erfolgreich aktualisiert');
        
        // Register slash commands
        if (!client.application) {
            throw new Error('Client-Anwendung ist nicht verfügbar');
        }
        
        await client.application.commands.set(commandsData);
        console.log('✅ Slash-Befehle erfolgreich registriert');
    } catch (error) {
        console.error('❌ Fehler bei der Bot-Initialisierung:', error instanceof Error ? error.message : error);
    }
});

// Register event handlers
client.on(Events.InteractionCreate, handleCommand);
client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);

/**
 * Starts the Discord bot
 * Initializes the connection and event handlers
 */
export const startBot = (): void => {
    client.login(config.token).catch(error => {
        console.error('❌ Bot konnte nicht gestartet werden:', error instanceof Error ? error.message : error);
        process.exit(1);
    });
};
