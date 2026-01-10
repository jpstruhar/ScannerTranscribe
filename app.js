/**
 * Scanner Transcribe - Real-time Radio to Text
 * Browser-based transcription for any audio source
 * Supports Whisper AI (local) and Deepgram (cloud)
 */

const DEFAULT_FEED_ID = 40593;

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

// Keyword alerts
let alertKeywords = [];

// Privacy settings
let redactionEnabled = false;
let phoneticNormalizationEnabled = true;

// Database state
let db = null;
let currentSessionId = null;
const DB_NAME = 'ScannerTranscribeDB';
const DB_VERSION = 1;

// Settings
const WHISPER_CHUNK_DURATION = 10000; // 10 seconds per chunk

// Police/scanner vocabulary prompt to improve transcription accuracy
// This guides the model toward correct terminology and numeric formats
const SCANNER_VOCABULARY_PROMPT = `Police radio transcript. Unit numbers: Adam-12, Lincoln-42, 5-21, 3-14. ` +
    `CAD numbers: 2024-001234, 2025-056789. License plates: 7ABC123, 8XYZ789. ` +
    `Addresses: 1234 Main Street, 5678 Oak Avenue. ` +
    `10-codes: 10-4, 10-97, 10-8, 10-7. Phonetic: Adam, Boy, Charles, David, Edward, Frank, George, Henry, Ida, John, King, Lincoln, Mary, Nora, Ocean, Paul, Queen, Robert, Sam, Tom, Union, Victor, William, X-ray, Yellow, Zebra. ` +
    `Signal codes, badge numbers, and radio callsigns.`;

document.addEventListener('DOMContentLoaded', async () => {
    checkMobileBrowser();
    await initializeDatabase();
    initializeFeedInput();
    initializeKeywords();
    initializePrivacySettings();
    initializeAudioCapture();
    initializeEngineSelector();
    initializeWhisper();
    initializeDeepgram();
    initializeTranscriptionControls();
    initializeSessionHistory();
});

// ============ Mobile Browser Detection ============

function checkMobileBrowser() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTablet = /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent);

    // Also check for touch capability as a secondary signal
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isMobile || (isTablet && hasTouch)) {
        showMobileWarning();
    }
}

function showMobileWarning() {
    const warning = document.createElement('div');
    warning.className = 'mobile-warning';
    warning.innerHTML = `
        <div class="mobile-warning-content">
            <strong>⚠️ Mobile Browser Detected</strong>
            <p>Tab audio capture requires a desktop browser (Chrome or Edge). Mobile browsers do not support the getDisplayMedia API needed for capturing tab audio.</p>
            <button onclick="this.parentElement.parentElement.remove()">Dismiss</button>
        </div>
    `;
    document.body.insertBefore(warning, document.body.firstChild);
}

// ============ Feed Input ============

function initializeFeedInput() {
    const feedInput = document.getElementById('feed-id');
    const openBtn = document.getElementById('open-feed');

    // Load saved feed ID
    const savedFeedId = localStorage.getItem('feed-id');
    if (savedFeedId) {
        feedInput.value = savedFeedId;
    }

    openBtn.addEventListener('click', () => {
        const feedId = feedInput.value.trim();
        if (feedId) {
            localStorage.setItem('feed-id', feedId);
            const url = `https://www.broadcastify.com/webPlayer/${feedId}`;
            window.open(url, '_blank');
        } else {
            alert('Please enter a feed ID');
        }
    });

    feedInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            openBtn.click();
        }
    });
}

// ============ Keyword Alerts ============

function initializeKeywords() {
    const keywordInput = document.getElementById('keywords');

    // Load saved keywords
    const savedKeywords = localStorage.getItem('alert-keywords');
    if (savedKeywords) {
        keywordInput.value = savedKeywords;
        parseKeywords(savedKeywords);
    }

    keywordInput.addEventListener('input', (e) => {
        const value = e.target.value;
        localStorage.setItem('alert-keywords', value);
        parseKeywords(value);
    });
}

function parseKeywords(value) {
    alertKeywords = value
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 0);
}

