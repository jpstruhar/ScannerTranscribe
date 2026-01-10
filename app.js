/**
 * Baltimore Scanner - Live Police & Fire Radio
 * Broadcastify Feed ID: 40593
 * With Tab Audio Capture and Speech-to-Text Transcription
 */

const FEED_ID = 40593;
const BROADCASTIFY_WEB_PLAYER = `https://www.broadcastify.com/webPlayer/${FEED_ID}`;

// Audio capture state
let mediaStream = null;
let audioContext = null;
let analyser = null;
let gainNode = null;
let isCapturing = false;
let animationId = null;

// Speech Recognition
let recognition = null;
let isListening = false;
let transcriptEntries = [];

document.addEventListener('DOMContentLoaded', () => {
    initializeAudioCapture();
    initializeSpeechRecognition();
    initializeVolumeControl();
});

// ============ Audio Capture ============

function initializeAudioCapture() {
    const captureBtn = document.getElementById('capture-audio');
    const stopBtn = document.getElementById('stop-audio');

    captureBtn.addEventListener('click', startAudioCapture);
    stopBtn.addEventListener('click', stopAudioCapture);
}

async function startAudioCapture() {
    const captureBtn = document.getElementById('capture-audio');
    const stopBtn = document.getElementById('stop-audio');
    const statusElement = document.getElementById('status');

    try {
        // Request tab audio capture
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,  // Required, but we'll ignore it
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        // Check if we got audio
        const audioTracks = mediaStream.getAudioTracks();
        if (audioTracks.length === 0) {
            throw new Error('No audio track captured. Make sure to check "Share tab audio" when selecting the tab.');
        }

        // Stop video track (we only need audio)
        mediaStream.getVideoTracks().forEach(track => track.stop());

        // Set up audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));

        // Create gain node for volume control
        gainNode = audioContext.createGain();
        gainNode.gain.value = document.getElementById('volume').value / 100;

        // Create analyser for visualization
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        // Connect: source -> gain -> analyser -> destination
        source.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(audioContext.destination);

        isCapturing = true;

        // Update UI
        captureBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus(statusElement, true, 'Capturing Audio');

        // Start visualization
        visualize();

        // Handle stream end
        audioTracks[0].addEventListener('ended', () => {
            stopAudioCapture();
        });

        console.log('Audio capture started');

    } catch (error) {
        console.error('Error capturing audio:', error);
        updateStatus(statusElement, false, 'Capture Failed');

        if (error.name === 'NotAllowedError') {
            alert('Permission denied. Please allow screen/tab sharing to capture audio.');
        } else if (error.message.includes('No audio')) {
            alert('No audio captured. When selecting a tab, make sure to check "Share tab audio" at the bottom of the dialog.');
        } else {
            alert(`Error: ${error.message}`);
        }
    }
}

function stopAudioCapture() {
    const captureBtn = document.getElementById('capture-audio');
    const stopBtn = document.getElementById('stop-audio');
    const statusElement = document.getElementById('status');

    // Stop all tracks
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    // Close audio context
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    // Stop visualization
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    // Clear canvas
    const canvas = document.getElementById('visualizer-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    isCapturing = false;
    analyser = null;
    gainNode = null;

    // Update UI
    captureBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus(statusElement, false, 'Ready');

    console.log('Audio capture stopped');
}

function visualize() {
    const canvas = document.getElementById('visualizer-canvas');
    const ctx = canvas.getContext('2d');

    // Set canvas size
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        if (!isCapturing) return;

        animationId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height;

            // Gradient from accent color to success color
            const hue = 340 + (dataArray[i] / 255) * 80;
            ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;

            ctx.fillRect(x, height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    draw();
}

function initializeVolumeControl() {
    const volumeSlider = document.getElementById('volume');
    const volumeValue = document.getElementById('volume-value');

    volumeSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        volumeValue.textContent = `${value}%`;

        if (gainNode) {
            gainNode.gain.value = value / 100;
        }
    });
}

function updateStatus(statusElement, isLive, text) {
    if (!statusElement) return;

    const statusText = statusElement.querySelector('.status-text');

    if (isLive) {
        statusElement.classList.add('live');
    } else {
        statusElement.classList.remove('live');
    }

    if (statusText && text) {
        statusText.textContent = text;
    }
}

// ============ Speech Recognition ============

function initializeSpeechRecognition() {
    const startBtn = document.getElementById('start-transcription');
    const stopBtn = document.getElementById('stop-transcription');
    const clearBtn = document.getElementById('clear-transcript');
    const transcriptContainer = document.getElementById('transcript-container');

    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        transcriptContainer.innerHTML = `
            <p class="transcript-placeholder" style="color: var(--accent-color);">
                Speech recognition is not supported in this browser.
                Please use Chrome or Edge for transcription features.
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
            addTranscriptEntry('Microphone access denied. Please allow microphone access.', true);
            stopTranscription();
        } else if (event.error === 'no-speech') {
            // Common, don't show error
        } else if (event.error === 'audio-capture') {
            addTranscriptEntry('No microphone found.', true);
            stopTranscription();
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

        if (finalTranscript.trim()) {
            addTranscriptEntry(finalTranscript.trim());
        }

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
        statusText.textContent = 'Listening via microphone...';
    } else {
        transcriptStatus.classList.remove('listening');
        statusText.textContent = 'Not listening';
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

    transcriptEntries.push({ time, text, isError });
}

function updateInterimTranscript(text) {
    const container = document.getElementById('transcript-container');
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
            Capture tab audio and start transcription to see live text.
        </p>
    `;
    transcriptEntries = [];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Log info
console.log(`Baltimore Scanner - Feed ID: ${FEED_ID}`);
console.log(`Open Broadcastify: ${BROADCASTIFY_WEB_PLAYER}`);
console.log('Tab audio capture and speech-to-text enabled');
