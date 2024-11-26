import { TextChannel, EmbedBuilder, User } from 'discord.js';
import { ulid } from 'ulid';
import { configManager } from '../utils/configManager';

interface LogEvent {
    type: 'START' | 'STOP' | 'JOIN' | 'LEAVE';
    timestamp: Date;
    user: User;
}

export class Logger {
    private logChannel: TextChannel;
    private events = new Map<string, LogEvent[]>();

    constructor(logChannel: TextChannel) {
        this.logChannel = logChannel;
    }

    logEvent(sessionId: string, event: LogEvent): void {
        if (!this.events.has(sessionId)) {
            this.events.set(sessionId, []);
        }
        this.events.get(sessionId)?.push(event);
    }

    async createRecordingSummary(sessionId: string, channelName: string): Promise<void> {
        const events = this.events.get(sessionId) || [];
        if (events.length === 0) return;

        const startEvent = events.find((e: LogEvent) => e.type === 'START');
        const stopEvent = events.find((e: LogEvent) => e.type === 'STOP');

        if (!startEvent || !stopEvent) return;

        const duration = stopEvent.timestamp.getTime() - startEvent.timestamp.getTime();
        
        const embed = new EmbedBuilder()
            .setTitle('Recording Summary')
            .setColor('#00ff00')
            .addFields([
                { name: 'Recording ID', value: sessionId },
                { name: 'Channel', value: channelName },
                { name: 'Started', value: startEvent.timestamp.toLocaleString() },
                { name: 'Duration', value: this.formatDuration(duration) }
            ]);

        let activityLog = '';
        events.forEach((event: LogEvent) => {
            const timeOffset = event.timestamp.getTime() - startEvent.timestamp.getTime();
            const formattedTime = this.formatDuration(timeOffset);
            
            switch (event.type) {
                case 'JOIN':
                    activityLog += `${formattedTime}: ${event.user.tag} joined the recording.\n`;
                    break;
                case 'LEAVE':
                    activityLog += `${formattedTime}: ${event.user.tag} left the recording.\n`;
                    break;
                case 'STOP':
                    activityLog += `${formattedTime}: Recording stopped by ${event.user.tag}.\n`;
                    break;
            }
        });

        embed.addFields({ name: 'Activity Log', value: activityLog || 'No activity recorded' });

        await this.logChannel.send({ embeds: [embed] });
        this.events.delete(sessionId);
    }

    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}
