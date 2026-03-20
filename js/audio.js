import * as Tone from 'https://esm.sh/tone@15.1.22';
import { state, lsSet } from './state.js';
import { SALAMANDER_URLS, SAL_BASE } from './constants.js';

let currentInstrument = null;
export let limiter, eq, reverb, vbBassSynth, keyNoise;

export const INSTRUMENT_DEFS = {
    // ── PIANO ──
    'Grand Piano': { group: 'Piano', factory: d => new Tone.Sampler({ urls: SALAMANDER_URLS, baseUrl: SAL_BASE, attack: 0.01 }).connect(d) },
    'Upright Piano': { group: 'Piano', factory: d => { const eq = new Tone.EQ3({ low: 4, mid: 0, high: -3 }).connect(d); return new Tone.Sampler({ urls: SALAMANDER_URLS, baseUrl: SAL_BASE, attack: 0.01 }).connect(eq); } },
    'Bright Piano': { group: 'Piano', factory: d => { const eq = new Tone.EQ3({ low: -2, mid: 0, high: 6 }).connect(d); return new Tone.Sampler({ urls: SALAMANDER_URLS, baseUrl: SAL_BASE, attack: 0.005 }).connect(eq); } },
    'Honky-Tonk': { group: 'Piano', factory: d => { const eq = new Tone.EQ3({ low: 2, mid: 3, high: 0 }).connect(d); const s = new Tone.Sampler({ urls: SALAMANDER_URLS, baseUrl: SAL_BASE, attack: 0.01 }).connect(eq); s.detune.value = 18; return s; } },
    'Rhodes Piano': { group: 'Piano', factory: d => new Tone.PolySynth(Tone.FMSynth, { harmonicity: 3.01, modulationIndex: 14, oscillator: { type: 'triangle' }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.1, release: 1.2 }, modulation: { type: 'square' }, modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.2, release: 0.1 } }).connect(d) },
    'Wurlitzer': { group: 'Piano', factory: d => new Tone.PolySynth(Tone.AMSynth, { harmonicity: 1.5, oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.8 }, modulation: { type: 'square' }, modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.5 } }).connect(d) },
    'Harpsichord': { group: 'Piano', pluck: true, factory: d => new Tone.PolySynth(Tone.PluckSynth, { attackNoise: 3, dampening: 5000, resonance: 0.6 }).connect(d) },
    'Clavinet': { group: 'Piano', factory: d => new Tone.PolySynth(Tone.MonoSynth, { oscillator: { type: 'sawtooth' }, filter: { Q: 2, type: 'bandpass' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 } }).connect(d) },

    // ── MALLETS ──
    'Celesta': { group: 'Mallets', factory: d => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.5, sustain: 0, release: 1 } }).connect(d) },
    'Music Box': { group: 'Mallets', factory: d => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.8 } }).connect(d) },
    'Vibraphone': { group: 'Mallets', factory: d => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.8, sustain: 0, release: 2 } }).connect(d) },
    'Marimba': { group: 'Mallets', factory: d => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.5 } }).connect(d) },

    // ── ORGAN ──
    'Pipe Organ': { group: 'Organ', factory: d => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'square8' }, envelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.2 } }).connect(d) },
    'Church Organ': { group: 'Organ', factory: d => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth' }, envelope: { attack: 0.08, decay: 0, sustain: 1, release: 0.15 } }).connect(d) },
    'Reed Organ': { group: 'Organ', factory: d => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle8' }, envelope: { attack: 0.15, decay: 0, sustain: 1, release: 0.3 } }).connect(d) },
    'Accordion': { group: 'Organ', factory: d => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsquare' }, envelope: { attack: 0.05, decay: 0, sustain: 1, release: 0.1 } }).connect(d) },

    // ── STRINGS & ENSEMBLE ──
    'Violin': { group: 'Strings', factory: d => new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.5 }, filter: { Q: 1, type: 'lowpass', rolloff: -12 } }).connect(d) },
    'Cello': { group: 'Strings', factory: d => new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.15, decay: 0, sustain: 1, release: 0.8 }, filter: { Q: 0.5, type: 'lowpass' } }).connect(d) },
    'Orchestral Strings': { group: 'Ensemble', factory: d => { const ch = new Tone.Chorus(4, 2, 0.5).connect(d).start(); return new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.5, decay: 0, sustain: 1, release: 1.2 } }).connect(ch); } },
    'Choir Aahs': { group: 'Ensemble', factory: d => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.3, decay: 0, sustain: 1, release: 0.8 }, filter: { type: 'bandpass', frequency: 800 } }).connect(d) },

    // ── BRASS & REED ──
    'Trumpet': { group: 'Brass', factory: d => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.1 } }).connect(d) },
    'Saxophone': { group: 'Reed', factory: d => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.12, decay: 0.1, sustain: 0.8, release: 0.2 }, filter: { Q: 2, type: 'lowpass' } }).connect(d) },
    'Flute': { group: 'Pipe', factory: d => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.3 }, modulation: { type: 'sine', frequency: 6 } }).connect(d) },

    // ── GUITAR & BASS ──
    'Acoustic Guitar': { group: 'Guitar', factory: d => new Tone.PolySynth(Tone.PluckSynth, { resonance: 0.9, dampening: 3000 }).connect(d) },
    'Electric Guitar': { group: 'Guitar', factory: d => { const dist = new Tone.Distortion(0.2).connect(d); return new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.5 } }).connect(dist); } },
    'Electric Bass': { group: 'Bass', factory: d => new Tone.PolySynth(Tone.MonoSynth, { oscillator: { type: 'fmsawtooth' }, envelope: { attack: 0.02, decay: 0.2, sustain: 0.5, release: 0.4 } }).connect(d) },

    // ── SYNTH ──
    'Lead Synth': { group: 'Synth', factory: d => new Tone.PolySynth(Tone.MonoSynth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.05, decay: 0.1, sustain: 0.3, release: 1 } }).connect(d) },
    'Pad Synth': { group: 'Synth', factory: d => { const ch = new Tone.Chorus(4, 2.5, 0.5).connect(d).start(); return new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 1.5, decay: 1.5, sustain: 1, release: 2 } }).connect(ch); } },
    'Bass Synth': { group: 'Synth', factory: d => new Tone.PolySynth(Tone.MonoSynth, { oscillator: { type: 'fmsquare' }, envelope: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 0.5 } }).connect(d) }
};

