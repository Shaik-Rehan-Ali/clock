# Pulse Clock

A responsive clock suite with automatic location detection on phones and manual location entry on desktops.

## Features

- Live digital + analog clock synced to selected location timezone
- Device-aware location behavior
- Phone: asks for geolocation permission
- Desktop/laptop: manual city/location input by default
- Alarm tab with labels, repeat days, and notifications
- Alarm tab with labels, repeat days, and edit support
- Dedicated tagged Timer tab with On/Off, Edit, and Remove actions
- Stopwatch with lap tracking
- Sleep timer with full 24-hour duration selection (HH:MM style)
- 10 authentic synthesized ringtones: Pulse, Chime, Beacon, Rooster, Beat Plucker, Morning Glory, Apex, Digital Phone, Classic Clock, Alarm 2010
- Custom ringtone upload with app-aware storage (IndexedDB for installed PWA, session storage for browser)
- World clock tab with saved cities
- Developer tab with creator profile details
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