function checkForKeywords(text) {
    if (alertKeywords.length === 0) return { hasKeyword: false, highlighted: text };

    const lowerText = text.toLowerCase();
    let hasKeyword = false;
    let highlighted = text;

    for (const keyword of alertKeywords) {
        if (lowerText.includes(keyword)) {
            hasKeyword = true;
            // Highlight the keyword (case-insensitive)
            const regex = new RegExp(`(${escapeRegex(keyword)})`, 'gi');
            highlighted = highlighted.replace(regex, '<mark>$1</mark>');
        }
    }

    return { hasKeyword, highlighted };
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============ Privacy Settings ============

function initializePrivacySettings() {
    const redactionCheckbox = document.getElementById('redaction-mode');
    const phoneticCheckbox = document.getElementById('phonetic-mode');

    // Load saved settings
    const savedRedaction = localStorage.getItem('redaction-enabled');
    const savedPhonetic = localStorage.getItem('phonetic-enabled');

    if (savedRedaction === 'true') {
        redactionEnabled = true;
        redactionCheckbox.checked = true;
    }

    if (savedPhonetic !== 'false') {
        phoneticNormalizationEnabled = true;
        phoneticCheckbox.checked = true;
    } else {
        phoneticNormalizationEnabled = false;
        phoneticCheckbox.checked = false;
    }

    redactionCheckbox.addEventListener('change', (e) => {
        redactionEnabled = e.target.checked;
        localStorage.setItem('redaction-enabled', redactionEnabled);
    });

    phoneticCheckbox.addEventListener('change', (e) => {
        phoneticNormalizationEnabled = e.target.checked;
        localStorage.setItem('phonetic-enabled', phoneticNormalizationEnabled);
    });
}

// Phonetic alphabet mapping
const PHONETIC_MAP = {
    'adam': 'A', 'alfa': 'A', 'alpha': 'A',
    'boy': 'B', 'bravo': 'B', 'baker': 'B',
    'charles': 'C', 'charlie': 'C',
    'david': 'D', 'delta': 'D', 'dog': 'D',
    'edward': 'E', 'echo': 'E', 'easy': 'E',
    'frank': 'F', 'foxtrot': 'F', 'fox': 'F',
    'george': 'G', 'golf': 'G',
    'henry': 'H', 'hotel': 'H', 'how': 'H',
    'ida': 'I', 'india': 'I', 'item': 'I',
    'john': 'J', 'juliet': 'J', 'jig': 'J',
    'king': 'K', 'kilo': 'K',
    'lincoln': 'L', 'lima': 'L', 'love': 'L',
    'mary': 'M', 'mike': 'M',
    'nora': 'N', 'november': 'N', 'nan': 'N',
    'ocean': 'O', 'oscar': 'O', 'oboe': 'O',
    'paul': 'P', 'papa': 'P', 'peter': 'P',
    'queen': 'Q', 'quebec': 'Q',
    'robert': 'R', 'romeo': 'R', 'roger': 'R',
    'sam': 'S', 'sierra': 'S', 'sugar': 'S',
    'tom': 'T', 'tango': 'T', 'tare': 'T',
    'union': 'U', 'uniform': 'U', 'uncle': 'U',
    'victor': 'V', 'victoria': 'V',
    'william': 'W', 'whiskey': 'W',
    'x-ray': 'X', 'xray': 'X',
    'yellow': 'Y', 'yankee': 'Y', 'yoke': 'Y',
    'zebra': 'Z', 'zulu': 'Z'
};

/**
 * Normalize phonetic alphabet sequences to letters
 * "Adam Boy Charles 123" -> "ABC123"
 */
function normalizePhonetics(text) {
    if (!phoneticNormalizationEnabled) return text;

    let result = text;

    // Match sequences of 2+ phonetic words (case insensitive)
    const phoneticWords = Object.keys(PHONETIC_MAP).join('|');
    const sequencePattern = new RegExp(`\\b((?:(?:${phoneticWords})\\s*){2,})\\b`, 'gi');

    result = result.replace(sequencePattern, (match) => {
        const words = match.trim().split(/\s+/);
        let letters = '';
        for (const word of words) {
            const lower = word.toLowerCase();
            if (PHONETIC_MAP[lower]) {
                letters += PHONETIC_MAP[lower];
            }
        }
        return letters || match;
    });

    return result;
}

/**
 * Redact personally identifiable information
 * Replaces sensitive data with [REDACTED] markers
 */
function redactPII(text) {
    if (!redactionEnabled) return text;

    let redacted = text;

    // SSN patterns: XXX-XX-XXXX
    redacted = redacted.replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '<span class="redacted">[SSN]</span>');

    // Phone numbers: various formats
    redacted = redacted.replace(/\b(?:\+?1[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}\b/g, '<span class="redacted">[PHONE]</span>');

    // DOB patterns: "date of birth", "DOB", "D.O.B." followed by date-like patterns
    redacted = redacted.replace(/\b(?:date\s+of\s+birth|DOB|D\.O\.B\.?)\s*[:\s]?\s*\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/gi, '<span class="redacted">[DOB]</span>');
    redacted = redacted.replace(/\b(?:date\s+of\s+birth|DOB|D\.O\.B\.?)\s*[:\s]?\s*(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/gi, '<span class="redacted">[DOB]</span>');
    redacted = redacted.replace(/\b(?:born\s+(?:on\s+)?)\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/gi, '<span class="redacted">[DOB]</span>');

    // License plates (after phonetic normalization, these are compact like 7ABC123)
    redacted = redacted.replace(/\b\d[A-Z]{2,3}\d{3,4}\b/g, '<span class="redacted">[PLATE]</span>');
    redacted = redacted.replace(/\b[A-Z]{2,3}\d{3,4}\b/g, '<span class="redacted">[PLATE]</span>');

    // Street addresses: number + street name + suffix
    redacted = redacted.replace(/\b\d{1,6}\s+(?:[NSEW]\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Highway|Hwy|Lane|Ln|Way|Court|Ct|Circle|Cir|Place|Pl)\b/gi, '<span class="redacted">[ADDRESS]</span>');

    // Names after common prefixes (basic heuristic)
    redacted = redacted.replace(/\b(?:named?|name\s+is|subject|suspect|victim|driver|registered\s+to|owner)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/gi, (match, name) => {
        return match.replace(name, '<span class="redacted">[NAME]</span>');
    });

    // Full names pattern: First Last or First Middle Last (after "is", "named", etc.)
    redacted = redacted.replace(/\b(?:is|was)\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g, (match, name) => {
        // Only redact if it looks like a name (not common words)
        const commonWords = ['the', 'and', 'for', 'that', 'this', 'with'];
        const words = name.toLowerCase().split(/\s+/);
        if (words.some(w => commonWords.includes(w))) return match;
        return match.replace(name, '<span class="redacted">[NAME]</span>');
    });

    return redacted;
}

// ============ IndexedDB Storage ============

/**
 * Initialize IndexedDB for persistent transcript storage
 */
async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            resolve(); // Continue without DB
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Database initialized');
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // Sessions store: metadata for each transcription session
            if (!database.objectStoreNames.contains('sessions')) {
                const sessionsStore = database.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
                sessionsStore.createIndex('startTime', 'startTime', { unique: false });
                sessionsStore.createIndex('feedId', 'feedId', { unique: false });
            }

            // Entries store: individual transcript entries
            if (!database.objectStoreNames.contains('entries')) {
                const entriesStore = database.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
                entriesStore.createIndex('sessionId', 'sessionId', { unique: false });
                entriesStore.createIndex('timestamp', 'timestamp', { unique: false });
                entriesStore.createIndex('text', 'text', { unique: false });
            }

            console.log('Database schema created');
        };
    });
}

