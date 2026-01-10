# Baltimore Scanner

Live Police, Fire & EMS radio scanner for Baltimore City with real-time speech-to-text transcription.

## Features

- **Dual Transcription Engines**
  - **Whisper AI** - Free, runs locally in browser (~150MB model)
  - **Deepgram** - Highly accurate, cloud-based ($200 free credit)
- **Tab Audio Capture** - Capture audio directly from the Broadcastify browser tab
- **Audio Visualizer** - Real-time frequency visualization
- **Usage Tracking** - Monitor transcription time and estimated cost (Deepgram)
- **Multi-Format Export** - Download transcripts as TXT, JSON, or CSV
- **Privacy First** - Whisper processes entirely locally, no data sent to servers

## How to Use

1. Open the [Broadcastify player](https://www.broadcastify.com/webPlayer/40593) in a new tab and start playing
2. Return to Baltimore Scanner and click **"Capture Tab Audio"**
3. Select the Broadcastify tab and check **"Share tab audio"**
4. Choose your transcription engine:
   - **Whisper:** Click "Load Model" (one-time ~150MB download)
   - **Deepgram:** Enter your API key ([get $200 free credit](https://console.deepgram.com/signup))
5. Click **"Start"** to begin transcription
6. Use the format dropdown to download transcripts as TXT, JSON, or CSV

## Live Demo

Visit: https://arandomguyhere.github.io/baltimorescanner/

## Requirements

- **Browser:** Chrome or Edge (required for tab audio capture)
- **Internet:** Required for Broadcastify stream
- **Storage:** ~150MB for Whisper model (cached in browser)

## Transcription Engines

| Engine | Accuracy | Cost | Processing |
|--------|----------|------|------------|
| Whisper AI | Good | Free | Local (browser) |
| Deepgram Nova-2 | Excellent | ~$0.0043/min | Cloud API |

**Deepgram** is recommended for police scanner audio due to better handling of radio noise and crosstalk.

## Export Formats

- **TXT** - Human-readable plain text with timestamps
- **JSON** - Structured data for programmatic use
- **CSV** - Spreadsheet-compatible format

## Technical Details

- **Audio Capture:** `getDisplayMedia()` API for tab audio
- **Whisper:** `whisper-base.en` model via [Transformers.js](https://huggingface.co/docs/transformers.js)
- **Deepgram:** WebSocket streaming to Nova-2 model
- **Audio Processing:** ScriptProcessorNode for Whisper, MediaRecorder for Deepgram

## Files

- `index.html` - Main page structure
- `styles.css` - Dark theme styling
- `app.js` - Audio capture, transcription engines, and UI logic

## Disclaimer

For informational purposes only. Not for emergency use. Audio provided by [Broadcastify](https://www.broadcastify.com).
