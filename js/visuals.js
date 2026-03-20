import * as THREE from 'https://esm.sh/three@0.160.0';
import { state } from './state.js';
import { 
    PIANO_CX, PIANO_WIDTH, FULL_RANGE, WKW, WKH, WKD, BKW, BKH, BKD, KEY_GAP, KEY_STEP,
    revKeyMap
} from './constants.js';
import { getShiftedNote } from './utils.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0b0e);
scene.fog = new THREE.Fog(0x0a0b0e, 30, 80);

export const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
// PREMIUM VIEW: Lower base position for larger keys
camera.position.set(PIANO_CX, 3.8, 8.0);
camera.lookAt(PIANO_CX, 0.5, 0);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const _grainCanvas = document.createElement('canvas');
_grainCanvas.width = 1024; _grainCanvas.height = 1024;
(() => {
    const g = _grainCanvas.getContext('2d');
    g.globalAlpha = 0.08;
    for (let i = 0; i < 1200; i++) {
        g.fillStyle = Math.random() > 0.5 ? '#8a7a60' : '#fff';
        g.fillRect(Math.random()*1024, Math.random()*1024, 1, 1);
    }
})();

function makeTextTex(text, fg='black', bg='transparent') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    if (bg !== 'transparent') { x.fillStyle = bg; x.fillRect(0,0,256,256); }
    x.fillStyle = fg;
    x.font = 'bold 160px Inter, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 128, 128);
    return new THREE.CanvasTexture(c);
}

const notesPerPage = 24;

export function renderPage(songData, pageIndex, hlIndex = -1) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 1024;
    const x = c.getContext('2d');

    x.fillStyle = '#fdfdfc'; x.fillRect(0,0,1024,1024);
    // Subtle sepia edge gradient
    const grad = x.createRadialGradient(512, 512, 100, 512, 512, 700);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(235,225,200,0.2)');
    x.fillStyle = grad; x.fillRect(0,0,1024,1024);
    x.drawImage(_grainCanvas, 0, 0);

    const song = state.playlists[state.currentSongKey];
    x.fillStyle = '#1a120b';
    x.font = 'italic 700 38px "Playfair Display", serif';
    x.textAlign = 'center';
    x.fillText(song?.name || '', 512, 60);
    x.font = '16px Inter, sans-serif';
    x.fillStyle = '#6b5a3e';
    x.fillText(`Page ${pageIndex+1}`, 512, 88);

    const drawStaff = yBase => {
        x.strokeStyle = '#555'; x.lineWidth = 1.5;
        for (let j=0;j<5;j++) {
            const yT = yBase+j*16, yB = yBase+128+j*16;
            x.beginPath(); x.moveTo(55,yT);  x.lineTo(969,yT);  x.stroke();
            x.beginPath(); x.moveTo(55,yB);  x.lineTo(969,yB);  x.stroke();
        }
        x.lineWidth = 3;
        x.beginPath(); x.moveTo(55,yBase); x.lineTo(55,yBase+192); x.stroke();
        x.fillStyle = '#111';
        x.font = '68px serif'; x.textAlign = 'left';
        x.fillText('𝄞', 68, yBase+52);
        x.fillText('𝄢', 68, yBase+172);
        x.font = 'bold 34px serif';
        x.fillText('4',145,yBase+32); x.fillText('4',145,yBase+62);
        x.fillText('4',145,yBase+160); x.fillText('4',145,yBase+190);
    };

    const staffY = [175, 468, 761];
    staffY.forEach(drawStaff);

    const allNotes = (songData||[]).filter(e=>e.type==='note');
    const start    = pageIndex * notesPerPage;
    const slice    = allNotes.slice(start, start+notesPerPage);
    const perRow   = Math.ceil(notesPerPage / staffY.length);

    const notePos = noteStr => {
        const pitch  = noteStr.replace(/[0-9]/g,'').replace('#','');
        const hasSharp = noteStr.includes('#');
        const octave = parseInt(noteStr.slice(-1));
        const steps  = {C:0,D:1,E:2,F:3,G:4,A:5,B:6};
        const fromMidC = (steps[pitch]??0) + (octave-4)*7;
        const half = 8;
        if (octave >= 4) {
            return {y: 62-(fromMidC-1)*half, clef:'treble', sharp:hasSharp, steps:fromMidC};
        } else {
            return {y: 192-(fromMidC+10)*half, clef:'bass', sharp:hasSharp, steps:fromMidC};
        }
    };

    slice.forEach((n, i) => {
        const row = Math.floor(i/perRow);
        const col = i % perRow;
        if (row >= staffY.length) return;
        const yBase = staffY[row];
        const rowSlice = slice.filter((_,ii)=>Math.floor(ii/perRow)===row);
        const tStart = rowSlice[0]?.time||0;
        const tEnd   = (rowSlice[rowSlice.length-1]?.time||0)+(rowSlice[rowSlice.length-1]?.duration||0.5);
        const tRange = Math.max(tEnd-tStart,0.01);
        const nx = 200+((n.time-tStart)/tRange)*750;
        const pos  = notePos(n.note);
        const ny   = yBase+pos.y;
        const absI = start + i;
        const isHl = absI === hlIndex;

        if (isHl) {
            x.shadowBlur=12; x.shadowColor='#d4922a';
            x.fillStyle='rgba(212,146,42,0.22)';
            x.beginPath(); x.arc(nx,ny,22,0,Math.PI*2); x.fill();
            x.shadowBlur=0;
        }
        x.fillStyle   = isHl ? '#d4922a' : '#111';
        x.strokeStyle = isHl ? '#d4922a' : '#111';
        x.lineWidth   = 2.5;

        if (pos.clef==='treble') {
            for (let l=yBase+80;l<=ny;l+=16) { x.beginPath();x.moveTo(nx-18,l);x.lineTo(nx+18,l);x.stroke(); }
            for (let l=yBase-16;l>=ny;l-=16) { x.beginPath();x.moveTo(nx-18,l);x.lineTo(nx+18,l);x.stroke(); }
        } else {
            for (let l=yBase+208;l<=ny;l+=16) { x.beginPath();x.moveTo(nx-18,l);x.lineTo(nx+18,l);x.stroke(); }
            for (let l=yBase+112;l>=ny;l-=16) { x.beginPath();x.moveTo(nx-18,l);x.lineTo(nx+18,l);x.stroke(); }
        }

        const dur = n.duration || 0.5;
        x.beginPath();
        x.ellipse(nx, ny, 12, 8.5, -0.4, 0, Math.PI*2);
        if (dur > 0.4) { x.stroke(); } else { x.fill(); }

        if (dur < 1.0) {
            const up = (pos.clef==='treble' && pos.steps < 6) || (pos.clef==='bass' && pos.steps < -1);
            x.beginPath();
            if (up) { x.moveTo(nx+11,ny); x.lineTo(nx+11,ny-60); }
            else     { x.moveTo(nx-11,ny); x.lineTo(nx-11,ny+60); }
            x.stroke();
        }

        if (pos.sharp) {
            x.font = 'bold 32px serif'; x.textAlign='left';
            x.fillText('♯', nx-36, ny+10);
        }
    });

    return new THREE.CanvasTexture(c);
}

