/**
 * Audios que no dependen de ElevenLabs:
 *  - la voz REAL del agente, con el mismo TTS y la misma voz que usa Relevo en Zello
 *  - el pitido de PTT (roger beep + cola de squelch), sintetizado aqui, sin descargas
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

process.chdir('D:/Hackaton/relevo'); // para que dotenv lea la key de OpenAI
const ai = await import('file:///D:/Hackaton/relevo/src/core/ai.js');
const { pcmAWav, SAMPLE_RATE } = await import('file:///D:/Hackaton/relevo/src/core/opus.js');

const OUT = 'D:/Hackaton/video/audio';
fs.mkdirSync(OUT, { recursive: true });

// 1 · Voz real del agente
const guion = JSON.parse(fs.readFileSync('D:/Hackaton/video/guion.json', 'utf8'));
const escenaAgente = guion.escenas.find((e) => e.voz_agente);
const pcm = await ai.synthesizePcm(escenaAgente.voz_agente);
fs.writeFileSync(path.join(OUT, 'agente.wav'), pcmAWav(pcm, SAMPLE_RATE));
console.log(`agente.wav   ${(pcm.length / (SAMPLE_RATE * 2)).toFixed(2)} s  "${escenaAgente.voz_agente}"`);

// 2 · Pitido de PTT: dos tonos cortos y una cola de ruido que se apaga, como un squelch.
function ptt() {
  const sr = SAMPLE_RATE;
  const partes = [
    { f: 1250, ms: 70, a: 0.32 },
    { f: 0, ms: 18, a: 0 },
    { f: 900, ms: 80, a: 0.30 },
  ];
  const muestras = [];
  let fase = 0;
  for (const p of partes) {
    const n = Math.round((sr * p.ms) / 1000);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / (sr * 0.004), (n - i) / (sr * 0.006)); // sin clicks
      fase += (2 * Math.PI * p.f) / sr;
      muestras.push(Math.sin(fase) * p.a * env);
    }
  }
  // cola de squelch
  const nCola = Math.round(sr * 0.11);
  let s = 12345;
  for (let i = 0; i < nCola; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const ruido = (s / 0x7fffffff) * 2 - 1;
    muestras.push(ruido * 0.10 * Math.pow(1 - i / nCola, 2.2));
  }
  const buf = Buffer.alloc(muestras.length * 2);
  muestras.forEach((v, i) => buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2));
  return buf;
}
const beep = ptt();
fs.writeFileSync(path.join(OUT, 'ptt.wav'), pcmAWav(beep, SAMPLE_RATE));
console.log(`ptt.wav      ${(beep.length / (SAMPLE_RATE * 2)).toFixed(2)} s`);