/**
 * Start a new transcription session
 */
async function startSession() {
    if (!db) return null;

    const feedId = document.getElementById('feed-id')?.value || 'unknown';

    const session = {
        startTime: new Date().toISOString(),
        endTime: null,
        feedId: feedId,
        engine: currentEngine,
        entryCount: 0
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['sessions'], 'readwrite');
        const store = transaction.objectStore('sessions');
        const request = store.add(session);

        request.onsuccess = () => {
            currentSessionId = request.result;
            console.log('Session started:', currentSessionId);
            resolve(currentSessionId);
        };

        request.onerror = () => {
            console.error('Failed to start session');
            resolve(null);
        };
    });
}

/**
 * End the current transcription session
 */
async function endSession() {
    if (!db || !currentSessionId) return;

    return new Promise((resolve) => {
        const transaction = db.transaction(['sessions'], 'readwrite');
        const store = transaction.objectStore('sessions');
        const request = store.get(currentSessionId);

        request.onsuccess = () => {
            const session = request.result;
            if (session) {
                session.endTime = new Date().toISOString();
                store.put(session);
            }
            currentSessionId = null;
            resolve();
        };

        request.onerror = () => resolve();
    });
}

/**
 * Store a transcript entry in the database
 */
async function storeTranscriptEntry(text, confidence = null) {
    if (!db || !currentSessionId) return;

    const entry = {
        sessionId: currentSessionId,
        timestamp: new Date().toISOString(),
        text: text,  // Store raw text (before redaction)
        confidence: confidence,
        engine: currentEngine
    };

    return new Promise((resolve) => {
        const transaction = db.transaction(['entries', 'sessions'], 'readwrite');
        const entriesStore = transaction.objectStore('entries');
        const sessionsStore = transaction.objectStore('sessions');

        const addRequest = entriesStore.add(entry);

        addRequest.onsuccess = () => {
            // Update session entry count
            const getSession = sessionsStore.get(currentSessionId);
            getSession.onsuccess = () => {
                const session = getSession.result;
                if (session) {
                    session.entryCount = (session.entryCount || 0) + 1;
                    sessionsStore.put(session);
                }
            };
            resolve(addRequest.result);
        };

        addRequest.onerror = () => resolve(null);
    });
}