export function updateSheetMusic(songData, hlIndex = -1) {
    if (!state.musicStand) return;
    const absPage  = Math.floor(Math.max(0,hlIndex) / notesPerPage);
    const newSpread = Math.floor(absPage/2);
    
    if (newSpread !== state.currentSpread && state.isPlaying) {
        if (!state.disablePageTurn) {
            // Prepare the flipPage texture to match the outgoing page
            const flip = state.musicStand.getObjectByName('flipPage');
            if (flip) {
                if (flip.material.map) flip.material.map.dispose();
                flip.material.map = renderPage(songData, state.currentSpread * 2 + 1, hlIndex);
                flip.material.needsUpdate = true;
            }
            animPageTurn();
        }
        state.currentSpread = newSpread;
    }
    
    const left  = state.musicStand.getObjectByName('leftPage');
    const right = state.musicStand.getObjectByName('rightPage');
    if (left) {
        if (left.material.map) left.material.map.dispose();
        left.material.map = renderPage(songData, state.currentSpread*2, hlIndex);
        left.material.needsUpdate = true;
    }
    if (right) {
        if (right.material.map) right.material.map.dispose();
        right.material.map = renderPage(songData, state.currentSpread*2+1, hlIndex);
        right.material.needsUpdate = true;
    }
}

const labelTexCache = new Map();
function getLabelTex(text, color) {
    const key = `${text}_${color}`;
    if (!labelTexCache.has(key)) labelTexCache.set(key, makeTextTex(text, color));
    return labelTexCache.get(key);
}

