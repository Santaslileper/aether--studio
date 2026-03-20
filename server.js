/**
 * Aether Studio — Unified Local Server
 * 
 * Port 3000 (single process):
 *   - Serves the piano app + vault from the repo root
 *   - socket.io for Corsair RGB keyboard lighting
 *   - REST API for MIDI harvesting & library management
 * 
 * GitHub Pages handles hosting; this server is only needed for:
 *   • RGB keyboard LED feedback
 *   • Fetching/downloading new MIDI files
 *   • Running the harvester (Playwright)
 */

require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs-extra');
const { Midi } = require('@tonejs/midi');

const { runVaultMerge } = require('./agent-node/lib/vault');
const { processItem }   = require('./agent-node/lib/harvester');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
const PORT   = process.env.PORT || 3000;

// ── Paths ──────────────────────────────────────────────────────────────────────
const ROOT_DIR  = __dirname;
const DATA_DIR  = path.join(ROOT_DIR, 'data');
const MIDIS_DIR = path.join(ROOT_DIR, 'midis');
const COMPS_FILE = path.join(DATA_DIR, 'all_compositions.json');

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(MIDIS_DIR);

// ── Agent State ────────────────────────────────────────────────────────────────
let agentState = {
    metadata_running: false,
    midi_running: false,
    last_log: 'Agent ready.',
    log_buffer: [],
    stats: { composers: 0, songs: 0, midis: 0, missing: 0 },
    fetch_status: {}
};

function _log(msg) {
    agentState.log_buffer.push(msg);
    if (agentState.log_buffer.length > 200) agentState.log_buffer.shift();
    agentState.last_log = msg;
    console.log(`[Agent] ${msg}`);
}

async function refreshStats() {
    try {
        let missing = 0;
        if (await fs.exists(COMPS_FILE)) {
            const data = await fs.readJson(COMPS_FILE);
            agentState.stats.songs = data.length;
            agentState.stats.composers = new Set(data.map(i => i.composer || '?')).size;
            missing = data.filter(i => i.midi !== true).length;
        }
        const midiFiles = await fs.readdir(MIDIS_DIR);
        agentState.stats.midis = midiFiles.filter(f => f.toLowerCase().endsWith('.mid')).length;
        agentState.stats.missing = missing;
    } catch (e) {
        _log(`Stats error: ${e.message}`);
    }
}

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Static: serve repo root (piano app at /)
app.use(express.static(ROOT_DIR));
// Static: MIDI files
app.use('/midis', express.static(MIDIS_DIR));
// Static: data (compositions JSON)
app.use('/data', express.static(DATA_DIR));

// ── Corsair RGB SDK ────────────────────────────────────────────────────────────
const PIANO_KEY_TO_LED = {
    '1':15,'2':16,'3':17,'4':18,'5':19,'6':20,'7':21,'8':22,'9':23,'0':24,'-':25,'=':26,
    'q':29,'w':30,'e':31,'r':32,'t':33,'y':34,'u':35,'i':36,'o':37,'p':38,'[':39,']':40,
    'a':42,'s':43,'d':44,'f':45,'g':46,'h':47,'j':48,'k':49,'l':50,';':51,"'":52,
    'z':57,'x':58,'c':59,'v':60,'b':61,'n':62,'m':63,',':64,'.':65,'/':66,' ':71,
};

let sdk = null, sdkReady = false, devices = [], ledCache = {};

function hsvToRgb(h, s, v) {
    let r, g, b, i = Math.floor(h * 6);
    let f = h * 6 - i, p = v*(1-s), q = v*(1-f*s), t = v*(1-(1-f)*s);
    switch (i % 6) {
        case 0: r=v;g=t;b=p; break; case 1: r=q;g=v;b=p; break;
        case 2: r=p;g=v;b=t; break; case 3: r=p;g=q;b=v; break;
        case 4: r=t;g=p;b=v; break; case 5: r=v;g=p;b=q; break;
    }
    return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}

try {
    sdk = require('cue-sdk');
    console.log('[SDK] Corsair CUE SDK loaded.');
} catch (e) {
    console.log('[SDK] cue-sdk not installed — RGB disabled.');
}

function loadDevices() {
    if (!sdk || !sdkReady) return;
    try {
        const result = sdk.CorsairGetDevices({ deviceTypeMask: 0xFFFFFFFF });
        const devList = result?.data ?? result;
        if (!devList?.length) return;
        devices = devList.map(d => ({ id: d.id, model: d.model, ledCount: d.ledCount }));
        for (const dev of devices) {
            try {
                const r = sdk.CorsairGetLedPositions(dev.id);
                const leds = r?.data ?? r;
                ledCache[dev.id] = (leds || []).map(l => ({ id: l.id, cx: l.cx, cy: l.cy }));
            } catch(e) { ledCache[dev.id] = []; }
        }
    } catch(e) { console.error('[SDK] loadDevices:', e.message); }
}

