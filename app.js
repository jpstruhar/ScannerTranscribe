/**
 * Baltimore Scanner - Live Police & Fire Radio
 * Broadcastify Feed ID: 40593
 */

const FEED_ID = 40593;
const BROADCASTIFY_WEB_PLAYER = `https://www.broadcastify.com/webPlayer/${FEED_ID}`;
const BROADCASTIFY_FEED_PAGE = `https://www.broadcastify.com/listen/feed/${FEED_ID}`;

document.addEventListener('DOMContentLoaded', () => {
    initializePlayer();
});

function initializePlayer() {
    const statusElement = document.getElementById('status');
    const iframe = document.getElementById('broadcastify-player');

    // Update status when iframe loads
    if (iframe) {
        iframe.addEventListener('load', () => {
            updateStatus(statusElement, true);
        });

        iframe.addEventListener('error', () => {
            updateStatus(statusElement, false);
        });
    }

    // Set initial status
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

// Log feed information for debugging
console.log(`Baltimore Scanner - Feed ID: ${FEED_ID}`);
console.log(`Web Player: ${BROADCASTIFY_WEB_PLAYER}`);
console.log(`Feed Page: ${BROADCASTIFY_FEED_PAGE}`);
