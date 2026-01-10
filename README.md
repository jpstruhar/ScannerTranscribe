# Scanner Transcribe

Real-time browser-based transcription for any audio source. Works with police scanners, radio streams, podcasts, or any browser tab playing audio.

## Features

- **Dual Transcription Engines**
  - **Whisper AI** - Free, runs locally in browser (~150MB model)
  - **Deepgram** - Highly accurate, cloud-based ($200 free credit)
- **Any Audio Source** - Works with any Broadcastify feed or browser tab
- **Keyword Alerts** - Highlight and notify on specific words (shooting, fire, etc.)
- **Tab Audio Capture** - Capture audio directly from any browser tab
- **Audio Visualizer** - Real-time frequency visualization
- **Usage Tracking** - Monitor transcription time and estimated cost
- **Multi-Format Export** - Download transcripts as TXT, JSON, or CSV
- **Settings Persistence** - Saves feed ID, API key, and keywords to localStorage

## How to Use

1. Enter a Broadcastify feed ID and click "Open Feed", or open any audio source in another tab
2. Click **"Capture Tab Audio"** and select the tab (check "Share tab audio")
3. Choose your transcription engine:
   - **Whisper:** Click "Load Model" (one-time ~150MB download)
   - **Deepgram:** Enter your API key ([get $200 free credit](https://console.deepgram.com/signup))
4. (Optional) Enter keywords to highlight in transcripts
5. Click **"Start"** to begin transcription
6. Download transcripts as TXT, JSON, or CSV

## Live Demo

Visit: https://arandomguyhere.github.io/ScannerTranscribe/

## Finding Feeds

- **Broadcastify:** Browse feeds at https://www.broadcastify.com/listen/
- **Any Audio:** Works with podcasts, YouTube, Twitch, or any tab playing audio

## Keyword Alerts

Enter comma-separated keywords to highlight important entries:
- Example: `shooting, fire, robbery, ambulance`
- Matching entries are highlighted in red
- Audio beep plays when keyword detected

## Requirements

- **Browser:** Chrome or Edge (required for tab audio capture)
- **Internet:** Required for audio streams and Deepgram
- **Storage:** ~150MB for Whisper model (cached in browser)

## Transcription Engines

| Engine | Accuracy | Cost | Processing |
|--------|----------|------|------------|
| Whisper AI | Good | Free | Local (browser) |
| Deepgram Nova-2 | Excellent | ~$0.0043/min | Cloud API |

**Deepgram** is recommended for police scanner audio due to better handling of radio noise.

## Export Formats

- **TXT** - Human-readable with timestamps and keywords
- **JSON** - Structured data including metadata and keyword list
- **CSV** - Spreadsheet-compatible format

## Technical Details

- **Audio Capture:** `getDisplayMedia()` API for tab audio
- **Whisper:** `whisper-base.en` model via [Transformers.js](https://huggingface.co/docs/transformers.js)
- **Deepgram:** WebSocket streaming to Nova-2 model
- **Storage:** localStorage for settings persistence

## Privacy

- **Whisper:** All processing happens locally in your browser
- **Deepgram:** Audio is sent to Deepgram's servers for processing
- **No tracking:** No analytics or third-party tracking

## Files

- `index.html` - Main page structure
- `styles.css` - Dark theme styling
- `app.js` - Audio capture, transcription engines, and UI logic

## Disclaimer

For informational purposes only. Not for emergency use.
