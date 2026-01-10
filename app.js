/**
 * Baltimore Scanner - Live Police & Fire Radio
 * Broadcastify Feed ID: 40593
 * With Tab Audio Capture and Whisper AI Transcription
 */

import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';

const FEED_ID = 40593;
const BROADCASTIFY_WEB_PLAYER = `https://www.broadcastify.com/webPlayer/${FEED_ID}`;

// Audio capture state
let mediaStream = null;
let audioContext = null;
let analyser = null;
let isCapturing = false;
let animationId = null;

// Whisper transcription state
let transcriber = null;
let isModelLoaded = false;
let isTranscribing = false;
let audioChunks = [];
let mediaRecorder = null;
let transcriptionInterval = null;

// Settings
const CHUNK_DURATION = 5000; // 5 seconds per chunk

document.addEventListener('DOMContentLoaded', () => {
    initializeAudioCapture();
    initializeTranscription();
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
    const startTranscriptionBtn = document.getElementById('start-transcription');

    try {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 16000
            }
        });

        const audioTracks = mediaStream.getAudioTracks();
        if (audioTracks.length === 0) {
            throw new Error('No audio track. Check "Share tab audio" when selecting.');
        }

        // Stop video track
        mediaStream.getVideoTracks().forEach(track => track.stop());

        // Set up audio context for visualization only (no playback - listen from original tab)
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        // Only connect to analyser for visualization - NO playback to avoid echo
        // User should listen to audio from the original Broadcastify tab
        source.connect(analyser);

        // Set up MediaRecorder for transcription
        setupMediaRecorder(audioTracks);

        isCapturing = true;

        captureBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus(statusElement, true, 'Capturing Audio');

        // Enable transcription button if model is loaded
        if (isModelLoaded) {
            startTranscriptionBtn.disabled = false;
        }

        visualize();

        audioTracks[0].addEventListener('ended', stopAudioCapture);

        updateTranscriptStatusText('Audio captured. Start transcription when ready.');

    } catch (error) {
        console.error('Error capturing audio:', error);
        updateStatus(statusElement, false, 'Capture Failed');

        if (error.name === 'NotAllowedError') {
            alert('Permission denied. Please allow screen/tab sharing.');
        } else {
            alert(`Error: ${error.message}\n\nMake sure to check "Share tab audio" when selecting the tab.`);
        }
    }
}

function setupMediaRecorder(audioTracks) {
    const stream = new MediaStream(audioTracks);

    // Try to use a supported format
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };
}

