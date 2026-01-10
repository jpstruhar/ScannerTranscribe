# Scanner Transcribe

Real-time browser-based transcription for any audio source. Works with police scanners, radio streams, podcasts, or any browser tab playing audio.

## Features

- **Dual Transcription Engines**
  - **Whisper AI** - Free, runs locally in browser (~466MB model)
  - **Deepgram** - Optimized for radio/phone audio ($200 free credit)
- **Any Audio Source** - Works with any Broadcastify feed or browser tab
- **Keyword Alerts** - Highlight and get audio alerts on specific words
- **Confidence Scoring** - Visual indicator of transcription reliability (Deepgram)
- **Numeric Normalization** - Auto-fixes common number transcription errors
- **Tab Audio Capture** - Capture audio directly from any browser tab
- **Audio Visualizer** - Real-time frequency visualization
- **Usage Tracking** - Monitor transcription time and estimated cost (Deepgram)
- **Multi-Format Export** - Download transcripts as TXT, JSON, or CSV
- **Settings Persistence** - Saves feed ID, API key, and keywords locally

## How to Use

### 1. Audio Source
- Enter a Broadcastify feed ID and click "Open Feed", or open any audio source in another tab
- Click **"Capture Tab Audio"** and select the tab (check "Share tab audio")

### 2. Transcription Setup
- Choose your engine:
  - **Whisper:** Click "Load Model" (one-time ~466MB download)
  - **Deepgram:** Enter your API key ([get $200 free credit](https://console.deepgram.com/signup))
- (Optional) Enter keywords to highlight in transcripts

### 3. Live Transcript
- Click **"Start"** to begin transcription
- Download transcripts as TXT, JSON, or CSV

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
- **Storage:** ~466MB for Whisper model (cached in browser)

## Transcription Engines

| Engine | Accuracy | Cost | Processing |
|--------|----------|------|------------|
| Whisper AI | Good | Free | Local (browser) |
| Deepgram | Excellent | ~$0.0043/min | Cloud API |

**Deepgram** uses the `nova-2-phonecall` model, optimized for radio and phone audio quality.

## Export Formats

- **TXT** - Human-readable with timestamps and keywords
- **JSON** - Structured data including metadata and keyword list
- **CSV** - Spreadsheet-compatible format

## Technical Details

- **Audio Capture:** `getDisplayMedia()` API for tab audio
- **Whisper:** `whisper-small.en` model via [Transformers.js](https://huggingface.co/docs/transformers.js) with police/scanner vocabulary prompts
- **Deepgram:** WebSocket streaming with `nova-2-phonecall` model, keyword boosting, and confidence scoring
- **Numeric Normalization:** Post-processing fixes spaced digits, +1 hallucinations, 10-codes, license plates, and CAD numbers
- **Storage:** localStorage for settings persistence

## Privacy & Redaction

Enable **Redact PII** to automatically hide sensitive information:
- **[NAME]** - Names following "named", "subject", "driver", etc.
- **[DOB]** - Dates of birth
- **[SSN]** - Social security numbers
- **[PHONE]** - Phone numbers
- **[PLATE]** - License plates
- **[ADDRESS]** - Street addresses

Enable **Normalize Phonetics** to convert radio alphabet:
- "Adam Boy Charles 123" → "ABC123"
- Supports LAPD, NATO, and common police phonetics

## Accuracy Notes

Transcription accuracy depends on audio quality. Common challenges with scanner audio:
- **Numeric data** (CAD numbers, plates, addresses) may need human verification
- **Low confidence entries** (Deepgram) are highlighted in yellow - review these carefully
- **Confidence scores** below 80% indicate unreliable transcription
- Best results with clear audio and minimal static/crosstalk

## Privacy

- **Whisper:** All processing happens locally in your browser
- **Deepgram:** Audio is sent to Deepgram's servers for processing
- **No tracking:** No analytics or third-party tracking

## Disclaimer

For informational purposes only. Not for emergency use.
