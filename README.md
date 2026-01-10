# Baltimore Scanner

Live Police, Fire & EMS radio scanner for Baltimore City with Whisper AI transcription running entirely in your browser.

## Features

- **Tab Audio Capture** - Capture audio directly from the Broadcastify browser tab
- **Whisper AI Transcription** - OpenAI's Whisper model runs locally in your browser (no server needed)
- **Audio Visualizer** - Real-time frequency visualization
- **Volume Control** - Adjust playback volume
- **Timestamped Transcript** - Each entry shows when it was captured
- **Privacy First** - All processing happens locally, no data sent to servers

## How to Use

1. Click **"Load Model"** to download the Whisper AI model (~40MB, one-time download)
2. Open the [Broadcastify player](https://www.broadcastify.com/webPlayer/40593) in a new tab and start playing
3. Return to Baltimore Scanner and click **"Capture Tab Audio"**
4. Select the Broadcastify tab and check **"Share tab audio"**
5. Click **"Start Transcription"** to begin AI-powered speech-to-text

## Live Demo

Visit: https://arandomguyhere.github.io/baltimorescanner/

## Requirements

- **Browser:** Chrome or Edge (required for tab audio capture)
- **Internet:** Required for Broadcastify stream and first-time model download
- **Storage:** ~40MB for Whisper model (cached in browser)

## Technical Details

- **Audio Capture:** `getDisplayMedia()` API for tab audio
- **Transcription:** Whisper tiny.en model via [Transformers.js](https://huggingface.co/docs/transformers.js)
- **Processing:** 5-second audio chunks processed in real-time
- **No Backend:** Everything runs client-side in WebAssembly

## Files

- `index.html` - Main page structure
- `styles.css` - Dark theme styling with visualizer
- `app.js` - Audio capture, Whisper integration, and UI logic

## Disclaimer

For informational purposes only. Not for emergency use. Audio provided by [Broadcastify](https://www.broadcastify.com).
