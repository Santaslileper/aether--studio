import * as THREE from 'https://esm.sh/three@0.160.0';
import { state } from './state.js';

export function compileSong(data) {
    if (!data || !data.length) return [];
    var ev = [];
    data.forEach(n => {
        if (n.type !== 'note') return;
        var f = ev.find(e => Math.abs(e.t - n.time) < 0.05);
        if (f) f.n.push(n); else ev.push({ t: n.time, n: [n] });
    });
    ev.sort((a, b) => a.t - b.t);

    var mR = [{ t: Array(6).fill(null), b: Array(6).fill(null) }];
    var cM = 0, cS = 0; 
    for (var i = 0; i < ev.length; i++) {
        var e = ev[i];
        e.n.forEach(n => {
            const m = n.note.match(/^([A-G]#?)(\d)$/);
            if (!m) return;
            var pitch = m[1].toLowerCase();
            var octave = m[2];
            var vp = pitch + (pitch.includes('#') ? '#' : '') + '/' + octave;
            if (parseInt(octave) >= 4) {
                if (!mR[cM].t[cS]) mR[cM].t[cS] = [];
                if (!mR[cM].t[cS].includes(vp)) mR[cM].t[cS].push(vp);
            } else {
                if (!mR[cM].b[cS]) mR[cM].b[cS] = [];
                if (!mR[cM].b[cS].includes(vp)) mR[cM].b[cS].push(vp);
            }
        });
        if (i < ev.length - 1) {
            var dt = ev[i + 1].t - e.t;
            var s = Math.round(dt / 0.188);
            if (s < 1) s = 1;
            cS += s;
            while (cS >= 6) {
                cS -= 6; cM++;
                if (!mR[cM]) mR[cM] = { t: Array(6).fill(null), b: Array(6).fill(null) };
            }
        }
    }
    return mR;
}

export function bV(hd, clef) {
    var arr = [], bms = [], curB = [], i = 0;
    function flushB() { if (curB.length > 1) bms.push(new Vex.Flow.Beam(curB)); curB = []; }
    while (i < 6) {
        if (hd[i]) {
            const sortedKeys = [...hd[i]].sort((a,b) => {
                const pitchMap = {c:0, d:1, e:2, f:3, g:4, a:5, b:6};
                const [p1, o1] = a.split('/');
                const [p2, o2] = b.split('/');
                if (o1 !== o2) return o1 - o2;
                return pitchMap[p1[0]] - pitchMap[p2[0]];
            });
            var note = new Vex.Flow.StaveNote({ clef: clef, keys: sortedKeys, duration: "16" });
            sortedKeys.forEach((p, idx) => {
                if (p.includes('#')) note.addAccidental(idx, new Vex.Flow.Accidental("#"));
            });
            arr.push(note); curB.push(note); i++;
        } else {
            flushB();
            var eC = 0;
            while (i + eC < 6 && !hd[i + eC]) eC++;
            if (eC === 6)                  { arr.push(new Vex.Flow.StaveNote({ clef: clef, keys: ["b/4"], duration: "4dr" })); i += 6; }
            else if (eC >= 2 && i % 2 === 0) { arr.push(new Vex.Flow.StaveNote({ clef: clef, keys: ["b/4"], duration: "8r"  })); i += 2; }
            else                           { arr.push(new Vex.Flow.StaveNote({ clef: clef, keys: ["b/4"], duration: "16r" })); i += 1; }
        }
    }
    flushB(); return { n: arr, b: bms };
}

export function renderPage(songData, pageIndex, hlIndex = -1, grainCanvas) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 1024;
    
    // 1. Draw Page Background (using raw 2d context)
    const rawCtx = c.getContext('2d');
    rawCtx.fillStyle = '#ffffff';
    rawCtx.fillRect(0, 0, 1024, 1024);
    if (grainCanvas) rawCtx.drawImage(grainCanvas, 0, 0);

    const renderer = new Vex.Flow.Renderer(c, Vex.Flow.Renderer.Backends.CANVAS);
    renderer.resize(1024, 1024);
    const ctx = renderer.getContext();

    // 2. Draw Text (Title/Page)
    const song = state.playlists[state.currentSongKey];
    ctx.setFillStyle('#000000');
    ctx.setFont('italic 700 38px "Playfair Display", serif');
    ctx.fillText(song?.name || '', 512, 60);
    ctx.setFont('16px Inter, sans-serif');
    ctx.fillText(`Page ${pageIndex+1}`, 512, 88);

    if (!state.compiledMeasures.length && songData) state.compiledMeasures = compileSong(songData);
    if (!state.compiledMeasures.length) {
        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 16;
        return tex;
    }

    // 3. Draw Measures
    const mPP = 6; 
    const start = pageIndex * mPP;
    const slice = state.compiledMeasures.slice(start, start + mPP);
    
    ctx.save();
    ctx.scale(2.2, 2.2); 
    ctx.setFillStyle("#000000");
    ctx.setStrokeStyle("#000000");

    let x = 20, y = 60, mW = 220, rowH = 160;

    for (let i = 0; i < slice.length; i++) {
        if (i > 0 && i % 2 === 0) { x = 20; y += rowH; }

        var top = new Vex.Flow.Stave(x, y, mW);
        var btm = new Vex.Flow.Stave(x, y + 70, mW);

        if (x === 20) {
            top.addClef('treble'); btm.addClef('bass');
            if (start + i === 0) { top.addTimeSignature('3/8'); btm.addTimeSignature('3/8'); }
            new Vex.Flow.StaveConnector(top, btm).setType(Vex.Flow.StaveConnector.type.BRACE).setContext(ctx).draw();
            new Vex.Flow.StaveConnector(top, btm).setType(Vex.Flow.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
        }
        new Vex.Flow.StaveConnector(top, btm).setType(Vex.Flow.StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();
        top.setContext(ctx).draw();
        btm.setContext(ctx).draw();

        var tRes = bV(slice[i].t, "treble");
        var bRes = bV(slice[i].b, "bass");

        try {
            var vT = new Vex.Flow.Voice({ num_beats: 6, beat_value: 16 }).addTickables(tRes.n);
            var vB = new Vex.Flow.Voice({ num_beats: 6, beat_value: 16 }).addTickables(bRes.n);
            new Vex.Flow.Formatter().joinVoices([vT, vB]).format([vT, vB], mW - (x === 20 ? 55 : 20));
            vT.draw(ctx, top);
            vB.draw(ctx, btm);
            tRes.b.forEach(b => { b.setContext(ctx).draw(); });
            bRes.b.forEach(b => { b.setContext(ctx).draw(); });
        } catch (err) { console.error("VexFlow Error:", err); }

        x += mW;
    }
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 16;
    return tex;
}