export function updateKeyLabels() {
    state.keyObjects.forEach((key, fullNote) => {
        let label = key.getObjectByName('keyLabel');
        const originalNote = getShiftedNote(fullNote, -state.octaveShift);
        const kbKey = revKeyMap[originalNote];

        if (kbKey) {
            if (!label) {
                const isBlack = key.userData.isBlack;
                const lm = new THREE.MeshBasicMaterial({ transparent: true });
                label = new THREE.Mesh(new THREE.PlaneGeometry(isBlack ? 0.28 : 0.35, isBlack ? 0.28 : 0.35), lm);
                label.name = 'keyLabel';
                label.rotation.x = -Math.PI / 2;
                if (isBlack) label.position.set(0, (BKD * 1.5) / 2 + 0.01, 0.6);
                else label.position.set(0, WKD / 2 + 0.01, WKH / 2 - 0.5);
                key.add(label);
            }
            label.material.map = getLabelTex(kbKey.toUpperCase(), key.userData.isBlack ? '#ccc' : '#333');
            label.material.needsUpdate = true;
            label.visible = true;
        } else if (label) {
            label.visible = false;
        }
    });
}

export function animPageTurn() {
    const hinge = state.musicStand?.getObjectByName('flipHinge');
    const flip = hinge?.getObjectByName('flipPage');
    if (!hinge || !flip || flip.userData.anim) return;
    
    flip.visible = true; 
    flip.userData.anim = true;
    
    const startT = performance.now();
    const duration = 1200; 
    
    const run = now => {
        const t = Math.min((now - startT) / duration, 1);
        // Exponential ease-in-out for heavy paper feel
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        
        // Rotate the hinge around center spine
        hinge.rotation.y = e * Math.PI;
        
        // Dynamic lift: page rises slightly as it crosses center
        hinge.position.z = -2.6 + Math.sin(e * Math.PI) * 1.5;
        
        if (t < 1) {
            requestAnimationFrame(run);
        } else {
            flip.visible = false;
            flip.userData.anim = false;
            hinge.rotation.y = 0; // Ready for next right-to-left flip
            hinge.position.z = -2.6;
        }
    };
    requestAnimationFrame(run);
}

