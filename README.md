# Commons DJ

A two-deck DJ app for your own music and Creative Commons tracks, with yt-dlp built in.

## Running it (Windows on ARM)

1. Unzip `CommonsDJ-win-arm64.zip` somewhere you keep apps, such as `Documents\Apps\Commons DJ`.
2. Double-click **Commons DJ.exe**.
3. The app isn't code-signed, so Windows SmartScreen will warn you the first time. Click **More info → Run anyway**.

Your library and downloads live in `%APPDATA%\Commons DJ` (the **Open download folder** button takes you there).

## What it does

- **Two decks** with play/cue, 4 hot cues, beat loops (1/2/4/8), tempo slider (±8/16/50%), nudge, and **SYNC** that matches tempo and beat phase.
- **Automatic BPM and beat grid** detection on first load, with ÷2 / ×2 / TAP / BEAT to fix the grid by hand.
- **Mixer** with trim, 3-band EQ (kills at the bottom), one-knob filter (left = low-pass, right = high-pass), channel faders with meters, a crossfader with Blend or Cut curves, and a limiter on the master.
- **Scrolling waveforms** that stay beat-aligned across both decks, plus an overview you can click to seek.
- **Library** for your own files (drag them into the window or use Add files).
- **Creative Commons search**, which uses YouTube's own Creative Commons filter through yt-dlp. You can also paste a link.
- **License gate**: before anything downloads, the app checks the license. Anything that isn't Creative Commons or public domain is skipped.
- **Credits**: collects attribution lines for every CC track you play, ready to paste into a mix description (CC BY requires credit).

## Keyboard

| Deck A | Deck B | Mixer |
|---|---|---|
| `X` play / pause | `,` play / pause | `←` `→` crossfader |
| `Z` cue | `M` cue | `Shift` + arrows: slam |
| `C` sync | `.` sync | `/` filter library |
| `1`–`4` hot cues | `7`–`0` hot cues | `?` help |
| `Q` / `W` nudge | `O` / `P` nudge | |

Shift + a hot cue key clears it.

## yt-dlp

A copy of the official `yt-dlp_arm64.exe` ships inside the app. The **yt-dlp** chip in the top bar shows its version; click it to update. YouTube changes often, so update yt-dlp first if search or downloads stop working.

YouTube support in yt-dlp needs a JavaScript runtime. Commons DJ provides one by reusing its own built-in Node.js, so there's nothing extra to install. If you already have Deno installed, yt-dlp will use that instead.

## Building from source

Requires Node.js 22+.

```
npm install
npm run fetch-ytdlp     # grabs yt-dlp for this computer, so `npm start` works
npm start               # run in development
npm test                # tempo-detection tests
npm run package:win-arm64
npm run package:win-x64
```

Project layout:

- `src/main.js` handles the window, library storage, and yt-dlp (search, license check, download).
- `src/preload.js` is the bridge between the UI and the main process.
- `src/renderer/engine.js` is the Web Audio engine (decks, EQ, filter, loops, sync, crossfader).
- `src/renderer/analysis.js` holds the waveform and BPM/beat-grid detection.
- `src/renderer/app.js` is the UI.

## Notes and limits

- Tempo changes work like vinyl: pitch moves with speed. Key lock would need a time-stretch engine.
- There's one audio output, so there's no separate headphone cue yet.
- Decoded audio is held in memory, so very long files (hour-long mixes) use a lot of RAM.
- The license check relies on what YouTube reports. Keep an eye on licenses for anything you plan to publish.
