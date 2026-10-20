// Track analysis: waveform peaks and tempo/beat-grid detection.
// Pure functions over raw sample data so they can be tested outside the app.

/** Mix all channels down to one Float32Array. */
export function mixToMono(channels) {
  const len = channels[0].length;
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(len);
  const scale = 1 / channels.length;
  for (const ch of channels) {
    for (let i = 0; i < len; i++) out[i] += ch[i] * scale;
  }
  return out;
}

/**
 * Waveform data at `rate` columns per second.
 * peak: max absolute amplitude per column (0..1)
 * bass: share of energy below ~200 Hz per column (0..1), used for colouring
 */
export function computeWaveform(mono, sampleRate, rate = 150) {
  const hop = Math.max(1, Math.round(sampleRate / rate));
  const cols = Math.ceil(mono.length / hop);
  const peak = new Float32Array(cols);
  const bass = new Float32Array(cols);
  const a = 1 - Math.exp((-2 * Math.PI * 200) / sampleRate); // one-pole low-pass at 200 Hz
  let lp = 0;
  for (let c = 0; c < cols; c++) {
    const start = c * hop;
    const end = Math.min(start + hop, mono.length);
    let max = 0;
    let eAll = 0;
    let eLow = 0;
    for (let i = start; i < end; i++) {
      const s = mono[i];
      lp += a * (s - lp);
      const abs = s < 0 ? -s : s;
      if (abs > max) max = abs;
      eAll += s * s;
      eLow += lp * lp;
    }
    peak[c] = max > 1 ? 1 : max;
    bass[c] = eAll > 1e-12 ? Math.min(1, eLow / eAll) : 0;
  }
  return { rate: sampleRate / hop, peak, bass };
}

/** Downsample waveform peaks to a fixed number of columns (for the overview). */
export function overview(wave, columns) {
  const out = new Float32Array(columns);
  const outBass = new Float32Array(columns);
  const n = wave.peak.length;
  for (let c = 0; c < columns; c++) {
    const start = Math.floor((c * n) / columns);
    const end = Math.max(start + 1, Math.floor(((c + 1) * n) / columns));
    let max = 0;
    let b = 0;
    for (let i = start; i < end && i < n; i++) {
      if (wave.peak[i] > max) max = wave.peak[i];
      b += wave.bass[i];
    }
    out[c] = max;
    outBass[c] = b / (end - start);
  }
  return { peak: out, bass: outBass };
}

const TARGET_ENV_RATE = 200; // onset envelope frames per second (approx.)

/** Onset-strength envelope: rectified rise in log energy, emphasising low end (kicks). */
export function onsetEnvelope(mono, sampleRate) {
  const hop = Math.round(sampleRate / TARGET_ENV_RATE);
  const ENV_RATE = sampleRate / hop;
  const frames = Math.floor(mono.length / hop);
  const env = new Float32Array(frames);
  const aLow = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  const aHigh = 1 - Math.exp((-2 * Math.PI * 4000) / sampleRate);
  let lp = 0;
  let lpH = 0;
  let prevLow = 0;
  let prevAll = 0;
  for (let f = 0; f < frames; f++) {
    let eLow = 0;
    let eHigh = 0;
    const start = f * hop;
    for (let i = start; i < start + hop; i++) {
      const s = mono[i];
      lp += aLow * (s - lp);
      lpH += aHigh * (s - lpH);
      const h = s - lpH;
      eLow += lp * lp;
      eHigh += h * h;
    }
    const logLow = Math.log1p(1000 * eLow / hop);
    const logHigh = Math.log1p(1000 * eHigh / hop);
    const dLow = logLow - prevLow;
    const dHigh = logHigh - prevAll;
    env[f] = (dLow > 0 ? dLow : 0) * 1.0 + (dHigh > 0 ? dHigh : 0) * 0.5;
    prevLow = logLow;
    prevAll = logHigh;
  }
  // Remove slow trend so loud sections don't dominate.
  const win = Math.round(ENV_RATE); // 1 s moving average
  const out = new Float32Array(frames);
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += env[f];
    if (f >= win) acc -= env[f - win];
    const mean = acc / Math.min(f + 1, win);
    const v = env[f] - mean;
    out[f] = v > 0 ? v : 0;
  }
  return { env: out, rate: ENV_RATE };
}

function sampleEnv(env, pos) {
  const i = Math.floor(pos);
  if (i < 0 || i + 1 >= env.length) return 0;
  const t = pos - i;
  return env[i] * (1 - t) + env[i + 1] * t;
}

function smooth(env, sigma = 2) {
  const radius = Math.ceil(sigma * 3);
  const kernel = [];
  let norm = 0;
  for (let i = -radius; i <= radius; i++) {
    const k = Math.exp((-0.5 * i * i) / (sigma * sigma));
    kernel.push(k);
    norm += k;
  }
  const out = new Float32Array(env.length);
  for (let f = 0; f < env.length; f++) {
    let acc = 0;
    for (let j = -radius; j <= radius; j++) {
      const idx = f + j;
      if (idx >= 0 && idx < env.length) acc += env[idx] * kernel[j + radius];
    }
    out[f] = acc / norm;
  }
  return out;
}

