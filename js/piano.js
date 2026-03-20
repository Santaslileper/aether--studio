import * as Tone from 'https://esm.sh/tone@15.1.22';
import { state, lsSet } from './state.js';
import { PIANO_CX, revKeyMap, keyMap } from './constants.js';
import { 
    instrAttack, instrRelease, keyNoise, vbBassSynth, reverb, limiter 
} from './audio.js';
import { updateSheetMusic, animPageTurn, scene } from './visuals.js';
import { fmtTime, getShiftedNote, countConsecutive } from './utils.js';
import { updateSongDisplayUI, updateScrubUI, updateLibraryUI } from './ui.js';

export function playNote(note, isAutoplay = false, velocity = 0.8) {
    if (!state.audioStarted) return;
    const key = state.keyObjects.get(note);
    if (key) {
        // Rapid fire: If note is already active, release it internally first to allow re-attack
        if (state.activeNotes.has(note)) {
            instrRelease(note);
        } else {
            state.activeNotes.add(note);
        }
        
        instrAttack(note, velocity);
        
        // Reset animation state for crisp feel
        key.position.y = key.userData.originalY - 0.13;
        key.material.emissive.set(0xd4922a);
        key.material.emissiveIntensity = 0.45;
        
        if (!isAutoplay) keyNoise.triggerAttackRelease('16n', Tone.now());
        
        // RGB Lighting Logic
        if (state.keyboardLinkEnabled) {
            if (isAutoplay && state.kbLinkOnPlay) setKeyLight(note, 212, 146, 42);
            else if (!isAutoplay && !state.narratorMode) setKeyLight(note, 212, 146, 42); 
            // Case where we are in guide mode and user pressed note is handled by handleNarratorKeypress -> playNote(note, false)
            else if (state.narratorMode) setKeyLight(note, 212, 146, 42);
        }
        
        if (state.isRecording && !isAutoplay) {
            const recNote = { type: 'note', note, time: (Date.now() - state.recordStart) / 1000, velocity, duration: 0.1 };
            state.recordBuffer.push(recNote);
            state.recordRefs.set(note, recNote);
        }
    }
    state.sustainedNotes.delete(note);
}

export function releaseNote(note) {
    const key = state.keyObjects.get(note);
    if (key) {
        key.position.y = key.userData.originalY;
        key.material.emissive.set(0x000000);
        key.material.emissiveIntensity = 0;
        setKeyLight(note, 0, 0, 0);
    }
    
    if (!state.audioStarted) return;

    if (state.isRecording && state.recordRefs.has(note)) {
        const recNote = state.recordRefs.get(note);
        recNote.duration = Math.max(0.05, ((Date.now() - state.recordStart) / 1000) - recNote.time);
        state.recordRefs.delete(note);
    }
    
    if (state.activeNotes.has(note)) {
        state.activeNotes.delete(note);
        if (state.sustainActive) {
            state.sustainedNotes.add(note);
        } else {
            instrRelease(note);
        }
    }
}

export function setSustain(active) {
    if (state.sustainActive === active) return;
    state.sustainActive = active;
    const pg = scene.getObjectByName('pedalGroup');
    const sp = pg?.children.find(p => p.userData.pedalType === 'sustain');
    if (sp) {
        sp.position.y = active ? sp.userData.originalY - 0.05 : sp.userData.originalY;
        sp.material.emissive.set(active ? 0xbba000 : 0x000000);
        sp.material.emissiveIntensity = active ? 0.3 : 0;
    }
    if (state.audioStarted) reverb.wet.rampTo(active ? 0.35 : 0.18, 0.35);
    document.getElementById('sustain-indicator')?.classList.toggle('active', active);
    if (!active) {
        state.sustainedNotes.forEach(n => { if (!state.activeNotes.has(n)) instrRelease(n); });
        state.sustainedNotes.clear();
    }
}

export function triggerFootBass(active) {
    if (state.footBassActive === active) return;
    state.footBassActive = active;
    const pg = scene.getObjectByName('pedalGroup');
    const vbp = pg?.children.find(p => p.userData.pedalType === 'footBass');
    if (vbp) {
        vbp.position.y = active ? vbp.userData.originalY - 0.05 : vbp.userData.originalY;
        vbp.material.emissive.set(active ? 0xd4922a : 0x000000);
        vbp.material.emissiveIntensity = active ? 0.3 : 0;
    }
    if (state.audioStarted) { active ? vbBassSynth.triggerAttack('C1') : vbBassSynth.triggerRelease(); }
}

