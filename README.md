# Aether Studio

Classical piano app with 3D visuals, a MIDI vault of 7000+ works, sheet music engraving, and Corsair RGB keyboard lighting.

## Two modes — one repo

| Mode | What you need | What works |
|---|---|---|
| **Hosted** | Nothing — just visit the GitHub Pages URL | Piano app, browse vault, sheet music playback for existing MIDIs |
| **Local agent** | Run `server.js` once | Everything above + harvest new MIDIs, RGB keyboard LEDs |

**Hosted URL:** `https://Santaslileper.github.io/aether-studio/`  
**Vault URL:** `https://Santaslileper.github.io/aether-studio/vault/`

---

## Quick install (local agent, Windows)

Paste into PowerShell:

```powershell
irm https://raw.githubusercontent.com/Santaslileper/aether-studio/main/install.ps1 | iex
```

This installs Node.js deps + Playwright Chromium and creates a desktop shortcut.  
After install, double-click **Aether Studio** on your desktop — or run:

```bash
node server.js
```

Server starts at `http://localhost:3000`.  
Piano → `http://localhost:3000/`  
Vault → `http://localhost:3000/vault/`

---

## Repo layout

```
/
├── index.html              Piano app (GitHub Pages root)
├── server.js               Unified local server (RGB + harvesting, port 3000)
├── package.json
├── install.ps1             Windows one-click installer
│
├── js/                     Piano source (ES modules)
│   ├── main.js             Entry point
│   ├── audio.js            Tone.js instrument loading
│   ├── piano.js            Playback engine
│   ├── ui.js               UI handlers + library modal
│   ├── visuals.js          Three.js 3D scene
│   ├── notation.js         VexFlow sheet music
│   ├── input.js            Keyboard + MIDI input
│   ├── scene.js            Camera / renderer setup
│   ├── state.js            Shared app state
│   ├── constants.js        Instrument definitions
│   └── utils.js            Helpers
│
├── vault/                  Classical Vault app
│   ├── index.html          Vault UI (GitHub Pages /vault/)
│   ├── js/index.js         Vault logic (590 lines)
│   ├── css/index.css       Vault styles
│   └── kmuse_bridge.html   Sheet music + playback iframe
│
├── assets/                 Static assets (CSS, bundled JS, MIDI bundles)
│   ├── index-Bz3rgqT0.css  Main stylesheet
│   ├── library.css         Library modal styles
│   ├── songs_manifest.json Bundled MIDI list (loaded by piano app)
│   └── *.js                Bundled MIDI data files
│
├── midis/                  Downloaded MIDI files (flat, single location)
├── data/
│   └── all_compositions.json  Master library (7000+ works)
│
└── agent-node/
    └── lib/
        ├── harvester.js    Playwright MIDI scraper
        ├── vault.js        Library merge logic
        └── utils.js        MIDI helpers
```

---

## How hosted vs local works

The vault at startup pings `http://localhost:3000/api/status`.

- **Agent alive** → full mode: harvest buttons unlocked, MIDIs served locally, RGB active
- **Agent offline** → hosted mode: loads `data/all_compositions.json` from GitHub Pages, sheet music plays from `/midis/`, harvest disabled

This means the vault **always works** from GitHub Pages for browsing and listening. You only need the local agent to fetch new MIDIs or light up your keyboard.

---

## Adding MIDIs to the hosted vault

1. Run the local agent and harvest MIDIs into `/midis/`
2. Commit and push `/midis/` + updated `data/all_compositions.json`
3. GitHub Pages picks them up — anyone visiting the hosted vault can now play them

---

## RGB Keyboard (Corsair iCUE)

Requires `cue-sdk` (optional dependency). Install iCUE, then:

```bash
npm install cue-sdk
node server.js
```

Piano keys light up as notes play. Effect controls in the piano settings panel.
