import { VoiceChannel, User } from 'discord.js';
import {
    joinVoiceChannel,
    VoiceConnection,
    VoiceConnectionStatus,
    entersState,
    VoiceReceiver,
    EndBehaviorType
} from '@discordjs/voice';
import { createWriteStream, createReadStream, readdirSync, existsSync } from 'fs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { db } from './supabase';
import { config } from './config';
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import prism from 'prism-media';

/** Interface representing an active recording session for a user */
interface UserRecording {
    audioStream: any;
    fileStream: any;
    filePath: string;
    user: User;
}

/** Interface representing an active recording session in a guild */
interface Recording {
    connection: VoiceConnection;
    receiver: VoiceReceiver;
    recordingPath: string;
    userRecordings: Map<string, UserRecording>;
}

/**
 * AudioRecorder class handles voice channel recording functionality
 * including per-user audio streams and MP3 conversion
 */
export class AudioRecorder {
    private recordings: Map<string, Recording>;

    constructor() {
        this.recordings = new Map();
        this.ensureRecordingDirectory();
    }

    /**
     * Ensures the base recording directory exists
     * @private
     */
    private async ensureRecordingDirectory(): Promise<void> {
        if (!existsSync(config.recordingsPath)) {
            await fs.mkdir(config.recordingsPath, { recursive: true });
        }
    }

    /**
     * Creates a new recording file for a user
     * @private
     * @param userId - Discord user ID
     * @param guildId - Discord guild ID
     * @returns Object containing write stream and file path
     */
    private async createNewRecordingFile(userId: string, guildId: string): Promise<{ stream: any; path: string }> {
        const userDir = join(config.recordingsPath, guildId, userId);
        await fs.mkdir(userDir, { recursive: true });
        
        const filePath = join(userDir, `${Date.now()}.pcm`);
        return {
            stream: createWriteStream(filePath),
            path: filePath
        };
    }

    /**
     * Converts a PCM file to MP3 format using FFmpeg
     * @private
     * @param pcmPath - Path to the PCM file
     * @returns Promise resolving to the MP3 file path
     */
    private async convertToMp3(pcmPath: string): Promise<string> {
        const mp3Path = pcmPath.replace('.pcm', '.mp3');
        
        return new Promise((resolve, reject) => {
            if (!existsSync(config.ffmpegOptions.path)) {
                reject(new Error(`❌ FFmpeg nicht gefunden unter: ${config.ffmpegOptions.path}`));
                return;
            }

            const ffmpeg = spawn(config.ffmpegOptions.path, [
                '-f', 's16le',
                '-ar', '48000',
                '-ac', '2',
                '-i', pcmPath,
                '-c:a', 'libmp3lame',
                '-q:a', '4',
                mp3Path
            ]);
            
            ffmpeg.on('close', async (code) => {
                if (code === 0) {
                    await fs.unlink(pcmPath);
                    resolve(mp3Path);
                } else {
                    reject(new Error(`❌ FFmpeg beendet mit Code ${code}`));
                }
            });

            ffmpeg.on('error', (error) => reject(error));
        });
    }

    /**
     * Starts recording audio in a voice channel
     * @param channel - Discord voice channel to record
     * @param guildId - Discord guild ID
     */
    async startRecording(channel: VoiceChannel, guildId: string): Promise<void> {
        if (this.recordings.has(guildId)) {
            return;
        }

        const guildRecordingPath = join(config.recordingsPath, guildId);
        await fs.mkdir(guildRecordingPath, { recursive: true });

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator as any,
            selfDeaf: false
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

        const recording: Recording = {
            connection,
            receiver: connection.receiver,
            recordingPath: guildRecordingPath,
            userRecordings: new Map()
        };

        this.recordings.set(guildId, recording);

        connection.receiver.speaking.on('start', async (userId) => {
            const currentRecording = this.recordings.get(guildId);
            if (!currentRecording) return;

            try {
                const user = channel.guild.members.cache.get(userId)?.user;
                if (!user) return;

                if (!currentRecording.userRecordings.has(userId)) {
                    const { stream: fileStream, path: filePath } = await this.createNewRecordingFile(userId, guildId);
                    const audioStream = currentRecording.receiver.subscribe(userId, {
                        end: { behavior: EndBehaviorType.Manual }
                    });

                    const opusDecoder = new prism.opus.Decoder({
                        rate: 48000,
                        channels: 2,
                        frameSize: 960
                    });

                    currentRecording.userRecordings.set(userId, {
                        audioStream,
                        fileStream,
                        filePath,
                        user
                    });

                    audioStream.on('error', (error: Error) => 
                        console.error(`❌ Audiostreamfehler (${userId}):`, error.message));
                    opusDecoder.on('error', (error: Error) => 
                        console.error(`❌ Opus-Decoderfehler (${userId}):`, error.message));
                    fileStream.on('error', (error: Error) => 
                        console.error(`❌ Dateistreamfehler (${userId}):`, error.message));

                    await pipeline(audioStream, opusDecoder, fileStream).catch(error => 
                        console.error(`❌ Pipeline-Fehler (${userId}):`, error instanceof Error ? error.message : error));
                }
            } catch (error) {
                console.error('⚠️ Fehler beim Aufnahme-Setup:', error instanceof Error ? error.message : error);
            }
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch {
                await this.stopRecording(guildId);
            }
        });
    }

    /**
     * Stops recording and processes all recorded audio
     * @param guildId - Discord guild ID
     */
    async stopRecording(guildId: string): Promise<void> {
        const recording = this.recordings.get(guildId);
        if (!recording) return;

        try {
            await Promise.all(
                Array.from(recording.userRecordings.entries()).map(async ([userId, userRecording]) => {
                    try {
                        userRecording.audioStream.destroy();
                        userRecording.fileStream.end();
                        
                        const mp3Path = await this.convertToMp3(userRecording.filePath);
                        const stats = await fs.stat(mp3Path);
                        
                        await db.addRecording({
                            file_path: mp3Path,
                            channel_id: recording.connection.joinConfig.channelId || '',
                            guild_id: guildId,
                            duration: 0,
                            file_size: stats.size,
                            recorded_by: userRecording.user.username
                        });
                    } catch (error) {
                        console.error(`⚠️ Fehler bei der Verarbeitung der Aufnahme für Benutzer ${userId}:`, error instanceof Error ? error.message : error);
                    }
                })
            );

            recording.connection.destroy();
            this.recordings.delete(guildId);
        } catch (error) {
            console.error('⚠️ Fehler beim Stoppen der Aufnahme:', error instanceof Error ? error.message : error);
            throw error;
        }
    }
}