export function createPiano() {
    state.keyObjects.forEach(o => scene.remove(o));
    state.keyObjects.clear();
    scene.children.filter(c=>c.isMesh&&c.geometry.type==='PlaneGeometry').forEach(l=>scene.remove(l));

    if (!scene.getObjectByName('pianoCase')) {
        const g = new THREE.Group(); g.name='pianoCase';
        const mat = new THREE.MeshStandardMaterial({color:0x080808,roughness:0.08,metalness:0.92});
        const back = new THREE.Mesh(new THREE.BoxGeometry(PIANO_WIDTH+1,2.5,0.4),mat);
        back.position.set(PIANO_CX, 0.8, -2.2); g.add(back);
        const logoTex = makeTextTex('AETHER','rgba(212,146,42,0.7)');
        const logo = new THREE.Mesh(new THREE.PlaneGeometry(3,0.65),
            new THREE.MeshBasicMaterial({map:logoTex,transparent:true,depthWrite:false}));
        logo.position.set(PIANO_CX,0.6,-2.01); g.add(logo);
        scene.add(g);
    }

    let wx = 0;
    FULL_RANGE.forEach(({note,octave}) => {
        const full = `${note}${octave}`;
        if (note.includes('#')) return;
        const geo  = new THREE.BoxGeometry(WKW, WKD, WKH);
        const mat  = new THREE.MeshStandardMaterial({color:0xfff8f0,roughness:0.18});
        const key  = new THREE.Mesh(geo,mat);
        key.position.set(wx,0,0);
        key.userData = {note:full, originalY:0, isBlack:false};
        scene.add(key); state.keyObjects.set(full,key);

        const kbKey = revKeyMap[full];
        if (kbKey) {
            const lm = new THREE.MeshBasicMaterial({map:makeTextTex(kbKey.toUpperCase(),'#333'),transparent:true});
            const lb = new THREE.Mesh(new THREE.PlaneGeometry(0.35,0.35),lm);
            lb.rotation.x = -Math.PI/2;
            lb.position.set(0,WKD/2+0.01,WKH/2-0.5);
            key.add(lb);
        }
        wx += WKW+KEY_GAP;
    });

    let bwx = 0;
    FULL_RANGE.forEach(({note,octave}) => {
        const full = `${note}${octave}`;
        const isB = note.includes('#');
        if (!isB) { bwx += WKW+KEY_GAP; return; }
        const geo = new THREE.BoxGeometry(BKW,BKD,BKH);
        const mat = new THREE.MeshStandardMaterial({color:0x080808,roughness:0.28,metalness:0.75});
        const key = new THREE.Mesh(geo,mat);
        key.position.set(bwx-(WKW/2)-(KEY_GAP/2), BKD, -0.7);
        key.userData = {note:full, originalY:BKD, isBlack:true};
        scene.add(key); state.keyObjects.set(full,key);
    });

    updateKeyLabels();

    if (!scene.getObjectByName('pedalGroup')) {
        const pg = new THREE.Group(); pg.name='pedalGroup';
        const pm = new THREE.MeshStandardMaterial({color:0xbba000,metalness:0.92,roughness:0.08});
        [{type:'footBass'},{type:'soft'},{type:'sustain'}].forEach((p,i) => {
            const ped = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.09,0.7),pm.clone());
            ped.position.set(PIANO_CX-0.65+i*0.65, -0.65, 2);
            ped.userData = {isPedal:true,pedalType:p.type,originalY:-0.65};
            pg.add(ped);
        });
        scene.add(pg);
    }

    if (!scene.getObjectByName('musicStand')) {
        const sg = new THREE.Group(); sg.name='musicStand';
        const backMat = new THREE.MeshStandardMaterial({color:0x050505,roughness:0.3,metalness:0.75});
        // Larger stand for better visibility
        const standBack = new THREE.Mesh(new THREE.BoxGeometry(14, 8.5, 0.2), backMat);
        standBack.position.set(PIANO_CX, 5.5, -3.2); standBack.rotation.x=-0.04;
        sg.add(standBack);

        const pageMat = new THREE.MeshStandardMaterial({color:0xffffff,side:THREE.DoubleSide,roughness:0.95,transparent:true,opacity:0.96});
        const pageGeo = new THREE.PlaneGeometry(5.2, 6.8);

        const lp = new THREE.Mesh(pageGeo, pageMat.clone());
        lp.name='leftPage'; lp.position.set(PIANO_CX-2.8, 5.5, -2.8); lp.rotation.y=0.08;
        sg.add(lp);

        const rp = new THREE.Mesh(pageGeo, pageMat.clone());
        rp.name='rightPage'; rp.position.set(PIANO_CX+2.8, 5.5, -2.8); rp.rotation.y=-0.08;
        sg.add(rp);

        // Create a hinge for the flip page at the spine (PIANO_CX)
        const hinge = new THREE.Object3D();
        hinge.name = 'flipHinge';
        hinge.position.set(PIANO_CX, 5.5, -2.6);
        sg.add(hinge);

        const fp = new THREE.Mesh(pageGeo, pageMat.clone());
        fp.name='flipPage'; 
        // Position relative to hinge (it's the right page, so x is +2.8 from hinge center)
        fp.position.set(2.8, 0, 0); 
        fp.rotation.y = -0.08;
        fp.visible = false;
        hinge.add(fp);

        scene.add(sg);
        state.musicStand = sg;
        const songData = state.playlists[state.currentSongKey]?.data;
        if (state.currentSongKey && songData) updateSheetMusic(songData);
    }
}

export function initVisuals() {
    scene.add(new THREE.AmbientLight(0xfff0e0, 0.35));

    const spot = new THREE.SpotLight(0xfff5e0, 240);
    spot.position.set(PIANO_WIDTH/2, 22, 14);
    spot.castShadow = true; spot.angle = Math.PI/5;
    spot.penumbra = 0.4; spot.decay = 2; spot.distance = 90;
    spot.target.position.set(PIANO_WIDTH/2,0,0);
    scene.add(spot); scene.add(spot.target);

    const warm = new THREE.PointLight(0xd4922a, 80, 50);
    warm.position.set(PIANO_CX, 6, 6);
    scene.add(warm);

    document.getElementById('canvas-container').appendChild(renderer.domElement);
    createPiano();
}

export function animate() {
    requestAnimationFrame(animate);
    
    // PREMIUM CAMERA CURVE: 
    // Keeps the keyboard prominent while allowing the music stand to come into view.
    const targetY = 3.5 + (2.5 * (state.cameraZoom - 0.5));
    const targetZ = 6.5 + (6.0 * (state.cameraZoom - 0.5));
    
    camera.position.y += (targetY - camera.position.y) * 0.08;
    camera.position.z += (targetZ - camera.position.z) * 0.08;
    
    // Look slightly higher as we zoom out to keep everything balanced
    const lookY = 0.5 + (1.2 * (state.cameraZoom - 0.5));
    camera.lookAt(PIANO_CX, lookY, 0);
    
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
