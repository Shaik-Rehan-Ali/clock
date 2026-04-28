# Pulse Clock

A responsive clock suite with automatic location detection on phones and manual location entry on desktops.

## Features

- Live digital + analog clock synced to selected location timezone
- Device-aware location behavior
- Phone: asks for geolocation permission
- Desktop/laptop: manual city/location input by default
- Alarm tab with labels, repeat days, and notifications
- Stopwatch with lap tracking
- Sleep timer with notification + vibration/tone alerts
- World clock tab with saved cities
- Installable PWA support for phone and desktop browsers

## Run Locally

1. Open a terminal in this project folder.
2. Install dependencies:

```bash
npm install
```

3. Start development server:

```bash
npm run dev
```

4. Open the URL shown in terminal (usually `http://localhost:5173`).

## Production Build

```bash
npm run build
```

This outputs production files to `dist/`.

## Preview Production Build Locally

```bash
npm run preview
```

Open the preview URL shown in terminal.

## PWA Install

- On Android Chrome: open the app URL and use `Install app` from browser menu.
- On desktop Chrome/Edge: use the install icon in the address bar.
- On iPhone Safari: open Share menu, then `Add to Home Screen`.

## Notes

- Allow notifications if you want alarm and timer alerts.
- On phones, allow location access for automatic timezone detection.
- On desktop, use Settings tab to set location manually.

## Scripts

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`
