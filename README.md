# Baltimore Scanner

Live Police, Fire & EMS radio scanner for Baltimore City with tab audio capture and real-time speech-to-text transcription.

## Features

- **Tab Audio Capture** - Capture audio directly from the Broadcastify browser tab
- **Audio Visualizer** - Real-time frequency visualization of the captured audio
- **Volume Control** - Adjust playback volume
- **Speech-to-Text** - Live transcription using Web Speech API
- **Timestamped Transcript** - Each entry shows when it was captured
- **Responsive Design** - Works on desktop and mobile

## How to Use

1. Open the [Broadcastify player](https://www.broadcastify.com/webPlayer/40593) in a new tab
2. Start playing the audio in the Broadcastify tab
3. Return to Baltimore Scanner and click **"Capture Tab Audio"**
4. Select the Broadcastify tab and check **"Share tab audio"**
5. Click **"Start Transcription"** to begin speech-to-text
6. The scanner audio will play through this page with live visualization

## Live Demo

Visit: https://arandomguyhere.github.io/baltimorescanner/

## Requirements

- **Browser:** Chrome or Edge (required for tab audio capture and speech recognition)
- **Permissions:** Screen sharing (for tab audio) and microphone (for transcription)
- **Internet:** Required for Broadcastify stream

## Files

- `index.html` - Main page structure
- `styles.css` - Dark theme styling with visualizer
- `app.js` - Audio capture, visualization, and speech recognition

## Technical Details

- Uses `getDisplayMedia()` API to capture tab audio
- Web Audio API for processing and visualization
- Web Speech API for transcription
- No server required - runs entirely in the browser

## Disclaimer

For informational purposes only. Not for emergency use. Audio provided by [Broadcastify](https://www.broadcastify.com).
