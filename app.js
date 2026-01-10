/**
 * Baltimore Scanner - Live Police & Fire Radio
 * Broadcastify Feed ID: 40593
 * With Speech-to-Text Transcription
 */

const FEED_ID = 40593;
const BROADCASTIFY_WEB_PLAYER = `https://www.broadcastify.com/webPlayer/${FEED_ID}`;
const BROADCASTIFY_FEED_PAGE = `https://www.broadcastify.com/listen/feed/${FEED_ID}`;

// Speech Recognition
let recognition = null;
let isListening = false;
let transcriptEntries = [];

document.addEventListener('DOMContentLoaded', () => {
    initializePlayer();
    initializeSpeechRecognition();
});

function initializePlayer() {
    const statusElement = document.getElementById('status');
    const iframe = document.getElementById('broadcastify-player');

    if (iframe) {
        iframe.addEventListener('load', () => {
            updateStatus(statusElement, true);
        });

        iframe.addEventListener('error', () => {
            updateStatus(statusElement, false);
        });
    }

    updateStatus(statusElement, false);
}

function updateStatus(statusElement, isLive) {
    if (!statusElement) return;

    const statusText = statusElement.querySelector('.status-text');

    if (isLive) {
        statusElement.classList.add('live');
        if (statusText) {
            statusText.textContent = 'Player Loaded';
        }
    } else {
        statusElement.classList.remove('live');
        if (statusText) {
            statusText.textContent = 'Click to Listen';
        }
    }
}

function initializeSpeechRecognition() {
    const startBtn = document.getElementById('start-transcription');
    const stopBtn = document.getElementById('stop-transcription');
    const clearBtn = document.getElementById('clear-transcript');
    const transcriptContainer = document.getElementById('transcript-container');
    const transcriptStatus = document.getElementById('transcript-status');

    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        transcriptContainer.innerHTML = `
            <p class="transcript-placeholder" style="color: var(--accent-color);">
                Speech recognition is not supported in this browser.
                Please use Chrome, Edge, or Safari for transcription features.
            </p>
        `;
        startBtn.disabled = true;
        return;
    }

    // Initialize speech recognition
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    // Event handlers
    recognition.onstart = () => {
        isListening = true;
        updateTranscriptStatus(true);
        startBtn.disabled = true;
        stopBtn.disabled = false;
        console.log('Speech recognition started');
    };

    recognition.onend = () => {
        console.log('Speech recognition ended');
        if (isListening) {
            // Auto-restart if still supposed to be listening
            try {
                recognition.start();
            } catch (e) {
                console.log('Could not restart recognition:', e);
                stopTranscription();
            }
        } else {
            updateTranscriptStatus(false);
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);

        if (event.error === 'not-allowed') {
            addTranscriptEntry('Microphone access denied. Please allow microphone access and try again.', true);
            stopTranscription();
        } else if (event.error === 'no-speech') {
            // This is common, don't show error
            console.log('No speech detected');
        } else if (event.error === 'audio-capture') {
            addTranscriptEntry('No microphone found. Please connect a microphone.', true);
            stopTranscription();
        } else {
            addTranscriptEntry(`Error: ${event.error}`, true);
        }
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;

            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        // Add final transcript as entry
        if (finalTranscript.trim()) {
            addTranscriptEntry(finalTranscript.trim());
        }

        // Show interim results
        updateInterimTranscript(interimTranscript);
    };

    // Button handlers
    startBtn.addEventListener('click', startTranscription);
    stopBtn.addEventListener('click', stopTranscription);
    clearBtn.addEventListener('click', clearTranscript);
}

function startTranscription() {
    if (!recognition) return;

    try {
        recognition.start();
        clearPlaceholder();
    } catch (e) {
        console.error('Could not start recognition:', e);
        if (e.message.includes('already started')) {
            recognition.stop();
            setTimeout(() => recognition.start(), 100);
        }
    }
}

function stopTranscription() {
    isListening = false;
    if (recognition) {
        recognition.stop();
    }
    updateTranscriptStatus(false);

    const startBtn = document.getElementById('start-transcription');
    const stopBtn = document.getElementById('stop-transcription');
    startBtn.disabled = false;
    stopBtn.disabled = true;

    removeInterimTranscript();
}

function updateTranscriptStatus(listening) {
    const transcriptStatus = document.getElementById('transcript-status');
    const statusText = transcriptStatus.querySelector('.mic-status-text');

    if (listening) {
        transcriptStatus.classList.add('listening');
        statusText.textContent = 'Listening...';
    } else {
        transcriptStatus.classList.remove('listening');
        statusText.textContent = 'Microphone Off';
    }
}

function clearPlaceholder() {
    const container = document.getElementById('transcript-container');
    const placeholder = container.querySelector('.transcript-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
}

function addTranscriptEntry(text, isError = false) {
    const container = document.getElementById('transcript-container');
    clearPlaceholder();

    const entry = document.createElement('div');
    entry.className = 'transcript-entry';

    const time = new Date().toLocaleTimeString();

    entry.innerHTML = `
        <span class="transcript-time">[${time}]</span>
        <span class="transcript-text" style="${isError ? 'color: var(--accent-color);' : ''}">${escapeHtml(text)}</span>
    `;

    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;

    // Store entry
    transcriptEntries.push({ time, text, isError });
}

function updateInterimTranscript(text) {
    const container = document.getElementById('transcript-container');

    // Remove existing interim element
    removeInterimTranscript();

    if (text.trim()) {
        const interim = document.createElement('div');
        interim.className = 'transcript-entry interim-entry';
        interim.innerHTML = `
            <span class="transcript-time">[...]</span>
            <span class="transcript-text interim">${escapeHtml(text)}</span>
        `;
        container.appendChild(interim);
        container.scrollTop = container.scrollHeight;
    }
}

function removeInterimTranscript() {
    const container = document.getElementById('transcript-container');
    const interim = container.querySelector('.interim-entry');
    if (interim) {
        interim.remove();
    }
}

function clearTranscript() {
    const container = document.getElementById('transcript-container');
    container.innerHTML = `
        <p class="transcript-placeholder">
            Click "Start Transcription" to begin. Make sure your microphone can hear the scanner audio.
        </p>
    `;
    transcriptEntries = [];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Log feed information
console.log(`Baltimore Scanner - Feed ID: ${FEED_ID}`);
console.log(`Web Player: ${BROADCASTIFY_WEB_PLAYER}`);
console.log(`Feed Page: ${BROADCASTIFY_FEED_PAGE}`);
console.log('Speech-to-text transcription enabled');