/**
 * Get all sessions from the database
 */
async function getAllSessions() {
    if (!db) return [];

    return new Promise((resolve) => {
        const transaction = db.transaction(['sessions'], 'readonly');
        const store = transaction.objectStore('sessions');
        const request = store.getAll();

        request.onsuccess = () => {
            // Sort by start time, newest first
            const sessions = request.result.sort((a, b) =>
                new Date(b.startTime) - new Date(a.startTime)
            );
            resolve(sessions);
        };

        request.onerror = () => resolve([]);
    });
}

/**
 * Get all entries for a specific session
 */
async function getSessionEntries(sessionId) {
    if (!db) return [];

    return new Promise((resolve) => {
        const transaction = db.transaction(['entries'], 'readonly');
        const store = transaction.objectStore('entries');
        const index = store.index('sessionId');
        const request = index.getAll(sessionId);

        request.onsuccess = () => {
            resolve(request.result.sort((a, b) =>
                new Date(a.timestamp) - new Date(b.timestamp)
            ));
        };

        request.onerror = () => resolve([]);
    });
}

/**
 * Search entries across all sessions
 */
async function searchEntries(query) {
    if (!db || !query) return [];

    const lowerQuery = query.toLowerCase();

    return new Promise((resolve) => {
        const transaction = db.transaction(['entries'], 'readonly');
        const store = transaction.objectStore('entries');
        const request = store.getAll();

        request.onsuccess = () => {
            const matches = request.result.filter(entry =>
                entry.text.toLowerCase().includes(lowerQuery)
            );
            resolve(matches.sort((a, b) =>
                new Date(b.timestamp) - new Date(a.timestamp)
            ));
        };

        request.onerror = () => resolve([]);
    });
}

/**
 * Delete a session and all its entries
 */
async function deleteSession(sessionId) {
    if (!db) return;

    return new Promise((resolve) => {
        const transaction = db.transaction(['sessions', 'entries'], 'readwrite');

        // Delete session
        transaction.objectStore('sessions').delete(sessionId);

        // Delete all entries for this session
        const entriesStore = transaction.objectStore('entries');
        const index = entriesStore.index('sessionId');
        const request = index.openCursor(IDBKeyRange.only(sessionId));

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
    });
}

/**
 * Get database statistics
 */
