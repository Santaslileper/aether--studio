export function lsSet(k,v) { try { localStorage.setItem(k,v); } catch(_) {} }
export function lsGet(k,d) { try { return localStorage.getItem(k) ?? d; } catch(_) { return d; } }

export const IS_DEV = ['localhost','127.0.0.1'].includes(location.hostname);
export const dbg = document.getElementById('debug-panel');

export function dlog(msg, t = 'info') {
    if (!IS_DEV || !dbg) return;
    const d = document.createElement('div');
    d.className = t;
    d.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
    dbg.prepend(d);
    if (dbg.children.length > 60) dbg.removeChild(dbg.lastChild);
}

export const state = {
    audioStarted: false,
    isPlaying: false,
    narratorMode: false,
    narratorIndex: 0,
    currentSpread: 0,
    sustainActive: false,
    sustainedNotes: new Set(),
    masterVolume: parseFloat(lsGet('vol', '0.8')),
    playbackSpeed: parseFloat(lsGet('speed', '1.0')),
    timeouts: [],
    footBassActive: false,
    isRecording: false,
    recordBuffer: [],
    recordStart: 0,
    recordRefs: new Map(),
    keyObjects: new Map(),
    activeNotes: new Set(),
    activeKeyboardNotes: new Map(),
    hoveredKey: null,
    _prevNarratorKey: null,
    playlists: {},
    currentSongKey: '',
    currentInstrument: null,
    currentInstrumentName: lsGet('instrument', 'Grand Piano'),
    currentInstrumentDef: null,
    musicStand: null,
    cameraZoom: 1.0,
    disablePageTurn: lsGet('disablePageTurn', 'false') === 'true',
    octaveShift: 0,
    ws: null,
    keyboardLinkEnabled: lsGet('kbLink', 'true') === 'true',
    kbLinkOnPlay: lsGet('kbLinkPlay', 'true') === 'true',
    kbLinkOnGuide: lsGet('kbLinkGuide', 'true') === 'true',
    rgbServerUrl: lsGet('rgbUrl', 'http://localhost:3000'),
    rgbSocket: null,
};
