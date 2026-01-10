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
let whisperAudioBuffer = [];
let whisperProcessor = null;
let transcriptionInterval = null;

// Deepgram state
let deepgramSocket = null;
let deepgramApiKey = '';
let deepgramMediaRecorder = null;

// Usage tracking
let sessionStartTime = null;
let totalSessionSeconds = 0;
let usageInterval = null;

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

    // Whisper: Use ScriptProcessorNode to capture raw PCM audio
    // This gives us Float32Array data that Whisper can process directly
    const whisperSource = audioContext.createMediaStreamSource(stream);
    whisperProcessor = audioContext.createScriptProcessor(4096, 1, 1);

    whisperProcessor.onaudioprocess = (e) => {
        if (isTranscribing && currentEngine === 'whisper') {
            const inputData = e.inputBuffer.getChannelData(0);
            // Copy the data since the buffer gets reused
            whisperAudioBuffer.push(new Float32Array(inputData));
        }
    };

    // Connect but don't output (silent)
    whisperSource.connect(whisperProcessor);
    whisperProcessor.connect(audioContext.destination);

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

    console.log('Audio processors initialized. Whisper: ScriptProcessor, Deepgram:', mimeType);
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
    whisperProcessor = null;
    whisperAudioBuffer = [];
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
    if (!whisperProcessor) {
        console.error('Whisper: Audio processor not initialized');
        return;
    }

    whisperAudioBuffer = [];
    console.log('Whisper transcription started, collecting audio...');

    transcriptionInterval = setInterval(async () => {
        if (!isTranscribing) return;

        if (whisperAudioBuffer.length > 0) {
            // Combine all audio chunks into single Float32Array
            const totalLength = whisperAudioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedAudio = new Float32Array(totalLength);

            let offset = 0;
            for (const chunk of whisperAudioBuffer) {
                combinedAudio.set(chunk, offset);
                offset += chunk.length;
            }

            whisperAudioBuffer = [];
            console.log(`Whisper: Processing ${totalLength} samples (${(totalLength / 16000).toFixed(1)}s of audio)`);

            await transcribeWithWhisper(combinedAudio);
        }
    }, WHISPER_CHUNK_DURATION);
}

async function transcribeWithWhisper(audioData) {
    try {
        // audioData is already a Float32Array at 16kHz
        const result = await transcriber(audioData, {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: false,
            language: 'english',
            task: 'transcribe'
        });

        if (result && result.text && result.text.trim()) {
            const text = result.text.trim();
            console.log('Whisper raw result:', text);
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
    whisperAudioBuffer = [];
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

            // Start usage tracking
            startUsageTracking();
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
    // Stop usage tracking
    stopUsageTracking();

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
    const downloadBtn = document.getElementById('download-transcript');

    startBtn.addEventListener('click', startTranscription);
    stopBtn.addEventListener('click', stopTranscription);
    clearBtn.addEventListener('click', clearTranscript);
    downloadBtn.addEventListener('click', downloadTranscript);
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

function downloadTranscript() {
    const container = document.getElementById('transcript-container');
    const entries = container.querySelectorAll('.transcript-entry');

    if (entries.length === 0) {
        alert('No transcript to download.');
        return;
    }

    // Build text content
    let content = 'Baltimore Scanner Transcript\n';
    content += `Downloaded: ${new Date().toLocaleString()}\n`;
    content += `Engine: ${currentEngine === 'whisper' ? 'Whisper AI' : 'Deepgram'}\n`;
    content += '='.repeat(50) + '\n\n';

    entries.forEach(entry => {
        const time = entry.querySelector('.transcript-time')?.textContent || '';
        const text = entry.querySelector('.transcript-text')?.textContent || '';
        content += `${time} ${text}\n`;
    });

    // Add usage stats if available
    if (totalSessionSeconds > 0 || sessionStartTime) {
        let seconds = totalSessionSeconds;
        if (sessionStartTime) {
            seconds += Math.floor((Date.now() - sessionStartTime) / 1000);
        }
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const cost = (seconds / 60 * 0.0043).toFixed(4);
        content += '\n' + '='.repeat(50) + '\n';
        content += `Session Duration: ${minutes}:${secs.toString().padStart(2, '0')}\n`;
        content += `Estimated Cost: ~$${cost}\n`;
    }

    // Create and download file
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `baltimore-scanner-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ Usage Tracking ============

function startUsageTracking() {
    sessionStartTime = Date.now();
    updateUsageDisplay();

    usageInterval = setInterval(() => {
        updateUsageDisplay();
    }, 1000);
}

function stopUsageTracking() {
    if (sessionStartTime) {
        totalSessionSeconds += Math.floor((Date.now() - sessionStartTime) / 1000);
        sessionStartTime = null;
    }

    if (usageInterval) {
        clearInterval(usageInterval);
        usageInterval = null;
    }

    updateUsageDisplay();
}

function updateUsageDisplay() {
    const usageElement = document.getElementById('usage-display');
    if (!usageElement) return;

    let currentSeconds = totalSessionSeconds;
    if (sessionStartTime) {
        currentSeconds += Math.floor((Date.now() - sessionStartTime) / 1000);
    }

    const minutes = Math.floor(currentSeconds / 60);
    const seconds = currentSeconds % 60;
    const cost = (currentSeconds / 60 * 0.0043).toFixed(4);

    usageElement.innerHTML = `
        <span class="usage-time">${minutes}:${seconds.toString().padStart(2, '0')}</span>
        <span class="usage-cost">~$${cost}</span>
    `;
    usageElement.style.display = 'flex';
}

function resetUsage() {
    totalSessionSeconds = 0;
    sessionStartTime = null;
    updateUsageDisplay();
}

// Log info
console.log(`Baltimore Scanner - Feed ID: ${FEED_ID}`);
console.log(`Open Broadcastify: ${BROADCASTIFY_WEB_PLAYER}`);
console.log('Transcription engines: Whisper AI (local) & Deepgram (API)');
