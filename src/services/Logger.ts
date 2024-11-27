import { TextChannel, EmbedBuilder, User, Message, ColorResolvable } from 'discord.js';

interface LogEvent {
    type: 'START' | 'STOP' | 'JOIN' | 'LEAVE';
    timestamp: Date;
    user: User;
}

export class Logger {
    private logChannel: TextChannel;
    private events = new Map<string, LogEvent[]>();
    private activeMessages = new Map<string, Message>();

    constructor(logChannel: TextChannel) {
        this.logChannel = logChannel;
    }

    public log(message: string): void {
        console.log(message);
    }

    public info(message: string): void {
        console.log(message);
    }

    public error(message: string, error?: any): void {
        console.error(message, error);
    }

    async logEvent(sessionId: string, event: LogEvent, channelName?: string): Promise<void> {
        // Store the event
        if (!this.events.has(sessionId)) {
            this.events.set(sessionId, []);
        }
        this.events.get(sessionId)?.push(event);

        // If this is a START event, create initial embed
        if (event.type === 'START' && channelName) {
            const embed = new EmbedBuilder()
                .setTitle('🎙️ Recording in Progress')
                .setColor(0x00FF00 as ColorResolvable)
                .addFields([
                    { name: 'Recording ID', value: sessionId },
                    { name: 'Channel', value: channelName },
                    { name: 'Started', value: event.timestamp.toLocaleString() },
                    { name: 'Started by', value: event.user.tag },
                    { name: 'Duration', value: '00:00:00' },
                    { name: 'Status', value: '🟢 Recording...' }
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
        const message = this.activeMessages.get(sessionId);
        const events = this.events.get(sessionId);
        if (!message || !events) return;

        const startEvent = events.find(e => e.type === 'START');
        if (!startEvent) return;

        const now = new Date();
        const duration = now.getTime() - startEvent.timestamp.getTime();

        let status = '🟢 Recording...';
        let color: ColorResolvable = 0x00FF00; // Green in hex

        const lastEvent = events[events.length - 1];
        if (lastEvent.type === 'STOP') {
            status = '🔴 Stopped';
            color = 0xFF0000; // Red in hex
        }

        let activityLog = '';
        events.forEach((event: LogEvent) => {
            const timeOffset = event.timestamp.getTime() - startEvent.timestamp.getTime();
            const formattedTime = this.formatDuration(timeOffset);
            
            switch (event.type) {
                case 'JOIN':
                    activityLog += `${formattedTime}: ${event.user.tag} joined\n`;
                    break;
                case 'LEAVE':
                    activityLog += `${formattedTime}: ${event.user.tag} left\n`;
                    break;
                case 'STOP':
                    activityLog += `${formattedTime}: Recording stopped by ${event.user.tag}\n`;
                    break;
            }
        });

        const embed = new EmbedBuilder()
            .setTitle('🎙️ Recording Status')
            .setColor(color)
            .addFields([
                { name: 'Recording ID', value: sessionId },
                { name: 'Started', value: startEvent.timestamp.toLocaleString() },
                { name: 'Duration', value: this.formatDuration(duration) },
                { name: 'Status', value: status },
                { name: 'Activity Log', value: activityLog || 'No activity recorded' }
            ]);

        await message.edit({ embeds: [embed] });

        // If recording stopped, clean up
        if (lastEvent.type === 'STOP') {
            this.activeMessages.delete(sessionId);
            this.events.delete(sessionId);
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
