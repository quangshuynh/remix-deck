# Remix Deck

Load a song you own, apply a remix preset, hear it in real time, export a WAV.

Phase 1 (browser DSP) and Phase 2 (stems, heavy renders, metadata) are both in. The deck
is fully usable with the frontend alone; the backend only adds what the browser cannot do.

```bash
npm install
npm run dev
```

The backend is optional and lives in [`backend/`](backend/README.md). Without it the Stems
panel reports "Backend offline" and everything else works normally.

## Ground rules

Audio only ever comes from the user's own files, by drag and drop or the file picker
(MP3, WAV, M4A, OGG, FLAC). There is no URL field and no stream downloading: Spotify and
Apple streams are DRM protected, and YouTube's terms prohibit it. Files are decoded
locally and never uploaded.

## How it works

Rate changes speed and pitch together, exactly like a turntable pitch fader. That is what
nightcore and slowed edits actually are, so there is no phase vocoder and no independent
time stretching.

Signal chain, built once in `src/audio/graph.ts` and shared by both the live deck and the
offline renderer so an export cannot drift from what was previewed:

```
AudioBufferSourceNode (playbackRate)
  > highpass (body)
  > lowshelf 110 Hz (bass)
  > highshelf 7 kHz (air)
  > lowpass (tone)
  > split: dry gain + ConvolverNode > wet gain
  > sum
  > StereoPannerNode (pan driven by an OscillatorNode * depth, for 8D)
  > DynamicsCompressor (punch)
  > master gain
  > limiter
  > destination (+ analyser taps for the output meters)
```

The highpass is an addition to the original spec. It is what makes Telephone and AM Radio
possible: without it there is no way to remove body, only top.

The limiter is a fixed guard rail rather than a control. Without it, heavy presets such as
Bass Boosted into a wet reverb push past 0 dBFS and the export clips instead of sounding
loud.

Other details worth knowing:

- The reverb impulse is generated procedurally: a stereo noise burst under an exponential
  decay envelope, length set by the Decay control. No impulse files to download.
- Export rebuilds the chain in an `OfflineAudioContext` of
  `(duration / rate) + reverbTail` and encodes 16 bit PCM WAV by hand, then downloads it
  as `Track Name (Preset Name).wav`.
- Live parameter changes use `setTargetAtTime`, so nothing clicks. Decay is the exception:
  it regenerates the impulse buffer, which cannot be ramped, so the wet path is ducked
  across the swap.
- Playback position accumulates `deltaTime * rate` from `AudioContext.currentTime`, which
  keeps the playhead correct when the rate is changed mid playback.
- A short demo loop is generated from scratch (kick, hats, sub bass, pad over Am-F-C-G) so
  the deck is usable before anyone uploads anything.

## Layout

```
src/audio/      the engine, with no React imports so it stays testable
  engine.ts     transport, position tracking, export
  graph.ts      the signal chain, live and offline
  presets.ts    parameter sets and control specs
  reverb.ts     procedural impulse response
  demo.ts       generated demo loop
  peaks.ts      waveform reduction
  wav.ts        16 bit PCM WAV encoder
src/components/ panel UI
```

## Presets

28 of them, grouped by what they change. A preset is only a set of parameter values, and
selecting one moves the visible controls, so it is a starting point rather than a mode.

- **Time** — Original, Sped Up, Nightcore, Slowed, Slowed + Reverb, Chopped and Screwed,
  Daycore, Sped Up + Reverb, Hyperpop
- **Weight** — Trap, Rage, Bass Boosted, Club Mix, Festival Mix, Hardstyle Edit
- **Space** — 8D Audio, Chillstep, Ambient Wash, Stadium, Underwater
- **Texture** — Plugg, Telephone, AM Radio, Lo-fi, Vaporwave, Memphis Phonk, Drift Phonk,
  Witch House

Instrumental and Karaoke are not in this list because they are not presets. They need the
backend, and they live in the Stems panel.

## Not in scope

Cover versions (metal, piano, orchestral, jazz, choir) are new performances, not audio
processing. Remastered, live, demo and clean versions are separate recordings that already
exist. Neither is faked with effects presets.

**Adlibs are in this category too.** Adding adlibs means adding audio that is not in the
track. That needs either a library of someone else's vocal samples or generated vocals;
no filter chain produces a voice that is not already in the file. Trap, Rage and Plugg are
here because they are parameter sets. An adlib preset would not be.

## Still to build

Phase 3: BPM and key detection, preset chains in URL parameters, MP3 export via lamejs,
A/B toggle against the unprocessed source.

## Deploying

`npm run deploy` publishes `dist/` to GitHub Pages. `vite.config.ts` sets the production
base to `/remix-deck/` to match the repository name.