function onStateChanged(event) {
    const s = event?.data?.state;
    if (s === 6 || s === 3) {
        sdkReady = true;
        try { sdk.CorsairRequestControl(null, 'ExclusiveLightingControl'); } catch(e) {}
        loadDevices();
        console.log('[SDK] Connected and ready.');
    } else { sdkReady = false; devices = []; ledCache = {}; }
}

if (sdk) {
    sdk.CorsairConnect(onStateChanged, null);
    setInterval(() => { if (sdkReady) loadDevices(); }, 5000);
}

function safeSetColors(deviceId, colors) {
    if (!colors?.length || !sdkReady) return;
    try {
        const clean = colors.map(c => ({
            id: parseInt(c.id),
            r: Math.min(255, Math.max(0, Math.floor(c.r || 0))),
            g: Math.min(255, Math.max(0, Math.floor(c.g || 0))),
            b: Math.min(255, Math.max(0, Math.floor(c.b || 0))),
            a: 255
        })).filter(c => !isNaN(c.id));
        if (!clean.length) return;
        return sdk.CorsairSetLedColors(deviceId, clean);
    } catch(e) { console.warn('[SDK] SetLedColors:', e.message); }
}

function setAllColors(r, g, b) {
    if (!sdkReady || !devices.length) return false;
    for (const dev of devices) {
        const leds = ledCache[dev.id] || [];
        if (leds.length) safeSetColors(dev.id, leds.map(l => ({ id: l.id, r, g, b })));
    }
    return true;
}

// ── socket.io ──────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    socket.on('note_on', (data) => {
        const ledId = PIANO_KEY_TO_LED[data.key];
        if (!ledId) return;
        devices.forEach(dev => {
            if ((ledCache[dev.id]||[]).some(l => l.id === ledId))
                safeSetColors(dev.id, [{ id: ledId, r: data.r, g: data.g, b: data.b }]);
        });
    });
    socket.on('note_off', (data) => {
        const ledId = PIANO_KEY_TO_LED[data.key];
        if (!ledId) return;
        devices.forEach(dev => {
            if ((ledCache[dev.id]||[]).some(l => l.id === ledId))
                safeSetColors(dev.id, [{ id: ledId, r: 0, g: 0, b: 0 }]);
        });
    });
});

// ── RGB API ────────────────────────────────────────────────────────────────────
app.get('/api/rgb/status', (req, res) => {
    res.json({ sdkReady, devices: devices.map(d => ({ id: d.id, model: d.model, leds: (ledCache[d.id]||[]).length })) });
});

app.post('/api/rgb/color', (req, res) => {
    const { r=0, g=0, b=0 } = req.body;
    res.json({ ok: setAllColors(r, g, b), reason: sdkReady ? undefined : 'SDK not ready' });
});

app.post('/api/rgb/effect', (req, res) => {
    const { effect, deviceId } = req.body;
    if (!sdkReady) return res.json({ ok: false, reason: 'SDK not ready' });
    if (global._fx) { clearInterval(global._fx); global._fx = null; }
    const targetLeds = [];
    if (deviceId) {
        (ledCache[deviceId]||[]).forEach(l => targetLeds.push({ id: l.id, devId: deviceId, r:0, g:0, b:0 }));
    } else {
        for (const dev of devices) (ledCache[dev.id]||[]).forEach(l => targetLeds.push({ id: l.id, devId: dev.id, r:0, g:0, b:0 }));
    }
    if (!targetLeds.length) return res.json({ ok: false, reason: 'No LEDs' });
    let step = 0;
    const flush = () => {
        const byDev = {};
        for (const l of targetLeds) (byDev[l.devId]=byDev[l.devId]||[]).push({ id:l.id, r:l.r, g:l.g, b:l.b, a:255 });
        for (const [id, cols] of Object.entries(byDev)) safeSetColors(id, cols);
    };
    switch(effect) {
        case 'off':     targetLeds.forEach(l=>{l.r=0;l.g=0;l.b=0;}); flush(); break;
        case 'rainbow': global._fx=setInterval(()=>{ targetLeds.forEach((l,i)=>{const[r,g,b]=hsvToRgb(((step+i*4)%360)/360,1,1);l.r=r;l.g=g;l.b=b;}); flush(); step=(step+3)%360; },50); break;
        case 'pulse':   global._fx=setInterval(()=>{ const bri=(Math.sin(step*0.05)+1)/2; targetLeds.forEach(l=>{l.r=Math.round(255*bri);l.g=0;l.b=Math.round(140*bri);}); flush(); step++; },30); break;
        case 'wave':    global._fx=setInterval(()=>{ targetLeds.forEach((l,i)=>{const v=(Math.sin((step+i*3)*0.1)+1)/2;l.r=0;l.g=Math.round(255*v);l.b=Math.round(200*(1-v));}); flush(); step++; },40); break;
        default: return res.status(400).json({ ok: false, reason: 'Unknown effect' });
    }
    res.json({ ok: true });
});