async function getDatabaseStats() {
    if (!db) return { sessions: 0, entries: 0 };

    return new Promise((resolve) => {
        const transaction = db.transaction(['sessions', 'entries'], 'readonly');

        let sessionCount = 0;
        let entryCount = 0;

        transaction.objectStore('sessions').count().onsuccess = (e) => {
            sessionCount = e.target.result;
        };

        transaction.objectStore('entries').count().onsuccess = (e) => {
            entryCount = e.target.result;
        };

        transaction.oncomplete = () => {
            resolve({ sessions: sessionCount, entries: entryCount });
        };
    });
}

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

        // Using whisper-small.en for better accuracy (especially numbers)
        // Larger model (~466MB) but significantly more accurate than base
        statusText.textContent = 'Whisper: Loading model (~466MB)...';

        transcriber = await pipeline(
            'automatic-speech-recognition',
            'Xenova/whisper-small.en',
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
        // Use initial_prompt to guide transcription toward police/scanner vocabulary
        const result = await transcriber(audioData, {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: false,
            language: 'english',
            task: 'transcribe',
            // Vocabulary prompt improves recognition of unit numbers, CAD, plates, etc.
            initial_prompt: SCANNER_VOCABULARY_PROMPT
        });

        if (result && result.text && result.text.trim()) {
            const rawText = result.text.trim();
            console.log('Whisper raw result:', rawText);
            if (!isNoiseOrSilence(rawText)) {
                const cleanedText = cleanupTranscription(rawText);
                console.log('Whisper cleaned result:', cleanedText);
                addTranscriptEntry(cleanedText);
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

/**
 * Post-process transcription to improve numeric accuracy
 * Fixes common hallucinations and normalizes police/scanner terminology
 */
function cleanupTranscription(text) {
    let cleaned = text;

    // === AGGRESSIVE DIGIT NORMALIZATION ===

    // Collapse spaced single digits: "2 2 0 1" -> "2201", "5 2 0 1" -> "5201"
    // This is the most common numeric corruption pattern
    cleaned = cleaned.replace(/\b(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)\b/g, '$1$2$3$4$5$6');
    cleaned = cleaned.replace(/\b(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)\b/g, '$1$2$3$4$5');
    cleaned = cleaned.replace(/\b(\d)\s+(\d)\s+(\d)\s+(\d)\b/g, '$1$2$3$4');
    cleaned = cleaned.replace(/\b(\d)\s+(\d)\s+(\d)\b/g, '$1$2$3');

    // Collapse digits separated by periods (IP-like hallucinations): "6.0.6.2.0.1" -> "606201"
    cleaned = cleaned.replace(/\b(\d)\.(\d)\.(\d)\.(\d)\.(\d)\.(\d)\b/g, '$1$2$3$4$5$6');
    cleaned = cleaned.replace(/\b(\d)\.(\d)\.(\d)\.(\d)\.(\d)\b/g, '$1$2$3$4$5');
    cleaned = cleaned.replace(/\b(\d)\.(\d)\.(\d)\.(\d)\b/g, '$1$2$3$4');

    // === PHONE NUMBER HALLUCINATION FIXES ===

    // Remove hallucinated +1 country codes that appear mid-sentence or incorrectly
    // Only keep +1 if it looks like an actual phone number (10 digits following)
    cleaned = cleaned.replace(/\+1\s*(?![\d\s\-\(\)]{10,})/g, '');

    // Remove standalone +1 at start of text (common hallucination)
    cleaned = cleaned.replace(/^\+1\s+/g, '');

    // === ADDRESS NORMALIZATION ===

    // Street addresses: ensure number is connected (606201 Pulaski -> 606201 Pulaski)
    // Already handled by digit collapse above

    // Common street suffixes - ensure proper spacing
    cleaned = cleaned.replace(/(\d+)\s*(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|highway|hwy|lane|ln|way|court|ct|circle|cir)\b/gi, '$1 $2');

    // === POLICE/SCANNER TERMINOLOGY ===

    // Normalize license plate patterns: "7 ABC 123" -> "7ABC123" (compact form)
    cleaned = cleaned.replace(/\b([0-9])\s*([A-Z]{2,3})\s*([0-9]{3,4})\b/gi, '$1$2$3');

    // Also handle "ABC 123" style plates
    cleaned = cleaned.replace(/\b([A-Z]{2,3})\s+(\d{3,4})\b/g, '$1$2');

    // Normalize unit numbers with dashes (e.g., "5 21" -> "5-21" when context suggests)
    cleaned = cleaned.replace(/\b(unit|adam|lincoln|david|boy|charles|edward|frank|george|henry|ida|john|king|mary|nora|ocean|paul|queen|robert|sam|tom|union|victor|william)\s+(\d{1,2})\s+(\d{1,2})\b/gi, '$1 $2-$3');

    // Fix common 10-code transcription errors
    cleaned = cleaned.replace(/\bten\s*(\d{1,3})\b/gi, '10-$1');
    cleaned = cleaned.replace(/\b10\s+(\d{1,3})\b/g, '10-$1');

    // Normalize CAD number format: YYYY-NNNNNN
    cleaned = cleaned.replace(/\bCAD\s*#?\s*(\d{4})\s*[-\s]?\s*(\d{4,8})\b/gi, 'CAD $1-$2');

    // === YEAR HANDLING ===

    // Fix split years: "20 24" or "20 25" -> "2024" or "2025"
    cleaned = cleaned.replace(/\b20\s+(2[3-9])\b/g, '20$1');
    cleaned = cleaned.replace(/\blast\s+year\b/gi, (match) => match); // preserve "last year" phrase

    // === FINAL CLEANUP ===

    // Clean up multiple spaces
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    // Remove trailing question marks that indicate uncertainty (keep the number)
    cleaned = cleaned.replace(/(\d)\?(\s|$)/g, '$1$2');

    return cleaned;
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
        // Using nova-3 for best accuracy with complex acoustics (54% lower WER than Nova-2)
        // numerals=true outputs numbers as digits (123 not "one two three")
        // Expanded keywords (up to 100 terms) boost recognition of police/scanner terminology
        const deepgramKeywords = [
            // 10-codes (high priority)
            '10-4:2', '10-97:2', '10-8:2', '10-7:2', '10-20:2', '10-23:2', '10-22:2',
            '10-6:2', '10-9:2', '10-10:2', '10-15:2', '10-16:2', '10-17:2', '10-18:2',
            '10-19:2', '10-21:2', '10-24:2', '10-25:2', '10-26:2', '10-27:2', '10-28:2',
            '10-29:2', '10-30:2', '10-31:2', '10-32:2', '10-33:2', '10-34:2', '10-35:2',
            // Core terminology
            'CAD:2', 'unit:1', 'copy:1', 'responding:1', 'en route:1', 'dispatch:1',
            'suspect:1', 'vehicle:1', 'subject:1', 'location:1', 'signal:1',
            // Status codes
            'code 1:2', 'code 2:2', 'code 3:2', 'code 4:2', 'priority:1',
            // Phonetic alphabet - LAPD
            'Adam:1', 'Boy:1', 'Charles:1', 'David:1', 'Edward:1', 'Frank:1',
            'George:1', 'Henry:1', 'Ida:1', 'John:1', 'King:1', 'Lincoln:1',
            'Mary:1', 'Nora:1', 'Ocean:1', 'Paul:1', 'Queen:1', 'Robert:1',
            'Sam:1', 'Tom:1', 'Union:1', 'Victor:1', 'William:1', 'X-ray:1',
            'Yellow:1', 'Zebra:1',
            // Phonetic alphabet - NATO
            'Alpha:1', 'Bravo:1', 'Charlie:1', 'Delta:1', 'Echo:1', 'Foxtrot:1',
            'Golf:1', 'Hotel:1', 'India:1', 'Juliet:1', 'Kilo:1', 'Lima:1',
            'Mike:1', 'November:1', 'Oscar:1', 'Papa:1', 'Quebec:1', 'Romeo:1',
            'Sierra:1', 'Tango:1', 'Uniform:1', 'Whiskey:1', 'Yankee:1', 'Zulu:1',
            // Common radio terms
            'affirmative:1', 'negative:1', 'roger:1', 'wilco:1', 'stand by:1',
            'disregard:1', 'clear:1', 'on scene:1', 'en route:1', 'arrived:1',
            // Emergency terms
            'ambulance:1', 'fire:1', 'backup:1', 'officer:1', 'deputy:1'
        ].map(k => `keywords=${encodeURIComponent(k)}`).join('&');

        deepgramSocket = new WebSocket(
            `wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&smart_format=true&punctuate=true&utterances=true&utt_split=1.0&numerals=true&${deepgramKeywords}`,
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
                const alternative = data.channel?.alternatives?.[0];
                const rawTranscript = alternative?.transcript;
                const confidence = alternative?.confidence || 0;

                if (rawTranscript && data.is_final) {
                    console.log('Deepgram raw transcript:', rawTranscript, 'confidence:', confidence);
                    const cleanedTranscript = cleanupTranscription(rawTranscript);
                    console.log('Deepgram cleaned transcript:', cleanedTranscript);
                    if (cleanedTranscript && !isNoiseOrSilence(cleanedTranscript)) {
                        addTranscriptEntry(cleanedTranscript, confidence);
                    }
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

async function startTranscription() {
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

    // Start a new database session
    await startSession();

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

async function stopTranscription() {
    const startBtn = document.getElementById('start-transcription');
    const stopBtn = document.getElementById('stop-transcription');
    const transcriptStatus = document.getElementById('transcript-status');

    isTranscribing = false;

    if (currentEngine === 'whisper') {
        stopWhisperTranscription();
    } else if (currentEngine === 'deepgram') {
        stopDeepgramTranscription();
    }

    // End the database session
    await endSession();

    // Refresh session history
    await refreshSessionHistory();

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

function addTranscriptEntry(text, confidence = null) {
    const container = document.getElementById('transcript-container');
    clearPlaceholder();

    // Store raw text in database (before any processing)
    storeTranscriptEntry(text, confidence);

    const entry = document.createElement('div');
    entry.className = 'transcript-entry';
    const time = new Date().toLocaleTimeString();

    // Apply phonetic normalization first (before HTML escaping)
    let processedText = normalizePhonetics(text);

    // Escape HTML for security
    let displayText = escapeHtml(processedText);

    // Check for keyword alerts (on plain text)
    const { hasKeyword, highlighted } = checkForKeywords(displayText);
    displayText = highlighted;

    // Apply PII redaction (adds HTML spans, so must be after escapeHtml)
    displayText = redactPII(displayText);

    if (hasKeyword) {
        entry.classList.add('alert');
        // Play alert sound or notification
        playAlertSound();
    }

    // Mark low-confidence transcriptions (below 80%) for visual warning
    const isLowConfidence = confidence !== null && confidence < 0.80;
    if (isLowConfidence) {
        entry.classList.add('low-confidence');
    }

    // Build confidence display
    let confidenceHtml = '';
    if (confidence !== null) {
        const confPercent = Math.round(confidence * 100);
        const confClass = confidence >= 0.90 ? 'conf-high' : (confidence >= 0.80 ? 'conf-medium' : 'conf-low');
        confidenceHtml = `<span class="transcript-confidence ${confClass}" title="Transcription confidence">${confPercent}%</span>`;
    }

    entry.innerHTML = `
        <span class="transcript-time">[${time}]</span>
        ${confidenceHtml}
        <span class="transcript-text">${displayText}</span>
    `;

    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}

function playAlertSound() {
    // Create a short beep sound
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
        // Ignore audio errors
    }
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
    const format = document.getElementById('download-format').value;

    if (entries.length === 0) {
        alert('No transcript to download.');
        return;
    }

    // Collect entries data
    const entriesData = [];
    entries.forEach(entry => {
        const time = entry.querySelector('.transcript-time')?.textContent?.replace(/[\[\]]/g, '') || '';
        const text = entry.querySelector('.transcript-text')?.textContent || '';
        entriesData.push({ time, text });
    });

    // Calculate session stats
    let sessionStats = null;
    if (totalSessionSeconds > 0 || sessionStartTime) {
        let seconds = totalSessionSeconds;
        if (sessionStartTime) {
            seconds += Math.floor((Date.now() - sessionStartTime) / 1000);
        }
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        sessionStats = {
            duration: `${minutes}:${secs.toString().padStart(2, '0')}`,
            durationSeconds: seconds,
            costEstimate: `$${(seconds / 60 * 0.0043).toFixed(4)}`
        };
    }

    let content, mimeType, extension;
    const dateStr = new Date().toISOString().slice(0, 10);

    const feedId = document.getElementById('feed-id')?.value || 'unknown';

    switch (format) {
        case 'json':
            content = JSON.stringify({
                source: 'Scanner Transcribe',
                feedId: feedId,
                exported: new Date().toISOString(),
                engine: currentEngine === 'whisper' ? 'Whisper AI' : 'Deepgram',
                keywords: alertKeywords,
                session: sessionStats,
                entries: entriesData
            }, null, 2);
            mimeType = 'application/json';
            extension = 'json';
            break;

        case 'csv':
            content = 'Time,Text\n';
            entriesData.forEach(entry => {
                // Escape quotes in text
                const escapedText = entry.text.replace(/"/g, '""');
                content += `"${entry.time}","${escapedText}"\n`;
            });
            if (sessionStats) {
                content += `\nSession Duration,${sessionStats.duration}\n`;
                content += `Estimated Cost,${sessionStats.costEstimate}\n`;
            }
            mimeType = 'text/csv';
            extension = 'csv';
            break;

        case 'txt':
        default:
            content = 'Scanner Transcribe - Transcript\n';
            content += `Feed ID: ${feedId}\n`;
            content += `Downloaded: ${new Date().toLocaleString()}\n`;
            content += `Engine: ${currentEngine === 'whisper' ? 'Whisper AI' : 'Deepgram'}\n`;
            if (alertKeywords.length > 0) {
                content += `Keywords: ${alertKeywords.join(', ')}\n`;
            }
            content += '='.repeat(50) + '\n\n';
            entriesData.forEach(entry => {
                content += `[${entry.time}] ${entry.text}\n`;
            });
            if (sessionStats) {
                content += '\n' + '='.repeat(50) + '\n';
                content += `Session Duration: ${sessionStats.duration}\n`;
                content += `Estimated Cost: ~${sessionStats.costEstimate}\n`;
            }
            mimeType = 'text/plain';
            extension = 'txt';
            break;
    }

    // Create and download file
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scanner-transcript-${feedId}-${dateStr}.${extension}`;
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

// ============ Session History ============

function initializeSessionHistory() {
    const searchInput = document.getElementById('history-search');
    const clearDbBtn = document.getElementById('clear-database');

    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch(e.target.value);
            }, 300);
        });
    }

    if (clearDbBtn) {
        clearDbBtn.addEventListener('click', async () => {
            if (confirm('Delete all stored sessions? This cannot be undone.')) {
                await clearAllSessions();
                await refreshSessionHistory();
            }
        });
    }

    // Initial load
    refreshSessionHistory();
}

async function refreshSessionHistory() {
    const container = document.getElementById('session-list');
    const statsElement = document.getElementById('db-stats');
    if (!container) return;

    const sessions = await getAllSessions();
    const stats = await getDatabaseStats();

    if (statsElement) {
        statsElement.textContent = `${stats.sessions} sessions, ${stats.entries} entries`;
    }

    if (sessions.length === 0) {
        container.innerHTML = '<p class="no-sessions">No saved sessions yet. Start transcribing to save sessions.</p>';
        return;
    }

    container.innerHTML = sessions.map(session => {
        const startDate = new Date(session.startTime);
        const dateStr = startDate.toLocaleDateString();
        const timeStr = startDate.toLocaleTimeString();
        const engine = session.engine === 'whisper' ? 'Whisper' : 'Deepgram';

        return `
            <div class="session-item" data-session-id="${session.id}">
                <div class="session-info">
                    <span class="session-date">${dateStr} ${timeStr}</span>
                    <span class="session-meta">Feed: ${session.feedId} | ${engine} | ${session.entryCount || 0} entries</span>
                </div>
                <div class="session-actions">
                    <button class="btn btn-small" onclick="viewSession(${session.id})">View</button>
                    <button class="btn btn-small" onclick="exportSession(${session.id})">Export</button>
                    <button class="btn btn-small btn-danger" onclick="confirmDeleteSession(${session.id})">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

async function viewSession(sessionId) {
    const entries = await getSessionEntries(sessionId);
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.id === sessionId);

    if (!session) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Session: ${new Date(session.startTime).toLocaleString()}</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <p class="session-details">Feed: ${session.feedId} | Engine: ${session.engine} | Entries: ${entries.length}</p>
                <div class="session-entries">
                    ${entries.map(entry => {
                        const time = new Date(entry.timestamp).toLocaleTimeString();
                        const confBadge = entry.confidence !== null
                            ? `<span class="conf-badge">${Math.round(entry.confidence * 100)}%</span>`
                            : '';
                        return `<div class="entry-row"><span class="entry-time">[${time}]</span>${confBadge}<span class="entry-text">${escapeHtml(entry.text)}</span></div>`;
                    }).join('')}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

async function exportSession(sessionId) {
    const entries = await getSessionEntries(sessionId);
    const sessions = await getAllSessions();
    const session = sessions.find(s => s.id === sessionId);

    if (!session || entries.length === 0) {
        alert('No data to export.');
        return;
    }

    const exportData = {
        source: 'Scanner Transcribe',
        exportedAt: new Date().toISOString(),
        session: {
            id: session.id,
            feedId: session.feedId,
            engine: session.engine,
            startTime: session.startTime,
            endTime: session.endTime,
            entryCount: entries.length
        },
        entries: entries.map(e => ({
            timestamp: e.timestamp,
            text: e.text,
            confidence: e.confidence
        }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${session.feedId}-${new Date(session.startTime).toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function confirmDeleteSession(sessionId) {
    if (confirm('Delete this session and all its entries?')) {
        await deleteSession(sessionId);
        await refreshSessionHistory();
    }
}

async function performSearch(query) {
    const container = document.getElementById('search-results');
    if (!container) return;

    if (!query || query.length < 2) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    const results = await searchEntries(query);

    if (results.length === 0) {
        container.innerHTML = '<p class="no-results">No matches found.</p>';
        container.style.display = 'block';
        return;
    }

    container.innerHTML = `
        <p class="search-count">${results.length} matches found</p>
        ${results.slice(0, 50).map(entry => {
            const time = new Date(entry.timestamp).toLocaleString();
            const highlighted = entry.text.replace(
                new RegExp(`(${escapeRegex(query)})`, 'gi'),
                '<mark>$1</mark>'
            );
            return `<div class="search-result"><span class="result-time">${time}</span><span class="result-text">${highlighted}</span></div>`;
        }).join('')}
        ${results.length > 50 ? `<p class="search-more">...and ${results.length - 50} more</p>` : ''}
    `;
    container.style.display = 'block';
}

async function clearAllSessions() {
    if (!db) return;

    return new Promise((resolve) => {
        const transaction = db.transaction(['sessions', 'entries'], 'readwrite');
        transaction.objectStore('sessions').clear();
        transaction.objectStore('entries').clear();
        transaction.oncomplete = () => resolve();
    });
}

// Log info
console.log('Scanner Transcribe - Real-time Radio to Text');
console.log('Supports Whisper AI (local) and Deepgram (cloud)');
console.log('Transcription engines: Whisper AI (local) & Deepgram (API)');
