# Corsair RGB Controller

A local web server to control Corsair lighting via the iCUE SDK.

## Requirements

- **Corsair iCUE** installed and running
- **SDK mode enabled** in iCUE → Settings → SDK → Enable SDK
- Node.js 18+

## Setup

```bash
npm install
node server.js
```

Then open **http://localhost:3000** in your browser.

## Features

| Feature | Details |
|---|---|
| Custom color | RGB sliders to set all LEDs at once |
| Quick swatches | One-click preset colors |
| Effects | Rainbow, Pulse, Wave, Off |
| Activity log | Real-time feedback in the UI |
| REST API | `/api/color`, `/api/leds`, `/api/effect`, `/api/status` |
| Socket.IO | Real-time `set_color` / `set_all_colors` events |

## REST API

### `GET /api/status`
Returns SDK status and connected device list.

### `POST /api/color`
Set all LEDs to a single color.
```json
{ "r": 0, "g": 212, "b": 255 }
```

### `POST /api/leds`
Set individual LEDs by ID.
```json
[{ "ledId": 1, "r": 255, "g": 0, "b": 0 }, ...]
```

### `POST /api/effect`
Run a built-in animated effect.
```json
{ "effect": "rainbow" }   // rainbow | pulse | wave | off
```