function stopAudioCapture() {
    const captureBtn = document.getElementById('capture-audio');
    const stopBtn = document.getElementById('stop-audio');
    const statusElement = document.getElementById('status');
    const startTranscriptionBtn = document.getElementById('start-transcription');

    // Stop transcription first
    if (isTranscribing) {
        stopTranscription();
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    const canvas = document.getElementById('visualizer-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    isCapturing = false;
    analyser = null;
    mediaRecorder = null;

    captureBtn.disabled = false;
    stopBtn.disabled = true;
    startTranscriptionBtn.disabled = true;
    updateStatus(statusElement, false, 'Ready');
    updateTranscriptStatusText('Capture audio first');
}

function visualize() {
    const canvas = document.getElementById('visualizer-canvas');
    const ctx = canvas.getContext('2d');

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
            const hue = 340 + (dataArray[i] / 255) * 80;
            ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
            ctx.fillRect(x, height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    draw();
}

function updateStatus(statusElement, isLive, text) {
    if (!statusElement) return;
    const statusText = statusElement.querySelector('.status-text');
    statusElement.classList.toggle('live', isLive);
    if (statusText && text) statusText.textContent = text;
}

// ============ Whisper Transcription ============

function initializeTranscription() {
    const loadModelBtn = document.getElementById('load-model');
    const startBtn = document.getElementById('start-transcription');
    const stopBtn = document.getElementById('stop-transcription');
    const clearBtn = document.getElementById('clear-transcript');

    loadModelBtn.addEventListener('click', loadWhisperModel);
    startBtn.addEventListener('click', startTranscription);
    stopBtn.addEventListener('click', stopTranscription);
    clearBtn.addEventListener('click', clearTranscript);
}

async function loadWhisperModel() {
    const modelStatus = document.getElementById('model-status');
    const modelStatusText = modelStatus.querySelector('.model-status-text');
    const loadModelBtn = document.getElementById('load-model');
    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');
    const startTranscriptionBtn = document.getElementById('start-transcription');

    try {
        loadModelBtn.disabled = true;
        loadModelBtn.textContent = 'Loading...';
        modelStatus.classList.add('loading');
        modelStatusText.textContent = 'Whisper AI: Loading model (~40MB)...';
        progressBar.style.display = 'block';

        // Load Whisper tiny model (smallest, fastest)
        transcriber = await pipeline(
            'automatic-speech-recognition',
            'Xenova/whisper-tiny.en',
            {
                progress_callback: (progress) => {
                    if (progress.status === 'downloading' || progress.status === 'progress') {
                        const percent = progress.progress || 0;
                        progressFill.style.width = `${percent}%`;
                        modelStatusText.textContent = `Whisper AI: Downloading ${Math.round(percent)}%`;
                    } else if (progress.status === 'ready') {
                        progressFill.style.width = '100%';
                    }
                }
            }
        );

        isModelLoaded = true;
        modelStatus.classList.remove('loading');
        modelStatus.classList.add('loaded');
        modelStatusText.textContent = 'Whisper AI: Ready';
        loadModelBtn.style.display = 'none';
        progressBar.style.display = 'none';

        // Enable transcription if audio is being captured
        if (isCapturing) {
            startTranscriptionBtn.disabled = false;
        }

        updateTranscriptStatusText('Model loaded. Start transcription when ready.');

    } catch (error) {
        console.error('Error loading Whisper model:', error);
        modelStatus.classList.remove('loading');
        modelStatusText.textContent = 'Whisper AI: Failed to load';
        loadModelBtn.disabled = false;
        loadModelBtn.textContent = 'Retry';
        progressBar.style.display = 'none';
        alert(`Failed to load Whisper model: ${error.message}`);
    }
}

async function startTranscription() {
    if (!isModelLoaded || !isCapturing || !mediaRecorder) {
        alert('Please load the model and capture audio first.');
        return;
    }

    const startBtn = document.getElementById('start-transcription');
    const stopBtn = document.getElementById('stop-transcription');
    const transcriptStatus = document.getElementById('transcript-status');

    isTranscribing = true;
    audioChunks = [];

    startBtn.disabled = true;
    stopBtn.disabled = false;
    transcriptStatus.classList.add('listening');
    updateTranscriptStatusText('Transcribing...');
    clearPlaceholder();

    // Start recording
    mediaRecorder.start();

    // Process audio every CHUNK_DURATION
    transcriptionInterval = setInterval(async () => {
        if (!isTranscribing) return;

        // Stop and restart to get chunks
        mediaRecorder.stop();

        // Wait for data
        await new Promise(resolve => setTimeout(resolve, 100));

        if (audioChunks.length > 0) {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            audioChunks = [];

            // Process the audio
            await transcribeAudio(audioBlob);
        }

        // Restart recording if still transcribing
        if (isTranscribing && mediaRecorder.state === 'inactive') {
            mediaRecorder.start();
        }
    }, CHUNK_DURATION);
}

async function transcribeAudio(audioBlob) {
    try {
        // Convert blob to array buffer
        const arrayBuffer = await audioBlob.arrayBuffer();

        // Decode audio
        const tempContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const audioBuffer = await tempContext.decodeAudioData(arrayBuffer);
        tempContext.close();

        // Get audio data as Float32Array
        const audioData = audioBuffer.getChannelData(0);

        // Run transcription
        const result = await transcriber(audioData, {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: false
        });

        // Add result to transcript
        if (result && result.text && result.text.trim()) {
            const text = result.text.trim();
            // Filter out common noise/silence transcriptions
            if (!isNoiseOrSilence(text)) {
                addTranscriptEntry(text);
            }
        }

    } catch (error) {
        console.error('Transcription error:', error);
        // Don't show error for every chunk, just log it
    }
}

function isNoiseOrSilence(text) {
    const trimmed = text.trim();

    // Empty or very short
    if (trimmed.length < 3) return true;

    // Common noise patterns
    const noisePatterns = [
        /^\s*$/,
        /^\.+$/,
        /^\[.*\]$/,
        /^you$/i,
        /^yeah$/i,
        /^okay$/i,
        /^um+$/i,
        /^uh+$/i,
        /^hmm+$/i,
        /^thank you\.?$/i,
        /^thanks\.?$/i,
        /^bye\.?$/i,
        /^hello\.?$/i,
        /^hi\.?$/i,
        /^the$/i,
        /^a$/i,
        /^I$/i,
        /^it$/i,
        /^is$/i,
    ];

    if (noisePatterns.some(pattern => pattern.test(trimmed))) {
        return true;
    }

    // Detect repetitive patterns like "703.5.5.5.5..." or "1.1.1.1..."
    // This happens when Whisper hallucinates on radio tones/static
    if (/(\d+\.){4,}/.test(trimmed)) return true;
    if (/(.)\1{5,}/.test(trimmed)) return true; // Same character repeated 6+ times

    // Detect repeating word patterns like "the the the" or "5 5 5 5"
    const words = trimmed.toLowerCase().split(/\s+/);
    if (words.length >= 3) {
        const uniqueWords = new Set(words);
        // If more than 70% of words are the same, it's probably noise
        if (uniqueWords.size === 1 || (words.length / uniqueWords.size) > 3) {
            return true;
        }
    }

    // Detect numeric spam like "5.5" repeated
    if (/^[\d\.\s]+$/.test(trimmed) && trimmed.length > 10) return true;

    return false;
}

function stopTranscription() {
    const startBtn = document.getElementById('start-transcription');
    const stopBtn = document.getElementById('stop-transcription');
    const transcriptStatus = document.getElementById('transcript-status');

    isTranscribing = false;

    if (transcriptionInterval) {
        clearInterval(transcriptionInterval);
        transcriptionInterval = null;
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    audioChunks = [];

    startBtn.disabled = !isCapturing || !isModelLoaded;
    stopBtn.disabled = true;
    transcriptStatus.classList.remove('listening');
    updateTranscriptStatusText(isCapturing ? 'Paused' : 'Capture audio first');
}

function updateTranscriptStatusText(text) {
    const statusText = document.querySelector('.mic-status-text');
    if (statusText) statusText.textContent = text;
}

function clearPlaceholder() {
    const container = document.getElementById('transcript-container');
    const placeholder = container.querySelector('.transcript-placeholder');
    if (placeholder) placeholder.remove();
}

function addTranscriptEntry(text) {
    const container = document.getElementById('transcript-container');
    clearPlaceholder();

    const entry = document.createElement('div');
    entry.className = 'transcript-entry';
    const time = new Date().toLocaleTimeString();

    entry.innerHTML = `
        <span class="transcript-time">[${time}]</span>
        <span class="transcript-text">${escapeHtml(text)}</span>
    `;

    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}

function clearTranscript() {
    const container = document.getElementById('transcript-container');
    container.innerHTML = `
        <p class="transcript-placeholder">
            Load the Whisper AI model, capture tab audio, then start transcription.
        </p>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Log info
console.log(`Baltimore Scanner - Feed ID: ${FEED_ID}`);
console.log(`Open Broadcastify: ${BROADCASTIFY_WEB_PLAYER}`);
console.log('Whisper AI transcription enabled');
