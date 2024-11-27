import { TextChannel, EmbedBuilder, User, Message, ColorResolvable, AttachmentBuilder } from 'discord.js';

interface LogEvent {
    type: 'START' | 'STOP' | 'JOIN' | 'LEAVE';
    timestamp: Date;
    user: User;
    recordingPath?: string; // Path to the recording file
}

export class Logger {
    private logChannel: TextChannel | null = null;
    private events = new Map<string, LogEvent[]>();
    private activeMessages = new Map<string, Message>();

    constructor(logChannel?: TextChannel) {
        if (logChannel) {
            this.logChannel = logChannel;
        }
    }

    public setLogChannel(channel: TextChannel): void {
        this.logChannel = channel;
    }

    public log(message: string): void {
        console.log(message);
    }

    public debug(message: string): void {
        if (process.env.DEBUG) {
            console.log(`[DEBUG] ${message}`);
        }
    }

    public info(message: string): void {
        console.log(message);
    }

    public error(message: string, error?: any): void {
        console.error(message, error);
    }

    async logEvent(sessionId: string, event: LogEvent, channelName?: string): Promise<void> {
        if (!this.logChannel) {
            console.log('No log channel set');
            return;
        }

        // Store the event
        if (!this.events.has(sessionId)) {
            this.events.set(sessionId, []);
        }
        this.events.get(sessionId)?.push(event);

        // If this is a START event, create initial embed
        if (event.type === 'START' && channelName) {
            const embed = new EmbedBuilder()
                .setTitle('🎙️ Recording Started')
                .setColor(0x00FF00 as ColorResolvable)
                .setTimestamp(event.timestamp)
                .addFields([
                    { name: 'Channel', value: `<#${this.logChannel.guild.channels.cache.find(c => c.name === channelName)?.id}>`, inline: true },
                    { name: 'Started by', value: `<@${event.user.id}>`, inline: true },
                    { name: 'Recording ID', value: sessionId },
                    { name: 'Participants', value: `<@${event.user.id}>` },
                    { name: 'Status', value: '🟢 Recording in Progress' }
                ]);

            const message = await this.logChannel.send({ embeds: [embed] });
            this.activeMessages.set(sessionId, message);
        }
        // For other events, update the existing embed
        else if (this.activeMessages.has(sessionId)) {
            await this.updateEmbed(sessionId);
        }
    }

    private async updateEmbed(sessionId: string): Promise<void> {
        if (!this.logChannel) return;

        const message = this.activeMessages.get(sessionId);
        const events = this.events.get(sessionId);
        if (!message || !events) return;

        const startEvent = events.find(e => e.type === 'START');
        if (!startEvent) return;

        const now = new Date();
        const duration = now.getTime() - startEvent.timestamp.getTime();

        let status = '🟢 Recording in Progress';
        let color: ColorResolvable = 0x00FF00;

        const lastEvent = events[events.length - 1];
        if (lastEvent.type === 'STOP') {
            status = '🔴 Recording Ended';
            color = 0xFF0000;
        }

        // Get unique participants
        const participants = new Set<string>();
        events.forEach(event => {
            if (event.type === 'JOIN' || event.type === 'START') {
                participants.add(`<@${event.user.id}>`);
            }
            if (event.type === 'LEAVE') {
                participants.delete(`<@${event.user.id}>`);
            }
        });

        let activityLog = '';
        events.forEach((event: LogEvent) => {
            const timeOffset = event.timestamp.getTime() - startEvent.timestamp.getTime();
            const formattedTime = this.formatDuration(timeOffset);
            
            switch (event.type) {
                case 'JOIN':
                    activityLog += `\`${formattedTime}\` ➡️ <@${event.user.id}> joined\n`;
                    break;
                case 'LEAVE':
                    activityLog += `\`${formattedTime}\` ⬅️ <@${event.user.id}> left\n`;
                    break;
                case 'STOP':
                    activityLog += `\`${formattedTime}\` 🛑 Recording ended by <@${event.user.id}>\n`;
                    break;
            }
        });

        const embed = new EmbedBuilder()
            .setTitle(lastEvent.type === 'STOP' ? '🎙️ Recording Ended' : '🎙️ Recording in Progress')
            .setColor(color)
            .setTimestamp(startEvent.timestamp)
            .addFields([
                { name: 'Channel', value: message.embeds[0].fields[0].value, inline: true },
                { name: 'Started by', value: message.embeds[0].fields[1].value, inline: true },
                { name: 'Recording ID', value: sessionId },
                { name: 'Duration', value: this.formatDuration(duration) },
                { name: 'Current Participants', value: Array.from(participants).join('\n') || 'No participants' },
                { name: 'Status', value: status },
                { name: 'Activity Log', value: activityLog || 'No activity recorded' }
            ]);

        // If this is a STOP event and we have a recording file, attach it
        if (lastEvent.type === 'STOP' && lastEvent.recordingPath) {
            try {
                const attachment = new AttachmentBuilder(lastEvent.recordingPath);
                await message.edit({ embeds: [embed], files: [attachment] });
            } catch (error) {
                console.error('Failed to attach recording file:', error);
                await message.edit({ embeds: [embed] });
            }
        } else {
            await message.edit({ embeds: [embed] });
        }

        // If recording stopped, clean up after 1 minute
        if (lastEvent.type === 'STOP') {
            setTimeout(() => {
                this.activeMessages.delete(sessionId);
                this.events.delete(sessionId);
            }, 60000);
        }
    }

    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}
