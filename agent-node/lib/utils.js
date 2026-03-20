const path = require('path');

/**
 * Sanitize a string to be a safe filename.
 */
function sanitizeFilename(str, maxLen = 80) {
    if (!str) return 'unknown';
    // Remove characters that are unsafe for filenames
    let safe = str.replace(/[<>:"/\\|?*]/g, '')
                  .replace(/\./g, '_')
                  .replace(/\s+/g, '_')
                  .trim();
    
    // Cap length
    if (safe.length > maxLen) {
        safe = safe.substring(0, maxLen);
    }
    return safe || 'unknown';
}

/**
 * Convert MIDI note number to name (e.g. 60 -> C4).
 */
function midiToNoteName(midiNumber) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiNumber / 12) - 1;
    const name = names[midiNumber % 12];
    return name + octave;
}

module.exports = {
    sanitizeFilename,
    midiToNoteName
};
