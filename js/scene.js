import * as THREE from 'https://esm.sh/three@0.160.0';

export function initScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b0e);
    scene.fog = new THREE.Fog(0x0a0b0e, 30, 80);
    return scene;
}

export function initCamera(PIANO_CX) {
    const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(PIANO_CX, 8.5, 12.0);
    camera.lookAt(PIANO_CX, 2.5, -3.0);
    return camera;
}

export function initRenderer() {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    return renderer;
}

export function initLights(scene, PIANO_WIDTH, PIANO_CX) {
    scene.add(new THREE.AmbientLight(0xfff0e0, 0.45)); // Increased ambient slightly

    const spot = new THREE.SpotLight(0xfff5e0, 120);
    spot.position.set(PIANO_WIDTH / 2, 22, 14);
    spot.castShadow = true;
    spot.angle = Math.PI / 5;
    spot.penumbra = 0.4;
    spot.decay = 2;
    spot.distance = 90;
    spot.target.position.set(PIANO_WIDTH / 2, 0, 0);
    scene.add(spot);
    scene.add(spot.target);

    const warm = new THREE.PointLight(0xd4922a, 30, 40);
    warm.position.set(PIANO_CX, 4, 4);
    scene.add(warm);

    // DEDICATED LIGHT FOR MUSIC STAND
    const standLight = new THREE.PointLight(0xffffff, 25, 15);
    standLight.position.set(PIANO_CX, 8, -1.0);
    scene.add(standLight);

    return { spot, warm, standLight };
}