/** Best phase (in frames) and its mean comb score for a given tempo over [from, to). */
function combScore(env, ENV_RATE, bpm, from, to, phaseStep) {
  const period = (60 * ENV_RATE) / bpm;
  let best = -1;
  let bestPhase = 0;
  for (let ph = 0; ph < period; ph += phaseStep) {
    let sum = 0;
    let n = 0;
    for (let p = from + ph; p < to; p += period) {
      sum += sampleEnv(env, p);
      n++;
    }
    const score = n ? sum / n : 0;
    if (score > best) {
      best = score;
      bestPhase = from + ph;
    }
  }
  return { score: best, phase: bestPhase };
}

// Gentle preference for tempos DJs usually work in.
function tempoPrior(bpm, width = 0.55) {
  const x = Math.log2(bpm / 122) / width;
  return Math.exp(-0.5 * x * x);
}

/**
 * Detect tempo and the position of the first beat.
 * Returns { bpm, offset, confidence } where offset is in seconds (first beat at
 * or after 0), or null if the track is too short or has no clear pulse.
 */
export function detectTempo(mono, sampleRate, { minBpm = 70, maxBpm = 180 } = {}) {
  const duration = mono.length / sampleRate;
  if (duration < 8) return null;
  const onset = onsetEnvelope(mono, sampleRate);
  const ENV_RATE = onset.rate;
  const env = smooth(onset.env, 2);

  // Analyse a window that skips most of the intro.
  const startSec = Math.min(30, duration * 0.15);
  const lenSec = Math.min(90, duration - startSec);
  const from = Math.floor(startSec * ENV_RATE);
  const to = Math.floor((startSec + lenSec) * ENV_RATE);

  // 1) Autocorrelation of the onset envelope (insensitive to small tempo errors).
  const maxLag = Math.ceil((60 * ENV_RATE) / minBpm) * 4 + 2;
  const ac = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let f = from; f + lag < to; f++) sum += env[f] * env[f + lag];
    ac[lag] = sum / Math.max(1, to - from - lag);
  }
  const acAt = (x) => {
    const i = Math.floor(x);
    if (i < 1 || i + 1 > maxLag) return 0;
    const t = x - i;
    return ac[i] * (1 - t) + ac[i + 1] * t;
  };

  // 2) Score tempos by how well whole multiples of the beat period line up.
  //    A weak prior picks the metrical level; a stronger one settles octave
  //    (half/double) ambiguity afterwards.
  const raw = (bpm) => {
    const lag = (60 * ENV_RATE) / bpm;
    return acAt(lag) + acAt(2 * lag) + 0.75 * acAt(3 * lag) + acAt(4 * lag);
  };
  let best = null;
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.05) {
    const r = raw(bpm);
    const weighted = r * tempoPrior(bpm, 1.2);
    if (!best || weighted > best.weighted) best = { bpm, weighted, raw: r };
  }
  if (!best || best.raw <= 0) return null;
  for (const factor of [2, 0.5]) {
    const alt = best.bpm * factor;
    if (alt < minBpm || alt > maxBpm) continue;
    const r = raw(alt);
    if (r * tempoPrior(alt, 0.55) > best.raw * tempoPrior(best.bpm, 0.55)) best = { bpm: alt, weighted: 0, raw: r };
  }

  // 3) Refine tempo and find the beat phase with a comb over a longer stretch.
  const fineTo = Math.min(env.length, from + Math.floor(240 * ENV_RATE));
  let fine = { bpm: best.bpm, score: -1, phase: 0 };
  for (let bpm = best.bpm - 0.3; bpm <= best.bpm + 0.3; bpm += 0.01) {
    const r = combScore(env, ENV_RATE, bpm, from, fineTo, 0.5);
    if (r.score > fine.score) fine = { bpm, score: r.score, phase: r.phase };
  }

  // Snap to a whole BPM when very close (most produced music sits on whole BPMs).
  let bpm = fine.bpm;
  const rounded = Math.round(bpm);
  if (Math.abs(bpm - rounded) < 0.06) bpm = rounded;
  else bpm = Math.round(bpm * 100) / 100;

  // Find the beat phase: lock to the double-time grid first (so a half-time
  // reading still lands on real beats), then pick which of its two phases is
  // the stronger beat at the chosen tempo.
  const halfPeriodFrames = (30 * ENV_RATE) / bpm;
  const dbl = combScore(env, ENV_RATE, bpm * 2, from, fineTo, 0.25).phase;
  const scoreAt = (ph) => {
    let sum = 0;
    let n = 0;
    for (let p = ph; p < fineTo; p += 2 * halfPeriodFrames) {
      sum += sampleEnv(env, p);
      n++;
    }
    return n ? sum / n : 0;
  };
  const finalPhase = scoreAt(dbl) >= scoreAt(dbl + halfPeriodFrames) ? dbl : dbl + halfPeriodFrames;
  const period = 60 / bpm;
  let offset = finalPhase / ENV_RATE;
  offset = ((offset % period) + period) % period;

  // Confidence: how far the winning comb stands above the envelope's average.
  let mean = 0;
  for (let f = from; f < to; f++) mean += env[f];
  mean /= Math.max(1, to - from);
  const confidence = mean > 0 ? Math.max(0, Math.min(1, (fine.score / mean - 1) / 3)) : 0;

  return { bpm, offset, confidence };
}

/** Beat phase (0..1) at a given track position. */
export function beatPhase(position, bpm, offset) {
  const period = 60 / bpm;
  const p = (position - offset) / period;
  return p - Math.floor(p);
}