export function setKeyLight(note, r, g, b) {
    if (state.rgbSocket && state.rgbSocket.connected) {
        // Find which physical key currently maps to this note given the octave shift
        let targetKey = null;
        for (const [key, base] of Object.entries(keyMap)) {
            if (!base || ['SUSTAIN', 'VB_PEDAL', 'SOFT_PEDAL'].includes(base)) continue;
            const n = getShiftedNote(base, state.octaveShift);
            if (n === note) { targetKey = key; break; }
        }

        const data = { key: targetKey, note, r, g, b };
        if (r > 0 || g > 0 || b > 0) {
            state.rgbSocket.emit('note_on', data);
        } else {
            state.rgbSocket.emit('note_off', data);
        }
    }
}

export async function startAutoplay(offset = 0) {
    if (state.narratorMode) stopNarrator();
    if (state.isPlaying && offset === 0) { stopAutoplay(); return; }
    
    // We assume initAudio handles Tone.start()
    if (state.isPlaying) stopAutoplay();
    state.isPlaying = true;
    
    const btn = document.getElementById('auto-play');
    if (btn) { btn.textContent = '■'; btn.classList.add('playing'); }

    const songData = state.playlists[state.currentSongKey]?.data;
    if (!songData?.length) { stopAutoplay(); return; }
    const totalDur = songData[songData.length - 1].time;

    const scrub = document.getElementById('song-scrub');
    if (scrub) { scrub.max = totalDur; scrub.value = offset; }
    const total = document.querySelector('.total-time');
    if (total) total.textContent = fmtTime(totalDur);

    let noteIdx = -1;
    songData.forEach(item => {
        if (item.time < offset) { if (item.type === 'note') noteIdx++; return; }
        const relMs = ((item.time - offset) / state.playbackSpeed) * 1000;
        const t = setTimeout(() => {
            if (!state.isPlaying) return;
            if (item.type === 'note') {
                noteIdx++;
                playNote(item.note, true, item.velocity || 0.7);
                updateScrubUI(item.time);
                updateSheetMusic(songData, noteIdx);
                const rel = setTimeout(() => { if (state.isPlaying) releaseNote(item.note); }, (item.duration * 1000) / state.playbackSpeed);
                state.timeouts.push(rel);
            } else if (item.type === 'sustain') {
                setSustain(item.value);
            }
        }, relMs);
        state.timeouts.push(t);
    });

    const endT = setTimeout(() => { if (state.isPlaying) { stopAutoplay(); switchSong(1); } },
        ((totalDur - offset) / state.playbackSpeed) * 1000 + 900);
    state.timeouts.push(endT);
}

export function stopAutoplay() {
    state.isPlaying = false; state.currentSpread = 0;
    state.timeouts.forEach(clearTimeout); state.timeouts = [];
    [...state.activeNotes].forEach(n => releaseNote(n));
    setSustain(false);
    state.keyObjects.forEach(k => { k.position.y = k.userData.originalY; k.material.emissive.set(0x000000); k.material.emissiveIntensity = 0; });
    const btn = document.getElementById('auto-play');
    if (btn) { btn.textContent = '▶'; btn.classList.remove('playing'); }
}

export function switchSong(dir = 1) {
    const wasPlaying = state.isPlaying, wasNarrator = state.narratorMode;
    stopAutoplay(); stopNarrator();
    const keys = Object.keys(state.playlists).filter(k => state.playlists[k]?.data?.length);
    if (!keys.length) return;
    let idx = keys.indexOf(state.currentSongKey) + dir;
    if (idx < 0) idx = keys.length - 1;
    if (idx >= keys.length) idx = 0;
    state.currentSongKey = keys[idx];
    updateSongDisplay();
    if (wasPlaying) setTimeout(() => startAutoplay(), 80);
    if (wasNarrator) setTimeout(() => startNarrator(), 80);
}

export function updateSongDisplay() {
    const song = state.playlists[state.currentSongKey];
    if (!song) return;
    updateSongDisplayUI(song);
    lsSet('last_song', state.currentSongKey);
    state.currentSpread = 0;
    if (song.data) updateSheetMusic(song.data);
}

export async function selectSong(key) {
    stopAutoplay(); stopNarrator();
    state.currentSongKey = key;
    
    const song = state.playlists[key];
    if (song && !song.data && song.fileName) {
        try {
            const module = await import(`../assets/${song.fileName}`);
            song.data = Object.values(module)[0];
        } catch (e) { console.error("Failed to load song data", e); }
    }

    updateSongDisplay();
    document.getElementById('library-modal')?.classList.add('hidden');
    setTimeout(() => startAutoplay(), 80);
}

