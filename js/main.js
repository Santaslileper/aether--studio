import { state, lsGet } from './state.js';
import { CURATED_SONGS } from './constants.js';
import { initVisuals, animate } from './visuals.js';
import { setupUI, updateLibraryUI } from './ui.js';
import { setupInput } from './input.js';
import { initAudio, loadInstrument } from './audio.js';
import { 
    startAutoplay, stopAutoplay, switchSong, selectSong, deleteSong,
    startNarrator, stopNarrator, setSustain, triggerFootBass,
    updateSongDisplay
} from './piano.js';

async function init() {
    console.log('Initializing Aether Studio Piano...');

    // 1. Setup Input & Visuals
    initVisuals();
    setupInput();

    // 6. Start Animation Loop
    animate();

    // 2. Setup UI Handlers
    const handlers = {
        startAutoplay, stopAutoplay, switchSong, selectSong, deleteSong,
        startNarrator, stopNarrator, setSustain, triggerFootBass,
        initAudio, loadInstrument,
        updateSongDisplay,
        updateSheetMusic: (data, idx) => {
            // Internal bridge for UI triggering visuals
            import('./visuals.js').then(m => m.updateSheetMusic(data, idx));
        },
        setVolume: (v) => {
            if (state.audioStarted) {
                import('https://esm.sh/tone@15.1.22').then(Tone => {
                    Tone.getDestination().volume.rampTo(Tone.gainToDb(v), 0.1);
                });
            }
        },
        updateSongDisplay: () => {
             updateSongDisplay();
        }
    };

    try {
        setupUI(handlers);
    } catch(e) { console.error("UI Setup failed:", e); }

    // 3. Populate Library with Songs from Manifest
    try {
        const response = await fetch('../assets/songs_manifest.json');
        const assetFiles = await response.json();

        for (const songInfo of assetFiles) {
            const { fileName, friendlyName, composer, title } = songInfo;
            state.playlists[friendlyName] = { 
                name: friendlyName, 
                fileName: fileName,
                composer: composer || "Unknown",
                title: title || friendlyName,
                isLocal: true,
                data: null
            };
        }
    } catch (e) {
        console.error('Failed to load songs manifest:', e);
    }

    // Load extra saved songs from localStorage
    try {
        const saved = JSON.parse(localStorage.getItem('piano_saved_songs') || '{}');
        Object.assign(state.playlists, saved);
    } catch (_) {}

    updateLibraryUI();

    // 4. Load Last Song or Default
    try {
        const playlistKeys = Object.keys(state.playlists);
        const defaultSong = playlistKeys[0] || '';
        const lastSong = lsGet('last_song', defaultSong);
        if (state.playlists[lastSong]) {
            state.currentSongKey = lastSong;
            await loadSongData(lastSong);
            updateSongDisplay();
        }
    } catch(e) { console.error("Last song load failed:", e); }
    
    // 5. Initialize RGB Socket if enabled
    if (state.keyboardLinkEnabled && window.io) {
        try {
            console.log('Connecting to RGB Server at:', state.rgbServerUrl);
            state.rgbSocket = io(state.rgbServerUrl, {
                reconnectionAttempts: 5,
                timeout: 10000
            });

            state.rgbSocket.on('connect', () => {
                console.log('Connected to RGB Server');
            });

            state.rgbSocket.on('connect_error', (error) => {
                console.warn('RGB Server Connection Error:', error);
            });
        } catch(e) { console.warn("RGB Socket init failed:", e); }
    }

    // Auto-start audio on first interaction
    const startAudioOnce = async () => {
        try {
            await initAudio();
            console.log("Audio Engine Started via Interaction");
            window.removeEventListener('click', startAudioOnce);
            window.removeEventListener('keydown', startAudioOnce);
        } catch(e) { console.error("Auto-audio failed:", e); }
    };
    window.addEventListener('click', startAudioOnce);
    window.addEventListener('keydown', startAudioOnce);
}

async function loadSongData(key) {
    const song = state.playlists[key];
    if (!song || song.data) return;

    try {
        const path = song.fileName.startsWith('assets/') ? `../${song.fileName}` : `../assets/${song.fileName}`;
        const module = await import(path);
        song.data = Object.values(module)[0];
        console.log(`Loaded song data for: ${song.name}`);
    } catch (e) {
        console.warn(`Failed to load song data for ${song.name} via import. Falling back to fetch.`);
        try {
            const path = song.fileName.startsWith('assets/') ? `/${song.fileName}` : `/assets/${song.fileName}`;
            const res = await fetch(path);
            const content = await res.text();
            let jsonString = content.replace(/^export const [\w]+ = /, '').replace(/;[\s]*$/, '');
            song.data = JSON.parse(jsonString);
            console.log(`Fallback fetch success for: ${song.name}`);
        } catch(e2) {
            console.error(`Both import and fetch failed for ${song.name}:`, e2);
        }
    }
}

// Override internal selectSong to handle data loading
const originalSelectSong = selectSong;
window.selectSong = async (key) => {
    await loadSongData(key);
    originalSelectSong(key);
};

// Start the app
init().catch(console.error);