export const INSTRUMENT_GROUPS = {};
for (const [name, def] of Object.entries(INSTRUMENT_DEFS)) {
    if (!INSTRUMENT_GROUPS[def.group]) INSTRUMENT_GROUPS[def.group] = [];
    INSTRUMENT_GROUPS[def.group].push(name);
}

export function loadInstrument(name) {
    if (currentInstrument) {
        try { currentInstrument.dispose(); } catch (_) { }
    }
    const def = INSTRUMENT_DEFS[name] || INSTRUMENT_DEFS['Grand Piano'];
    currentInstrument = def.factory(limiter);
    state.currentInstrumentName = name;
    lsSet('instrument', name);
    console.log(`Instrument loaded: ${name}`);
}

export function instrAttack(note, velocity = 0.8) {
    try {
        currentInstrument?.triggerAttack(note, Tone.now(), velocity);
    } catch (_) { }
}

export function instrRelease(note) {
    try { currentInstrument?.triggerRelease(note, Tone.now()); } catch (_) { }
}

export const initAudio = async () => {
    if (state.audioStarted) return;
    try {
        await Tone.start();
        state.audioStarted = true;
        reverb = new Tone.Reverb({ decay: 2.8, preDelay: 0.1, wet: 0.2 }).toDestination();
        eq = new Tone.EQ3({ low: 2, mid: -1, high: 4, lowFrequency: 200, highFrequency: 2500 }).connect(reverb);
        limiter = new Tone.Limiter(-2).connect(eq);
        
        keyNoise = new Tone.NoiseSynth({
            noise: { type: 'pink' }, envelope: { attack: 0.005, decay: 0.025, sustain: 0, release: 0.02 }
        }).connect(new Tone.Filter(1500, 'lowpass')).connect(eq);
        keyNoise.volume.value = -50;

        vbBassSynth = new Tone.MonoSynth({
            oscillator: { type: 'fmsquare6', modulationType: 'sine', modulationIndex: 3 },
            envelope: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 1.5 },
            filter: { Q: 1, type: 'lowpass', rolloff: -24 },
            filterEnvelope: { attack: 0.05, decay: 0.1, sustain: 0.5, release: 1, baseFrequency: 60, octaves: 2 }
        }).connect(limiter);
        vbBassSynth.volume.value = -10;

        loadInstrument(state.currentInstrumentName || 'Grand Piano');
        console.log('Audio engine ready');
    } catch(e) { console.error('Audio init failed', e); }
};
