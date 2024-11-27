import { VoiceState, VoiceChannel, Client, GuildMember, VoiceBasedChannel, StageChannel } from 'discord.js';
import { RecordingManager } from './recording/RecordingManager';
import { Logger } from './Logger';
import { configManager } from '../utils/configManager';
import { RecordingSession } from './recording/RecordingSession';

interface AutoJoinConfig {
    channelId: string;
    triggerUsers: Set<string>;
    currentSession?: RecordingSession;
}

export class AutojoinService {
    private recordingManager: RecordingManager;
    private logger: Logger;
    private configs: Map<string, AutoJoinConfig> = new Map();
    private client: Client;

    constructor(client: Client, recordingManager: RecordingManager, logger: Logger) {
        this.client = client;
        this.recordingManager = recordingManager;
        this.logger = logger;
    }

    public setChannel(guildId: string, channelId: string): void {
        configManager.setAutoJoinConfig(guildId, channelId);
    }

    public addTriggerUser(guildId: string, userId: string): boolean {
        return configManager.addAutoJoinTriggerUser(guildId, userId);
    }

    public removeTriggerUser(guildId: string, userId: string): boolean {
        return configManager.removeAutoJoinTriggerUser(guildId, userId);
    }

    public getConfig(guildId: string): AutoJoinConfig | undefined {
        // Get from cache first
        if (this.configs.has(guildId)) {
            return this.configs.get(guildId);
        }

        // Load from persistent storage
        const channelId = configManager.getAutoJoinChannelId(guildId);
        const triggerUsers = configManager.getAutoJoinTriggerUsers(guildId);

        if (channelId) {
            const config: AutoJoinConfig = {
                channelId,
                triggerUsers: new Set(triggerUsers)
            };
            this.configs.set(guildId, config);
            return config;
        }

        return undefined;
    }

    public disable(guildId: string): boolean {
        // Stop any active recording
        const config = this.configs.get(guildId);
        if (config?.currentSession) {
            config.currentSession.stop();
            config.currentSession = undefined;
        }

        // Clear config
        this.configs.delete(guildId);
        configManager.clearAutoJoinConfig(guildId);
        return true;
    }

    public async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
        try {
            const guildId = newState.guild.id;
            const config = this.getConfig(guildId);
            
            // If no config exists for this guild, ignore
            if (!config) return;

            // Check if this is a trigger user joining a channel
            if (newState.channel && config.triggerUsers.has(newState.member?.id || '') && 
                (!oldState.channel || oldState.channel.id !== newState.channel.id)) {
                
                this.logger.debug(`[AutojoinService] Trigger user ${newState.member?.user.tag} joined channel ${newState.channel.name}`);
                
                // Start new recording if not already recording
                if (!config.currentSession || !config.currentSession.isActive()) {
                    if (newState.channel instanceof VoiceChannel) {
                        config.currentSession = await this.recordingManager.startRecording(
                            newState.channel,
                            newState.member!.user
                        );
                        this.logger.debug(`[AutojoinService] Started recording in channel ${newState.channel.name}`);
                    }
                }
                return;
            }

            // Handle existing recording sessions
            const session = this.findSessionForMember(oldState.member || newState.member);
            if (!session) return;

            const metadata = session.getMetadata();
            
            // Check if the bot should leave
            if (this.shouldLeaveChannel(newState.channel)) {
                this.logger.log(`[AutojoinService] No active users in channel ${metadata.channelId}, stopping recording`);
                await session.stop();
                if (config.currentSession === session) {
                    config.currentSession = undefined;
                }
                return;
            }

            // Check if recording should follow users
            if (this.shouldFollowUser(oldState, newState)) {
                const newChannel = newState.channel;
                if (!newChannel || !(newChannel instanceof VoiceChannel)) return;

                this.logger.log(`[AutojoinService] Following user to new channel ${newChannel.name}`);
                await session.stop();
                config.currentSession = await this.recordingManager.startRecording(
                    newChannel,
                    await this.client.users.fetch(metadata.initiator),
                    metadata.options
                );
            }
        } catch (error) {
            this.logger.error('[AutojoinService] Error handling voice state update:', error);
        }
    }

    private findSessionForMember(member: GuildMember | null): RecordingSession | undefined {
        if (!member) return undefined;

        for (const [sessionId, session] of this.recordingManager.getActiveSessions()) {
            const metadata = session.getMetadata();
            if (metadata.guildId === member.guild.id && session.isActive()) {
                return session;
            }
        }
        return undefined;
    }

    private shouldLeaveChannel(channel: VoiceBasedChannel | null): boolean {
        if (!channel) return true;
        
        // Count non-bot members in the channel
        const nonBotMembers = channel.members.filter(member => !member.user.bot).size;
        return nonBotMembers === 0;
    }

    private shouldFollowUser(oldState: VoiceState, newState: VoiceState): boolean {
        // Don't follow if user disconnected or if it's a stage channel
        if (!newState.channel || newState.channel instanceof StageChannel) return false;

        // Don't follow bots
        if (newState.member?.user.bot) return false;

        // Only follow if user was in a channel we were recording
        const oldSession = this.findSessionForMember(oldState.member);
        if (!oldSession || !oldSession.isActive()) return false;

        // Make sure we're not already in the new channel
        const newSession = this.findSessionForMember(newState.member);
        return !newSession;
    }
}
