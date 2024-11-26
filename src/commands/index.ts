import { Collection, ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import * as settingsCommand from './settings';
import * as autojoinCommand from './autojoin';
import * as configCommand from './config';

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
commands.set(configCommand.data.name, configCommand);

/** Command data for Discord API registration */
export const commandsData = [
    settingsCommand.data.toJSON(),
    autojoinCommand.data.toJSON(),
    configCommand.data.toJSON()
];

export default commands;
