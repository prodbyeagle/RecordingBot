# Discord Recording Bot 🎙️

A Discord bot for automatically recording voice channels, developed with Discord.js and TypeScript.

## Features 🌟

- **Automatic Recording** - Automatically records voice channels
- **Auto-Join System** - Automatically joins specific users
- **Server Configuration** - Individual settings per Discord server
- **Logging** - Detailed logging of all bot activities

## Commands 🛠️

### Auto-Join Commands
- `/autojoin add <user>` - Add a user to the auto-join list
- `/autojoin remove <user>` - Remove a user from the auto-join list
- `/autojoin list` - Show all auto-join users

### Settings Commands
- `/settings autojoin <enable/disable>` - Enable or disable auto-join feature
- `/settings channel <channel>` - Set the recording output channel
- `/settings maxlength <minutes>` - Set maximum recording length
- `/settings retention <days>` - Set how long recordings are kept
- `/settings show` - Display current settings

## Installation 📥

1. Clone the repository
```bash
git clone https://github.com/prodbyeagle/RecordingBot
cd RecordingBot
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
Create a `.env` file with the following variables:
```env
TOKEN=your_discord_bot_token
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
RECORDINGS_PATH=./recordings
FFMPEG_PATH=path/to/ffmpeg.exe
```

4. Start the bot
```bash
npm run start
```

## Technical Requirements 🔧

- Node.js 16.x or higher
- FFmpeg
- TypeScript
- Discord.js v14
- Supabase for data storage

## Database Schema 📊

### auto_join_users
- `id` - Primary key
- `user_id` - Discord user ID
- `guild_id` - Discord server ID
- `created_at` - Creation timestamp

### bot_config
- `id` - Primary key
- `guild_id` - Discord server ID
- `log_channel_id` - Log channel ID
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

## Development 👨‍💻

This project uses TypeScript for better code quality and maintainability. The project structure is as follows:

```
src/
├── commands/        # Discord slash commands
├── events/         # Discord event handlers
└── utils/          # Helper functions and utilities