// ── Harvesting / Agent API ─────────────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
    await refreshStats();
    res.json({
        running_metadata: agentState.metadata_running,
        running_midi: agentState.midi_running,
        last_log: agentState.last_log,
        stats: agentState.stats,
        fetching: Object.keys(agentState.fetch_status).filter(q => agentState.fetch_status[q] === 'running'),
        rgb: { sdkReady, devices: devices.length }
    });
});

app.get('/api/logs', (req, res) => {
    res.json({ midi_logs: agentState.log_buffer, metadata_log: agentState.last_log });
});

app.get('/api/library', async (req, res) => {
    if (await fs.exists(COMPS_FILE)) return res.json(await fs.readJson(COMPS_FILE));
    res.json([]);
});

app.get('/api/search', async (req, res) => {
    const { q, limit = 200 } = req.query;
    if (!await fs.exists(COMPS_FILE)) return res.json([]);
    const data = await fs.readJson(COMPS_FILE);
    const tokens = q ? q.toLowerCase().split(/\s+/) : [];
    let results = data;
    if (tokens.length) {
        results = data.filter(item => {
            const hay = `${item.composer} ${item.title}`.toLowerCase();
            return tokens.every(t => hay.includes(t));
        });
    }
    res.json(results.slice(0, parseInt(limit)));
});

