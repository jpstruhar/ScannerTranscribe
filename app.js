/**
 * Baltimore Scanner - Live Police & Fire Radio
 * Broadcastify Feed ID: 40593
 * With Tab Audio Capture and Dual Transcription Engines:
 * - Whisper AI (Free, Local)
 * - Deepgram (Accurate, API Key)
 */

const FEED_ID = 40593;
const BROADCASTIFY_WEB_PLAYER = `https://www.broadcastify.com/webPlayer/${FEED_ID}`;

// Audio capture state
let mediaStream = null;
let audioContext = null;
let analyser = null;
let isCapturing = false;
let animationId = null;

// Transcription engine state
let currentEngine = 'whisper';
let isTranscribing = false;

// Whisper state
let transcriber = null;
let isWhisperLoaded = false;
let whisperMediaRecorder = null;
let audioChunks = [];
let transcriptionInterval = null;

// Deepgram state
let deepgramSocket = null;
let deepgramApiKey = '';
let deepgramMediaRecorder = null;

// Settings
const WHISPER_CHUNK_DURATION = 10000; // 10 seconds per chunk

document.addEventListener('DOMContentLoaded', () => {
    initializeAudioCapture();
    initializeEngineSelector();
    initializeWhisper();
    initializeDeepgram();
    initializeTranscriptionControls();
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

        // Set up audio context for visualization only
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        // Only connect to analyser for visualization - NO playback
        source.connect(analyser);

        // Set up MediaRecorder for transcription
        setupMediaRecorders(audioTracks);

        isCapturing = true;

        captureBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus(statusElement, true, 'Capturing Audio');

        // Enable transcription button based on engine readiness
        updateTranscriptionButtonState();

        visualize();

        audioTracks[0].addEventListener('ended', stopAudioCapture);

        updateTranscriptStatus('Audio captured. Start transcription when ready.');

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

function setupMediaRecorders(audioTracks) {
    const stream = new MediaStream(audioTracks);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

    // Whisper MediaRecorder (chunk-based)
    whisperMediaRecorder = new MediaRecorder(stream, { mimeType });
    whisperMediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };

    // Deepgram MediaRecorder (streaming)
    deepgramMediaRecorder = new MediaRecorder(stream, { mimeType });
    deepgramMediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
                deepgramSocket.send(event.data);
                // Log first few chunks to verify streaming
                if (!window._dgChunkCount) window._dgChunkCount = 0;
                window._dgChunkCount++;
                if (window._dgChunkCount <= 3) {
                    console.log(`Deepgram: Sent audio chunk ${window._dgChunkCount}, size: ${event.data.size} bytes`);
                }
            }
        }
    };

    console.log('MediaRecorders initialized with mimeType:', mimeType);
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
    whisperMediaRecorder = null;
    deepgramMediaRecorder = null;

    captureBtn.disabled = false;
    stopBtn.disabled = true;
    startTranscriptionBtn.disabled = true;
    updateStatus(statusElement, false, 'Ready');
    updateTranscriptStatus('Capture audio first');
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

// ============ Engine Selector ============

function initializeEngineSelector() {
    const engineRadios = document.querySelectorAll('input[name="engine"]');
    const whisperConfig = document.getElementById('whisper-config');
    const deepgramConfig = document.getElementById('deepgram-config');

    engineRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentEngine = e.target.value;

            // Show/hide config sections
            whisperConfig.style.display = currentEngine === 'whisper' ? 'block' : 'none';
            deepgramConfig.style.display = currentEngine === 'deepgram' ? 'block' : 'none';

            // Stop transcription if running
            if (isTranscribing) {
                stopTranscription();
            }

            // Update button state
            updateTranscriptionButtonState();
        });
    });
}

function updateTranscriptionButtonState() {
    const startBtn = document.getElementById('start-transcription');

    if (!isCapturing) {
        startBtn.disabled = true;
        return;
    }

    if (currentEngine === 'whisper') {
        startBtn.disabled = !isWhisperLoaded;
    } else if (currentEngine === 'deepgram') {
        startBtn.disabled = !deepgramApiKey;
    }
}

// ============ Whisper Transcription ============

function initializeWhisper() {
    const loadBtn = document.getElementById('load-whisper');
    loadBtn.addEventListener('click', loadWhisperModel);
}

