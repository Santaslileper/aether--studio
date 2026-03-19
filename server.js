const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let sdk = null;
let sdkReady = false;
let devices = [];
let ledCache = {};

function hsvToRgb(h, s, v) {
  let r, g, b, i = Math.floor(h * 6);
  let f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v, g = t, b = p; break; case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break; case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break; case 5: r = v, g = p, b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

try { sdk = require('cue-sdk'); }
catch (e) { console.error('[SDK] Failed to load:', e.message); }

function loadDevices() {
    try {
        const result = sdk.CorsairGetDevices({ deviceTypeMask: 0xFFFFFFFF });
        const devList = result && result.data ? result.data : result;
        if (!devList || !devList.length) return;
        devices = devList.map(d => ({ id: d.id, model: d.model, ledCount: d.ledCount }));
        for (const dev of devices) {
            try {
                const r = sdk.CorsairGetLedPositions(dev.id);
                const leds = r && r.data ? r.data : r;
                ledCache[dev.id] = (leds || []).map(l => ({ id: l.id, cx: l.cx, cy: l.cy }));
                if (!loadDevices._logged) console.log(`[SDK] ${dev.model}: ${ledCache[dev.id].length} LEDs`);
            } catch(e) { ledCache[dev.id] = []; }
        }
        loadDevices._logged = true;
    } catch(e) { console.error('[SDK] loadDevices:', e.message); }
}

function onStateChanged(event) {
    const state = event && event.data && event.data.state;
    if (state === 6 || state === 3) {
        sdkReady = true;
        try { sdk.CorsairRequestControl(null, 'ExclusiveLightingControl'); } catch(e) {}
        loadDevices();
        console.log('[SDK] Connected and Ready.');
    } else { sdkReady = false; devices = []; ledCache = {}; }
}

if (sdk) {
    sdk.CorsairConnect(onStateChanged, null);
    setInterval(() => { if (sdkReady) loadDevices(); }, 5000);
}

function safeSetColors(deviceId, colors) {
    if (!colors || !colors.length || !sdkReady) return;
    try {
        const clean = colors.map(c => ({
            id: parseInt(c.id),
            r: Math.min(255, Math.max(0, Math.floor(c.r || 0))),
            g: Math.min(255, Math.max(0, Math.floor(c.g || 0))),
            b: Math.min(255, Math.max(0, Math.floor(c.b || 0))),
            a: 255
        })).filter(c => !isNaN(c.id));
        if (!clean.length) return;
        const res = sdk.CorsairSetLedColors(deviceId, clean);
        const err = (res && typeof res.error === 'number') ? res.error : 0;
        if (err !== 0) console.warn(`[SDK] SetLedColors error:`, err);
        return { ok: err === 0 };
    } catch(e) { console.warn(`[SDK] SetLedColors failed:`, e.message); return { ok: false }; }
}

function setAllColors(r, g, b) {
    if (!sdkReady || !devices.length) return false;
    for (const dev of devices) setDeviceColor(dev.id, r, g, b);
    return true;
}

function setDeviceColor(deviceId, r, g, b) {
    if (!sdkReady) return false;
    const leds = ledCache[deviceId] || [];
    if (!leds.length) return false;
    safeSetColors(deviceId, leds.map(l => ({ id: l.id, r, g, b })));
    return true;
}

app.get('/api/status', (req, res) => {
    res.json({ sdkReady, devices: devices.map(d => ({ id: d.id, model: d.model, leds: (ledCache[d.id]||[]).length })) });
});

app.get('/api/devices/:deviceId/leds', (req, res) => {
    res.json({ deviceId: req.params.deviceId, leds: ledCache[req.params.deviceId] || [] });
});

app.get('/api/devices/:deviceId/colors', (req, res) => {
    if (!sdkReady) return res.json({ ok: false, reason: 'SDK not ready' });
    const leds = ledCache[req.params.deviceId];
    if (!leds) return res.json({ ok: false, reason: 'Device not found' });
    try {
        const colors = leds.map(l => ({ id: l.id, r: 0, g: 0, b: 0, a: 255 }));
        const result = sdk.CorsairGetLedColors(req.params.deviceId, colors);
        res.json(result && result.error === 0 ? { ok: true, colors } : { ok: false, err: result });
    } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/color', (req, res) => {
    const { r=0, g=0, b=0 } = req.body;
    res.json({ ok: setAllColors(r, g, b), reason: sdkReady ? undefined : 'SDK not ready' });
});

app.post('/api/color/:deviceId', (req, res) => {
    const { r=0, g=0, b=0 } = req.body;
    res.json({ ok: setDeviceColor(req.params.deviceId, r, g, b) });
});

app.post('/api/color/:deviceId/leds', (req, res) => {
    if (!sdkReady) return res.json({ ok: false, reason: 'SDK not ready' });
    const { leds } = req.body;
    if (!Array.isArray(leds)) return res.status(400).json({ ok: false, reason: 'Expected {leds:[]}' });
    const result = safeSetColors(req.params.deviceId, leds);
    res.json(result || { ok: false });
});

app.post('/api/effect', (req, res) => {
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server → http://localhost:${PORT}`));
