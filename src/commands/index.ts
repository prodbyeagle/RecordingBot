import { Collection, ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import * as settingsCommand from './settings';
import * as autojoinCommand from './autojoin';

/** Interface for command structure */
export interface Command {
    /** Command metadata and structure */
    data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
    /** Command execution function */
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

/** Collection of available bot commands */
const commands = new Collection<string, Command>();
commands.set(settingsCommand.data.name, settingsCommand);
commands.set(autojoinCommand.data.name, autojoinCommand);

/** Command data for Discord API registration */
export const commandsData = [
    settingsCommand.data.toJSON(),
    autojoinCommand.data.toJSON()
];

export default commands;
