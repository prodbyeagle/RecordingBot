import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface GuildConfig {
    autoJoinChannelId?: string;
    autoJoinTriggerUsers?: string[];
    recordingSettings?: {
        format: 'wav' | 'ogg' | 'mp3';
        sampleRate: number;
        channels: number;
        bitrate: number;
        noiseSuppression: boolean;
        echoCancellation: boolean;
        silenceThreshold: number;
    };
    logChannelId?: string;
}

class ConfigManager {
    private configs: Map<string, GuildConfig> = new Map();
    private configPath: string;

    constructor() {
        this.configPath = join(process.cwd(), 'config');
        this.ensureConfigDirectory();
        this.loadConfigs();
    }

    private ensureConfigDirectory(): void {
        if (!existsSync(this.configPath)) {
            mkdirSync(this.configPath, { recursive: true });
        }
    }

    private loadConfigs(): void {
        const configFile = join(this.configPath, 'guilds.json');
        if (existsSync(configFile)) {
            try {
                const data = JSON.parse(readFileSync(configFile, 'utf8'));
                Object.entries(data).forEach(([guildId, config]) => {
                    this.configs.set(guildId, config as GuildConfig);
                });
            } catch (error) {
                console.error('Error loading configs:', error);
            }
        }
    }

    private saveConfigs(): void {
        const configFile = join(this.configPath, 'guilds.json');
        try {
            const data = Object.fromEntries(this.configs.entries());
            writeFileSync(configFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving configs:', error);
        }
    }

    private getGuildConfig(guildId: string): GuildConfig {
        if (!this.configs.has(guildId)) {
            this.configs.set(guildId, {});
        }
        return this.configs.get(guildId)!;
    }

    // AutoJoin Configuration
    public setAutoJoinConfig(guildId: string, channelId: string): void {
        const config = this.getGuildConfig(guildId);
        config.autoJoinChannelId = channelId;
        this.saveConfigs();
    }

    public getAutoJoinChannelId(guildId: string): string | undefined {
        return this.getGuildConfig(guildId).autoJoinChannelId;
    }

    public addAutoJoinTriggerUser(guildId: string, userId: string): boolean {
        const config = this.getGuildConfig(guildId);
        if (!config.autoJoinTriggerUsers) {
            config.autoJoinTriggerUsers = [];
        }
        if (!config.autoJoinTriggerUsers.includes(userId)) {
            config.autoJoinTriggerUsers.push(userId);
            this.saveConfigs();
            return true;
        }
        return false;
    }

    public removeAutoJoinTriggerUser(guildId: string, userId: string): boolean {
        const config = this.getGuildConfig(guildId);
        if (config.autoJoinTriggerUsers) {
            const index = config.autoJoinTriggerUsers.indexOf(userId);
            if (index !== -1) {
                config.autoJoinTriggerUsers.splice(index, 1);
                this.saveConfigs();
                return true;
            }
        }
        return false;
    }

    public getAutoJoinTriggerUsers(guildId: string): string[] {
        return this.getGuildConfig(guildId).autoJoinTriggerUsers || [];
    }

    public clearAutoJoinConfig(guildId: string): void {
        const config = this.getGuildConfig(guildId);
        delete config.autoJoinChannelId;
        delete config.autoJoinTriggerUsers;
        this.saveConfigs();
    }

    // Recording Settings
    public getRecordingSettings(guildId: string): GuildConfig['recordingSettings'] | undefined {
        return this.getGuildConfig(guildId).recordingSettings;
    }

    public setRecordingSettings(guildId: string, settings: Partial<GuildConfig['recordingSettings']>): void {
        const config = this.getGuildConfig(guildId);
        config.recordingSettings = {
            ...config.recordingSettings,
            ...settings
        } as GuildConfig['recordingSettings'];
        this.saveConfigs();
    }

    // Logging
    public getLogChannelId(guildId: string): string | undefined {
        return this.getGuildConfig(guildId).logChannelId;
    }

    public setLogChannelId(guildId: string, channelId: string): void {
        const config = this.getGuildConfig(guildId);
        config.logChannelId = channelId;
        this.saveConfigs();
    }
}

export const configManager = new ConfigManager();