app.get('/api/midi_json', async (req, res) => {
    const midiPath = req.query.path;
    if (!midiPath) return res.status(400).json({ error: 'Missing path' });

    let actualPath;
    // Handle path formats from Vault (e.g. assets/foo.js or absolute path)
    if (midiPath.startsWith('assets/')) {
        actualPath = path.join(__dirname, midiPath);
    } else {
        actualPath = path.join(MIDIS_DIR, path.basename(midiPath));
    }

    // Fallback search in assets if not found in midis
    if (!await fs.exists(actualPath)) {
        const altPath = path.join(__dirname, 'assets', path.basename(midiPath));
        if (await fs.exists(altPath)) actualPath = altPath;
    }

    if (!await fs.exists(actualPath)) {
        return res.status(404).json({ error: `NOT_FOUND: ${midiPath}` });
    }

    try {
        if (actualPath.endsWith('.js')) {
            // Serve pre-parsed JS data as JSON
            let content = await fs.readFile(actualPath, 'utf-8');
            // Strip ES module export: "export const FOO = [...];" -> "[...]"
            content = content.replace(/^export const [\w]+ = /, '').replace(/;[\s]*$/, '');
            return res.json(JSON.parse(content));
        } else {
            // Serve MIDI file
            const midi = new Midi(await fs.readFile(actualPath));
            const notes = [];
            midi.tracks.forEach(track => track.notes.forEach(note => notes.push({
                type: 'note',
                note: note.name,
                time: Math.round(note.time * 10000) / 10000,
                duration: Math.round(note.duration * 10000) / 10000,
                velocity: note.velocity
            })));
            notes.sort((a, b) => a.time - b.time);
            res.json(notes);
        }
    } catch (e) {
        console.error('[API] Error processing file:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/fetch_status', (req, res) => {
    res.json({ q: req.query.q, status: agentState.fetch_status[req.query.q] || 'not_started' });
});

app.post('/api/start_metadata', async (req, res) => {
    if (agentState.metadata_running) return res.json({ status: 'already_running' });
    agentState.metadata_running = true;
    _log('Metadata scan initiated...');
    (async () => {
        try {
            await runVaultMerge(DATA_DIR, MIDIS_DIR, COMPS_FILE);
            await refreshStats();
            _log(`Scan complete — ${agentState.stats.songs} works indexed.`);
        } catch (e) { _log(`Scan error: ${e.message}`); }
        finally { agentState.metadata_running = false; }
    })();
    res.json({ status: 'started' });
});

app.post('/api/start_midi', async (req, res) => {
    if (agentState.midi_running) return res.json({ status: 'already_running' });
    agentState.midi_running = true;
    _log('Midi harvester initiated...');
    setTimeout(() => { agentState.midi_running = false; _log('Midi harvester completed.'); }, 5000);
    res.json({ status: 'started' });
});

app.post('/api/harvest_target', async (req, res) => {
    const { composer, title } = req.query;
    if (!composer || !title) return res.status(400).json({ error: 'Missing parameters' });
    _log(`Targeted harvest: ${composer} — ${title}`);
    (async () => {
        try {
            const { chromium } = require('playwright');
            const browser = await chromium.launch({ headless: true });
            const context = await browser.newContext();
            const item = { composer, title };
            const success = await processItem(item, context, MIDIS_DIR);
            await browser.close();
            if (success) { await runVaultMerge(DATA_DIR, MIDIS_DIR, COMPS_FILE); await refreshStats(); _log(`Harvest success: ${title}`); }
            else _log(`Harvest: no MIDI found for ${title}`);
        } catch (e) { _log(`Harvest error: ${e.message}`); }
    })();
    res.json({ status: 'started' });
});

app.post('/api/fetch_query', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query' });
    agentState.fetch_status[q] = 'running';
    _log(`Freeform fetch: ${q}`);
    (async () => {
        try {
            const { chromium } = require('playwright');
            const browser = await chromium.launch({ headless: true });
            const context = await browser.newContext();
            const item = { composer: 'User Fetch', title: q };
            const success = await processItem(item, context, MIDIS_DIR, 'FETCH');
            await browser.close();
            if (success) {
                const data = await fs.readJson(COMPS_FILE).catch(() => []);
                data.push({ title: q, composer: 'User Fetch', source: 'bitmidi', midi: true, midi_file_path: item.midi_file_path, catalogue: '', year: null, copyright: 'unknown' });
                await fs.writeJson(COMPS_FILE, data, { spaces: 2 });
                agentState.fetch_status[q] = `found:${q}`;
                refreshStats();
                _log(`Fetch success: ${q}`);
            } else { agentState.fetch_status[q] = 'not_found'; _log(`Nothing found for '${q}'`); }
        } catch (e) { agentState.fetch_status[q] = `error:${e.message}`; _log(`Fetch error: ${e.message}`); }
    })();
    res.json({ status: 'started', query: q });
});

app.post('/api/sync', async (req, res) => {
    agentState.metadata_running = true;
    // Check if library needs initialization (only if shards exist, otherwise keep existing master)
    const shardsExist = (await fs.exists(DATA_DIR)) && (await fs.readdir(DATA_DIR)).some(f => f.endsWith('.jsonl'));
    const masterExists = await fs.exists(COMPS_FILE);

    (async () => {
        try {
            if (shardsExist) {
                _log('Sync initiated (shards found)...');
                await runVaultMerge(DATA_DIR, MIDIS_DIR, COMPS_FILE);
            } else if (!masterExists) {
                _log('Library missing. Creating empty vault.');
                await fs.writeJson(COMPS_FILE, [], { spaces: 2 });
            } else {
                _log('Master library preserved (no sync shards).');
            }
            await refreshStats();
            _log('Sync complete.');
        } catch (e) { _log(`Sync error: ${e.message}`); }
        finally { agentState.metadata_running = false; }
    })();
    res.json({ status: 'started' });
});

app.post('/api/export_zip', async (req, res) => {
    const { files = [] } = req.body;
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment('aether_export.zip');
    archive.pipe(res);
    for (const name of files) {
        const p = path.join(MIDIS_DIR, path.basename(name));
        if (await fs.exists(p)) archive.file(p, { name: path.basename(name) });
    }
    archive.finalize();
});

// Legacy: download proxy (piano ui.js uses /download?path=...)
app.get('/download', async (req, res) => {
    const p = req.query.path;
    if (!p) return res.status(400).send('Missing path');
    const actualPath = path.join(MIDIS_DIR, path.basename(p));
    if (!await fs.exists(actualPath)) return res.status(404).send('Not found');
    res.sendFile(actualPath);
});

// ── Start ──────────────────────────────────────────────────────────────────────
server.listen(PORT, async () => {
    await refreshStats();
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║   Aether Studio Server → http://localhost:${PORT}  ║`);
    console.log(`╚══════════════════════════════════════════╝`);
    console.log(`  Piano:   http://localhost:${PORT}/`);
    console.log(`  Vault:   http://localhost:${PORT}/vault/`);
    console.log(`  API:     http://localhost:${PORT}/api/status`);
    console.log(`  MIDIs:   ${MIDIS_DIR}`);
    _log(`Server ready. ${agentState.stats.songs} works, ${agentState.stats.midis} MIDIs.`);
});
