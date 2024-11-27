import { User } from 'discord.js';
import { Logger } from '../Logger';
import { RecordingEvent, RecordingEventData, RecordingEventHandler } from './types';

export function createRecordingEventLogger(logger: Logger): RecordingEventHandler {
    return async (event: RecordingEvent, data?: RecordingEventData): Promise<void> => {
        if (!data?.metadata) return;

        const channelName = data.channel?.name;
        const user = data.user;
        if (!user) return;

        const sessionId = data.metadata.sessionId;

        switch (event) {
            case 'start':
                await logger.logEvent(sessionId, {
                    type: 'START',
                    timestamp: new Date(),
                    user
                }, channelName);
                break;

            case 'stop':
                await logger.logEvent(sessionId, {
                    type: 'STOP',
                    timestamp: new Date(),
                    user,
                    recordingPath: data.metadata.outputPath
                });
                break;

            case 'userJoined':
                await logger.logEvent(sessionId, {
                    type: 'JOIN',
                    timestamp: new Date(),
                    user
                });
                break;

            case 'userLeft':
                await logger.logEvent(sessionId, {
                    type: 'LEAVE',
                    timestamp: new Date(),
                    user
                });
                break;
        }
    };
}