async function loadWhisperModel() {
    const statusElement = document.getElementById('whisper-status');
    const statusText = statusElement.querySelector('.status-text');
    const loadBtn = document.getElementById('load-whisper');
    const progressBar = document.getElementById('whisper-progress');
    const progressFill = document.getElementById('whisper-progress-fill');

    try {
        loadBtn.disabled = true;
        loadBtn.textContent = 'Loading...';
        statusText.textContent = 'Whisper: Loading library...';
        progressBar.style.display = 'block';

        // Dynamically import Transformers.js only when needed
        const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1');

        statusText.textContent = 'Whisper: Loading model (~150MB)...';

        transcriber = await pipeline(
            'automatic-speech-recognition',
            'Xenova/whisper-base.en',
            {
                progress_callback: (progress) => {
                    if (progress.status === 'downloading' || progress.status === 'progress') {
                        const percent = progress.progress || 0;
                        progressFill.style.width = `${percent}%`;
                        statusText.textContent = `Whisper: Downloading ${Math.round(percent)}%`;
                    } else if (progress.status === 'ready') {
                        progressFill.style.width = '100%';
                    }
                }
            }
        );

        isWhisperLoaded = true;
        statusElement.classList.add('loaded');
        statusText.textContent = 'Whisper: Ready';
        loadBtn.style.display = 'none';
        progressBar.style.display = 'none';

        updateTranscriptionButtonState();
        updateTranscriptStatus('Whisper loaded. Start transcription when ready.');

    } catch (error) {
        console.error('Error loading Whisper model:', error);
        statusText.textContent = 'Whisper: Failed to load';
        loadBtn.disabled = false;
        loadBtn.textContent = 'Retry';
        progressBar.style.display = 'none';
        alert(`Failed to load Whisper model: ${error.message}`);
    }
}

async function startWhisperTranscription() {
    if (!whisperMediaRecorder) return;

    audioChunks = [];
    whisperMediaRecorder.start();

    transcriptionInterval = setInterval(async () => {
        if (!isTranscribing) return;

        whisperMediaRecorder.stop();
        await new Promise(resolve => setTimeout(resolve, 100));

        if (audioChunks.length > 0) {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            audioChunks = [];
            await transcribeWithWhisper(audioBlob);
        }

        if (isTranscribing && whisperMediaRecorder.state === 'inactive') {
            whisperMediaRecorder.start();
        }
    }, WHISPER_CHUNK_DURATION);
}

async function transcribeWithWhisper(audioBlob) {
    try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const tempContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const audioBuffer = await tempContext.decodeAudioData(arrayBuffer);
        tempContext.close();

        const audioData = audioBuffer.getChannelData(0);

        const result = await transcriber(audioData, {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: false,
            language: 'english',
            task: 'transcribe'
        });

        if (result && result.text && result.text.trim()) {
            const text = result.text.trim();
            if (!isNoiseOrSilence(text)) {
                addTranscriptEntry(text);
            }
        }

    } catch (error) {
        console.error('Whisper transcription error:', error);
    }
}

function stopWhisperTranscription() {
    if (transcriptionInterval) {
        clearInterval(transcriptionInterval);
        transcriptionInterval = null;
    }

    if (whisperMediaRecorder && whisperMediaRecorder.state !== 'inactive') {
        whisperMediaRecorder.stop();
    }

    audioChunks = [];
}

function isNoiseOrSilence(text) {
    const trimmed = text.trim();

    if (trimmed.length < 3) return true;

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

    // Detect hallucination patterns
    if (/(\d+\.){4,}/.test(trimmed)) return true;
    if (/(.)\1{5,}/.test(trimmed)) return true;

    const words = trimmed.toLowerCase().split(/\s+/);
    if (words.length >= 3) {
        const uniqueWords = new Set(words);
        if (uniqueWords.size === 1 || (words.length / uniqueWords.size) > 3) {
            return true;
        }
    }

    if (/^[\d\.\s]+$/.test(trimmed) && trimmed.length > 10) return true;

    return false;
}

// ============ Deepgram Transcription ============

function initializeDeepgram() {
    const apiKeyInput = document.getElementById('deepgram-key');
    const statusElement = document.getElementById('deepgram-status');
    const statusText = statusElement.querySelector('.status-text');

    // Load saved API key
    const savedKey = localStorage.getItem('deepgram-api-key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
        deepgramApiKey = savedKey;
        statusText.textContent = 'Deepgram: API key saved';
        statusElement.classList.add('loaded');
        updateTranscriptionButtonState();
    }

    apiKeyInput.addEventListener('input', (e) => {
        deepgramApiKey = e.target.value.trim();

        if (deepgramApiKey) {
            localStorage.setItem('deepgram-api-key', deepgramApiKey);
            statusText.textContent = 'Deepgram: Ready';
            statusElement.classList.add('loaded');
        } else {
            localStorage.removeItem('deepgram-api-key');
            statusText.textContent = 'Enter API key to enable';
            statusElement.classList.remove('loaded');
        }

        updateTranscriptionButtonState();
    });
}

