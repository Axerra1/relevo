/**
 * Ensamblado por pasos, sin grafos gigantes que se traben:
 *   1. cada escena -> su propio clip mp4, con fundido a negro de entrada y salida
 *   2. clips -> un solo video por concatenacion (sin recodificar)
 *   3. audio  -> una sola pista mezclada
 *   4. video + audio -> relevo.mp4
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const req = createRequire('D:/Hackaton/relevo/package.json');
const FF = req('ffmpeg-static');
const V = 'D:/Hackaton/video';
const T = `${V}/tmp`;
fs.mkdirSync(T, { recursive: true });

const guion = JSON.parse(fs.readFileSync(`${V}/guion.json`, 'utf8'));
const tiempos = JSON.parse(fs.readFileSync(`${V}/audio/tiempos.json`, 'utf8'));
const SR = 24000;
const dur = (f) => (fs.statSync(f).size - 44) / (SR * 2);

const FPS = 30, FADE = 0.35, LEAD = 0.55, TAIL = 0.75;
const PTT = dur(`${V}/audio/ptt.wav`);
const AGENTE = dur(`${V}/audio/agente.wav`);

function ff(args, etiqueta) {
  const r = spawnSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`\n  FALLO en ${etiqueta}:\n${r.stderr}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- linea de tiempo
const plan = [];
let inicio = 0;
guion.escenas.forEach((e, i) => {
  const ev = [];
  let t = LEAD;
  if (e.sfx_inicio === 'ptt') { ev.push({ tipo: 'ptt', t }); t += PTT + 0.12; }
  ev.push({ tipo: 'narr', id: e.id, t });
  t += tiempos[e.id];
  if (e.voz_agente) {
    t += 0.55;
    ev.push({ tipo: 'ptt', t }); t += PTT + 0.08;
    ev.push({ tipo: 'agente', t }); t += AGENTE + 0.1;
    ev.push({ tipo: 'ptt', t }); t += PTT;
  }
  const D = t + TAIL + (i === guion.escenas.length - 1 ? 1.4 : 0);
  plan.push({ e, inicio, D, ev });
  inicio += D;
});
const TOTAL = inicio;
console.log(`\n  Duracion: ${TOTAL.toFixed(1)} s${TOTAL > 120 ? '  <-- PASA DE 2 MINUTOS' : ''}\n`);

// ------------------------------------------------------------- 1 · clip por escena
const lista = [];
for (const { e, D } of plan) {
  const out = `${T}/clip${e.id}.mp4`;
  const fin = (D - FADE).toFixed(3);
  ff(['-framerate', String(FPS), '-loop', '1', '-t', D.toFixed(3), '-i', `${V}/frames/s${e.id}.png`,
    '-vf', `scale=1920:1080,format=yuv420p,fade=t=in:st=0:d=${FADE},fade=t=out:st=${fin}:d=${FADE}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-crf', '20', '-r', String(FPS), '-an', out],
    `clip ${e.id}`);
  lista.push(`file '${out}'`);
  console.log(`  clip ${e.id}  ${D.toFixed(1)} s  ${e.nombre}`);
}
fs.writeFileSync(`${T}/lista.txt`, lista.join('\n'));

// ---------------------------------------------------------------- 2 · concatenar
ff(['-f', 'concat', '-safe', '0', '-i', `${T}/lista.txt`, '-c', 'copy', `${T}/video.mp4`], 'concatenacion');
console.log('\n  video concatenado');

// ------------------------------------------------------------------- 3 · audio
const aArgs = [];
const idx = {};
guion.escenas.forEach((e) => { idx[`n${e.id}`] = aArgs.length / 2; aArgs.push('-i', `${V}/audio/narr${e.id}.wav`); });
idx.ag = aArgs.length / 2; aArgs.push('-i', `${V}/audio/agente.wav`);
idx.ptt = aArgs.length / 2; aArgs.push('-i', `${V}/audio/ptt.wav`);

const f = [];
const pistas = [];
const nPtt = plan.reduce((n, p) => n + p.ev.filter((x) => x.tipo === 'ptt').length, 0);
f.push(`[${idx.ptt}:a]asplit=${nPtt}${Array.from({ length: nPtt }, (_, k) => `[p${k}]`).join('')}`);
let k = 0;
for (const { inicio, ev } of plan) {
  for (const x of ev) {
    const ms = Math.round((inicio + x.t) * 1000);
    const l = `a${pistas.length}`;
    if (x.tipo === 'narr') f.push(`[${idx[`n${x.id}`]}:a]aresample=48000,adelay=${ms}|${ms}[${l}]`);
    if (x.tipo === 'agente') f.push(`[${idx.ag}:a]aresample=48000,highpass=f=320,lowpass=f=3300,acrusher=bits=11:mix=0.16,volume=1.25,adelay=${ms}|${ms}[${l}]`);
    if (x.tipo === 'ptt') f.push(`[p${k++}]aresample=48000,highpass=f=300,volume=0.9,adelay=${ms}|${ms}[${l}]`);
    pistas.push(`[${l}]`);
  }
}
f.push(`anoisesrc=color=brown:amplitude=0.05:sample_rate=48000:duration=${TOTAL.toFixed(2)},lowpass=f=260,volume=0.55[bed]`);
pistas.push('[bed]');
f.push(`${pistas.join('')}amix=inputs=${pistas.length}:normalize=0:duration=longest,alimiter=limit=0.93[aout]`);
ff([...aArgs, '-filter_complex', f.join(';'), '-map', '[aout]', '-t', TOTAL.toFixed(3), '-ar', '48000', '-ac', '2', `${T}/audio.wav`], 'mezcla de audio');
console.log('  audio mezclado');

// -------------------------------------------------------------------- 4 · juntar
ff(['-i', `${T}/video.mp4`, '-i', `${T}/audio.wav`, '-map', '0:v', '-map', '1:a',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', `${V}/relevo.mp4`], 'mux final');

const mb = (fs.statSync(`${V}/relevo.mp4`).size / 1048576).toFixed(1);
console.log(`\n  LISTO: ${V}/relevo.mp4  (${mb} MB, ${TOTAL.toFixed(1)} s)\n`);