export function deleteSong(key) {
    const song = state.playlists[key];
    if (!song) return;
    if (!confirm(`Delete "${song.name}"?`)) return;
    delete state.playlists[key];
    try {
        const saved = JSON.parse(localStorage.getItem('piano_saved_songs') || '{}');
        delete saved[key];
        lsSet('piano_saved_songs', JSON.stringify(saved));
    } catch (_) {}
    updateLibraryUI();
    if (state.currentSongKey === key) switchSong(1);
}

// Narrator / Guide logic
export function highlightNarratorKey(note) {
    if (state._prevNarratorKey) {
        state._prevNarratorKey.material.emissive.set(0x000000);
        state._prevNarratorKey.material.emissiveIntensity = 0;
    }
    const key = state.keyObjects.get(note);
    if (key) {
        key.material.emissive.set(0x4a8fe0);
        key.material.emissiveIntensity = 0.9;
        if (state.keyboardLinkEnabled && state.kbLinkOnGuide) {
            setKeyLight(note, 74, 143, 224);
        }
        state._prevNarratorKey = key;
    }

    // Hint logic (simplified helper here or call util)
    const hint = getModifierHint(note);
    const hintBar = document.getElementById('narrator-hint');
    const hintTxt = document.getElementById('hint-text');
    if (hintBar) hintBar.classList.remove('hidden');
    if (hintTxt) hintTxt.textContent = `Next: ${note}  →  ${hint}`;
}

function getModifierHint(targetNote) {
    // keyMap is imported from constants.js
    for (const [key, base] of Object.entries(keyMap)) {
        if (!base || ['SUSTAIN', 'VB_PEDAL', 'SOFT_PEDAL'].includes(base)) continue;
        for (const [mod, shift, label] of [['', 0, ''], ['Shift', 1, 'Shift+'], ['Ctrl', -1, 'Ctrl+'], ['Alt', -2, 'Alt+']]) {
            const n = getShiftedNote(base, shift);
            if (n === targetNote) return `${label}[${key.toUpperCase()}]`;
        }
    }
    return targetNote;
}

export function handleNarratorKeypress(note) {
    const songData = state.playlists[state.currentSongKey]?.data;
    if (!songData) return;
    const notes = songData.filter(e => e.type === 'note');
    if (state.narratorIndex >= notes.length) return;

    const expected = notes[state.narratorIndex];
    if (note === expected.note) {
        playNote(note);
        state.narratorIndex++;
        updateSheetMusic(songData, state.narratorIndex);
        if (state.narratorIndex < notes.length) {
            const nextNote = notes[state.narratorIndex];
            if (nextNote.note === expected.note) {
                const hint = getModifierHint(nextNote.note);
                const hText = document.getElementById('hint-text');
                if (hText) hText.textContent = `Next: ${nextNote.note}  →  ${hint} (×${countConsecutive(notes, state.narratorIndex)})`;
            } else {
                highlightNarratorKey(nextNote.note);
            }
        } else {
            stopNarrator();
        }
    } else {
        const k = state.keyObjects.get(note);
        if (k) {
            k.material.emissive.set(0xc95c5c);
            k.material.emissiveIntensity = 0.9;
            setTimeout(() => { k.material.emissive.set(0x000000); k.material.emissiveIntensity = 0; }, 220);
        }
    }
}

export function startNarrator() {
    if (state.isPlaying) stopAutoplay();
    if (state.narratorMode) { stopNarrator(); return; }
    state.narratorMode = true; state.narratorIndex = 0;
    const btn = document.getElementById('narrator-toggle');
    if (btn) { btn.classList.add('active'); btn.textContent = 'Stop Guide'; }
    const songData = state.playlists[state.currentSongKey]?.data;
    if (songData) {
        const notes = songData.filter(e => e.type === 'note');
        if (notes.length) highlightNarratorKey(notes[0].note);
    }
}

export function stopNarrator() {
    state.narratorMode = false; state.narratorIndex = 0; state._prevNarratorKey = null;
    const btn = document.getElementById('narrator-toggle');
    if (btn) { btn.classList.remove('active'); btn.textContent = 'Guide'; }
    document.getElementById('narrator-hint')?.classList.add('hidden');
    state.keyObjects.forEach(k => { k.material.emissive.set(0x000000); k.material.emissiveIntensity = 0; });
}
