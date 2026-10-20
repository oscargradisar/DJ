import { detectTempo, computeWaveform, overview, mixToMono, beatPhase } from '../src/renderer/analysis.js';
const sr = 44100;
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
function synth({ bpm, offset, seconds, pattern }) {
  const buf = new Float32Array(sr * seconds);
  const beat = 60 / bpm;
  const add = (t, kind) => {
    const i0 = Math.round(t * sr);
    const len = kind === 'kick' ? 0.25 : kind === 'snare' ? 0.18 : 0.05;
    for (let i = 0; i < len * sr && i0 + i < buf.length; i++) {
      const tt = i / sr;
      let s;
      if (kind === 'kick') s = Math.sin(2 * Math.PI * (50 + 100 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 12) * 0.9;
      else if (kind === 'snare') s = rnd() * Math.exp(-tt * 25) * 0.5 + Math.sin(2*Math.PI*190*tt)*Math.exp(-tt*20)*0.3;
      else s = rnd() * Math.exp(-tt * 80) * 0.25;
      buf[i0 + i] += s;
    }
  };
  // pad/bass drone so it's not pure drums
  for (let i = 0; i < buf.length; i++) buf[i] += Math.sin(2*Math.PI*110*i/sr)*0.08 + rnd()*0.01;
  for (let b = 0; offset + b * beat < seconds; b++) {
    const t = offset + b * beat;
    pattern(b, t, beat, add);
  }
  return buf;
}
const house = (b, t, beat, add) => { add(t, 'kick'); add(t + beat / 2, 'hat'); if (b % 2) add(t, 'snare'); };
const hiphop = (b, t, beat, add) => { if (b % 4 === 0 || b % 4 === 2) add(t, 'kick'); if (b%8===2) add(t+beat*0.75,'kick'); if (b % 2) add(t, 'snare'); add(t,'hat'); add(t+beat/2,'hat'); };
const dnb = (b, t, beat, add) => { if (b % 4 === 0) add(t, 'kick'); if (b%4===2) add(t+beat/2,'kick'); if (b % 4 === 1 || b % 4 === 3) add(t, 'snare'); add(t,'hat'); add(t+beat/2,'hat'); };
const cases = [
  { name: 'house 124', bpm: 124, offset: 0.37, pattern: house },
  { name: 'house 128', bpm: 128, offset: 0.05, pattern: house },
  { name: 'tech 122.5', bpm: 122.5, offset: 0.2, pattern: house },
  { name: 'hiphop 92', bpm: 92, offset: 0.61, pattern: hiphop },
  { name: 'dnb 174 (half ok)', bpm: 174, offset: 0.1, pattern: dnb, octaveOk: true },
  { name: 'disco 112', bpm: 112, offset: 0.45, pattern: house },
];
let fails = 0;
for (const c of cases) {
  const mono = synth({ ...c, seconds: 150 });
  const t0 = performance.now();
  const r = detectTempo(mono, sr);
  const ms = performance.now() - t0;
  const period = 60 / c.bpm;
  let offErr = Math.abs(r.offset - c.offset); offErr = Math.min(offErr, period - offErr);
  const octave = [1, 2, 0.5].find((k) => Math.abs(r.bpm * k - c.bpm) < 0.1);
  const p2 = 60 / Math.max(r.bpm, c.bpm); let offErr2 = Math.abs(((r.offset - c.offset) % p2 + p2) % p2); offErr2 = Math.min(offErr2, p2 - offErr2);
  const ok = octave === 1 ? offErr < 0.02 : (octave && c.octaveOk && offErr2 < 0.02);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}: got ${r.bpm} bpm, offset ${r.offset.toFixed(3)} (want ${c.offset}), conf ${r.confidence.toFixed(2)}, ${ms.toFixed(0)}ms`);
}
const mono = mixToMono([new Float32Array(sr*10).fill(0.5), new Float32Array(sr*10).fill(-0.5)]);
const w = computeWaveform(mono, sr); const o = overview(w, 500);
console.log('waveform cols', w.peak.length, 'rate', w.rate.toFixed(1), 'overview', o.peak.length, 'phase', beatPhase(1.0, 120, 0.25).toFixed(2));
process.exit(fails ? 1 : 0);
