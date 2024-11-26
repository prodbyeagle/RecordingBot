import { VoiceState, VoiceChannel } from 'discord.js';
import { VoiceConnection, joinVoiceChannel, getVoiceConnection, DiscordGatewayAdapterCreator, entersState, VoiceConnectionStatus } from '@discordjs/voice';
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

    constructor(recordingManager: RecordingManager, logger: Logger) {
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
        const guildId = newState.guild.id;
        const config = this.getConfig(guildId);
        if (!config) return;

        // Log for debugging
        console.log('Voice state update:', {
            oldChannel: oldState.channelId,
            newChannel: newState.channelId,
            userId: newState.member?.id,
            configChannel: config.channelId,
            isTriggerUser: newState.member ? config.triggerUsers.has(newState.member.id) : false
        });

        // Handle user joining a channel
        if (newState.channelId === config.channelId && newState.member) {
            if (config.triggerUsers.has(newState.member.id) && !config.currentSession?.isActive()) {
                console.log('Starting recording - trigger user joined target channel');
                await this.startRecording(newState, config);
            }
        }

        // Handle channel becoming empty or trigger user leaving
        if (oldState.channelId === config.channelId) {
            const oldChannel = oldState.channel;
            if (!oldChannel) return;

            const remainingMembers = oldChannel.members.size;
            const hasTriggerUser = oldChannel.members.some(m => config.triggerUsers.has(m.id));

            console.log('Channel state:', {
                remainingMembers,
                hasTriggerUser,
                isCurrentUserTrigger: oldState.member ? config.triggerUsers.has(oldState.member.id) : false
            });

            const shouldStop =
                remainingMembers <= 1 || // Channel is empty (only bot remains)
                (!hasTriggerUser && config.currentSession?.isActive()); // No trigger users left

            if (shouldStop) {
                console.log('Stopping recording - channel empty or no trigger users');
                await this.stopRecording(oldState, config);
            }
        }
    }

    private async startRecording(state: VoiceState, config: AutoJoinConfig): Promise<void> {
        if (!state.channel || !state.member || config.currentSession?.isActive()) return;

        try {
            console.log('Attempting to start recording in channel:', state.channel.name);

            // Join voice channel
            const connection = joinVoiceChannel({
                channelId: state.channel.id,
                guildId: state.guild.id,
                adapterCreator: state.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
                selfDeaf: false
            });

            // Wait for connection to be ready
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
            console.log('Voice connection ready');

            // Start recording session
            const session = await this.recordingManager.startRecording(
                state.channel as VoiceChannel,
                state.member.user,
                {
                    format: 'wav',
                    separateUsers: true,
                    noiseSuppression: true
                }
            );

            config.currentSession = session;
            console.log('Recording session started:', session.getMetadata().id);

            // Log event
            this.logger.logEvent(session.getMetadata().id, {
                type: 'START',
                timestamp: new Date(),
                user: state.member.user
            });

        } catch (error) {
            console.error('Failed to start recording:', error);
            // Log join failure
            this.logger.logEvent('session-error', {
                type: 'LEAVE',
                timestamp: new Date(),
                user: state.member.user
            });
            throw error;
        }
    }

    private async stopRecording(state: VoiceState, config: AutoJoinConfig): Promise<void> {
        if (!config.currentSession || !state.member) return;

        try {
            console.log('Attempting to stop recording session:', config.currentSession.getMetadata().id);

            // Only stop if the session is active
            if (config.currentSession.isActive()) {
                await config.currentSession.stop();
                console.log('Recording session stopped');

                // Log event
                this.logger.logEvent(config.currentSession.getMetadata().id, {
                    type: 'STOP',
                    timestamp: new Date(),
                    user: state.member.user
                });
            }
        } catch (error) {
            console.error('Failed to stop recording:', error);
            // Log error as LEAVE event
            this.logger.logEvent('session-error', {
                type: 'LEAVE',
                timestamp: new Date(),
                user: state.member.user
            });
        } finally {
            // Destroy voice connection
            const connection = getVoiceConnection(state.guild.id);
            if (connection) {
                console.log('Destroying voice connection');
                connection.destroy();
            }

            // Clear the session reference
            config.currentSession = undefined;
        }
    }
}
