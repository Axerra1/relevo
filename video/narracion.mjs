/**
 * Narracion por escena.
 *   node narracion.mjs                 ElevenLabs (ELEVENLABS_API_KEY en relevo/.env)
 *   node narracion.mjs --openai        respaldo con OpenAI TTS, si ElevenLabs falla
 *
 * Pide PCM a 24 kHz para conocer la duracion exacta sin ffprobe, y guarda WAV.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Los paquetes viven en relevo/node_modules, no junto a este script.
const req = createRequire('D:/Hackaton/relevo/package.json');
req('dotenv').config({ path: 'D:/Hackaton/relevo/.env' });
const { pcmAWav } = await import('file:///D:/Hackaton/relevo/src/core/opus.js');

const OUT = 'D:/Hackaton/video/audio';
fs.mkdirSync(OUT, { recursive: true });
const guion = JSON.parse(fs.readFileSync('D:/Hackaton/video/guion.json', 'utf8'));
const usarOpenAI = process.argv.includes('--openai');
const SR = 24000;

async function elevenVoz(key) {
  if (process.env.ELEVENLABS_VOICE_ID) return { id: process.env.ELEVENLABS_VOICE_ID, name: '(de .env)' };
  // La key puede ser restringida y no tener permiso voices_read, asi que no se lista la
  // libreria: se prueban voces de narracion de la libreria por defecto, en orden, con una
  // sintesis minima, y se usa la primera que responda.
  const candidatas = [
    ['George', 'JBFqnCBsd6RMkjVDRZzb'],
    ['Brian', 'nPczCjzI2devNBz1zQrb'],
    ['Daniel', 'onwK4e9ZLuTAKqWW03F9'],
    ['Roger', 'CwhRBWXzGAHq8TQ4Fs17'],
    ['Adam', 'pNInz6obpgDQGcFmaJgB'],
  ];
  for (const [name, id] of candidatas) {
    try {
      await eleven('Hola.', key, id);
      return { id, name };
    } catch (e) {
      console.log(`  voz ${name} no disponible: ${String(e.message).slice(0, 110)}`);
    }
  }
  return null;
}

async function eleven(texto, key, vozId) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${vozId}?output_format=pcm_24000`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: texto,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.42, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    }),
  });
  if (!r.ok) throw new Error(`ElevenLabs TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return Buffer.from(await r.arrayBuffer());
}

async function openai(texto) {
  const mod = req('openai');
  const OpenAI = mod.default || mod;
  const c = new OpenAI();
  const r = await c.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'ash', // distinta de la del agente (onyx), para que no se confundan
    input: texto,
    instructions: 'Narrador de documental tecnologico. Voz calida, segura, ritmo pausado, con intriga.',
    response_format: 'pcm',
  });
  return Buffer.from(await r.arrayBuffer());
}

let key, voz;
let motor = usarOpenAI ? 'openai' : 'eleven';
if (motor === 'eleven') {
  key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.error('\n  Falta ELEVENLABS_API_KEY en D:\\Hackaton\\relevo\\.env\n');
    process.exit(1);
  }
  voz = await elevenVoz(key);
  if (voz) {
    console.log(`\n  Narrador: ElevenLabs, voz "${voz.name}"\n`);
  } else {
    console.log('\n  Ninguna voz de ElevenLabs respondio con esta key. Uso el respaldo de OpenAI.\n');
    motor = 'openai';
  }
} else {
  console.log('\n  Narrador: OpenAI (respaldo)\n');
}

const tiempos = {};
for (const e of guion.escenas) {
  const pcm = motor === 'openai' ? await openai(e.narracion) : await eleven(e.narracion, key, voz.id);
  const seg = pcm.length / (SR * 2);
  fs.writeFileSync(path.join(OUT, `narr${e.id}.wav`), pcmAWav(pcm, SR));
  tiempos[e.id] = seg;
  console.log(`  narr${e.id}.wav  ${seg.toFixed(2)} s  ${e.nombre}`);
}
fs.writeFileSync(path.join(OUT, 'tiempos.json'), JSON.stringify(tiempos, null, 2));
const total = Object.values(tiempos).reduce((a, b) => a + b, 0);
console.log(`\n  Narracion total: ${total.toFixed(1)} s\n`);