function startDeepgramTranscription() {
    if (!deepgramApiKey || !deepgramMediaRecorder) {
        console.error('Deepgram: Missing API key or MediaRecorder');
        return;
    }

    const statusElement = document.getElementById('deepgram-status');
    const statusText = statusElement.querySelector('.status-text');

    try {
        // Connect to Deepgram WebSocket
        // Don't specify encoding - let Deepgram auto-detect from webm container
        deepgramSocket = new WebSocket(
            `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&punctuate=true`,
            ['token', deepgramApiKey]
        );

        deepgramSocket.onopen = () => {
            console.log('Deepgram connected');
            statusText.textContent = 'Deepgram: Connected';

            // Start streaming audio chunks every 250ms
            deepgramMediaRecorder.start(250);
            console.log('MediaRecorder started, streaming to Deepgram');
        };

        deepgramSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            // Log for debugging
            if (data.type === 'Results') {
                const transcript = data.channel?.alternatives?.[0]?.transcript;
                if (transcript && data.is_final) {
                    console.log('Deepgram transcript:', transcript);
                    addTranscriptEntry(transcript);
                }
            } else if (data.type === 'Metadata') {
                console.log('Deepgram metadata:', data);
            }
        };

        deepgramSocket.onerror = (error) => {
            console.error('Deepgram WebSocket error:', error);
            statusText.textContent = 'Deepgram: Connection error';
            stopTranscription();
        };

        deepgramSocket.onclose = (event) => {
            console.log('Deepgram disconnected. Code:', event.code, 'Reason:', event.reason);
            if (isTranscribing && currentEngine === 'deepgram') {
                statusText.textContent = `Deepgram: Disconnected (${event.code})`;
                // Try to reconnect if unexpected disconnect
                if (event.code !== 1000 && event.code !== 1001) {
                    console.log('Unexpected disconnect, check API key or audio stream');
                }
            }
        };

    } catch (error) {
        console.error('Failed to start Deepgram:', error);
        statusText.textContent = 'Deepgram: Failed to connect';
        alert(`Deepgram error: ${error.message}`);
    }
}

function stopDeepgramTranscription() {
    if (deepgramMediaRecorder && deepgramMediaRecorder.state !== 'inactive') {
        deepgramMediaRecorder.stop();
    }

    if (deepgramSocket) {
        deepgramSocket.close();
        deepgramSocket = null;
    }

    const statusElement = document.getElementById('deepgram-status');
    const statusText = statusElement.querySelector('.status-text');
    if (deepgramApiKey) {
        statusText.textContent = 'Deepgram: Ready';
    }
}

// ============ Transcription Controls ============

function initializeTranscriptionControls() {
    const startBtn = document.getElementById('start-transcription');
    const stopBtn = document.getElementById('stop-transcription');
    const clearBtn = document.getElementById('clear-transcript');

    startBtn.addEventListener('click', startTranscription);
    stopBtn.addEventListener('click', stopTranscription);
    clearBtn.addEventListener('click', clearTranscript);
}

function startTranscription() {
    const startBtn = document.getElementById('start-transcription');
    const stopBtn = document.getElementById('stop-transcription');
    const transcriptStatus = document.getElementById('transcript-status');

    if (currentEngine === 'whisper' && !isWhisperLoaded) {
        alert('Please load the Whisper model first.');
        return;
    }

    if (currentEngine === 'deepgram' && !deepgramApiKey) {
        alert('Please enter your Deepgram API key first.');
        return;
    }

    if (!isCapturing) {
        alert('Please capture tab audio first.');
        return;
    }

    isTranscribing = true;

    startBtn.disabled = true;
    stopBtn.disabled = false;
    transcriptStatus.classList.add('listening');
    updateTranscriptStatus('Transcribing...');
    clearPlaceholder();

    if (currentEngine === 'whisper') {
        startWhisperTranscription();
    } else if (currentEngine === 'deepgram') {
        startDeepgramTranscription();
    }
}

function stopTranscription() {
    const startBtn = document.getElementById('start-transcription');
    const stopBtn = document.getElementById('stop-transcription');
    const transcriptStatus = document.getElementById('transcript-status');

    isTranscribing = false;

    if (currentEngine === 'whisper') {
        stopWhisperTranscription();
    } else if (currentEngine === 'deepgram') {
        stopDeepgramTranscription();
    }

    startBtn.disabled = !isCapturing || (currentEngine === 'whisper' && !isWhisperLoaded) || (currentEngine === 'deepgram' && !deepgramApiKey);
    stopBtn.disabled = true;
    transcriptStatus.classList.remove('listening');
    updateTranscriptStatus(isCapturing ? 'Paused' : 'Capture audio first');
}

function updateTranscriptStatus(text) {
    const statusElement = document.getElementById('transcript-status');
    const statusText = statusElement.querySelector('.status-text');
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
            Select an engine, capture tab audio, then start transcription.
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
console.log('Transcription engines: Whisper AI (local) & Deepgram (API)');
