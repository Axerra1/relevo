/**
 * Ensambla el video: escenas + narracion + voz real del agente + pitidos + fondo.
 *   node armar.mjs
 * Requiere: frames/s1..s9.png, audio/narr1..9.wav, audio/agente.wav, audio/ptt.wav,
 * audio/tiempos.json (lo genera narracion.mjs), y ffmpeg-static instalado en relevo/.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire('D:/Hackaton/relevo/package.json');
const FFMPEG = require('ffmpeg-static');

const V = 'D:/Hackaton/video';
const guion = JSON.parse(fs.readFileSync(`${V}/guion.json`, 'utf8'));
const tiempos = JSON.parse(fs.readFileSync(`${V}/audio/tiempos.json`, 'utf8'));
const SR = 24000;
const dur = (f) => (fs.statSync(f).size - 44) / (SR * 2);

const FPS = 30;
const XF = 0.6; // crossfade
const LEAD = 0.45; // aire antes de hablar
const TAIL = 0.7; // aire despues de hablar
const PTT = dur(`${V}/audio/ptt.wav`);
const AGENTE = dur(`${V}/audio/agente.wav`);

// --------------------------------------------------------------- linea de tiempo
const escenas = guion.escenas;
const plan = [];
let inicio = 0;
escenas.forEach((e, i) => {
  const xfIn = i === 0 ? 0 : XF;
  const narr = tiempos[e.id];
  let contenido = narr;
  const eventos = [];
  let t = xfIn + LEAD;

  if (e.sfx_inicio === 'ptt') {
    eventos.push({ tipo: 'ptt', t });
    t += PTT + 0.12;
  }
  eventos.push({ tipo: 'narr', id: e.id, t });
  t += narr;

  if (e.voz_agente) {
    t += 0.55;
    eventos.push({ tipo: 'ptt', t });
    t += PTT + 0.08;
    eventos.push({ tipo: 'agente', t });
    t += AGENTE + 0.1;
    eventos.push({ tipo: 'ptt', t });
    t += PTT;
  }
  const ultimo = i === escenas.length - 1;
  const D = t + TAIL + (ultimo ? 1.6 : XF);
  plan.push({ e, inicio, D, eventos });
  inicio += D - XF;
});
const TOTAL = plan[plan.length - 1].inicio + plan[plan.length - 1].D;

// ------------------------------------------------------------------ ffmpeg args
const args = ['-y', '-hide_banner', '-loglevel', 'error', '-stats'];
plan.forEach(({ e, D }) => {
  args.push('-framerate', String(FPS), '-loop', '1', '-t', D.toFixed(3), '-i', `${V}/frames/s${e.id}.png`);
});
const iNarr = plan.length;
escenas.forEach((e) => args.push('-i', `${V}/audio/narr${e.id}.wav`));
const iAgente = iNarr + escenas.length;
args.push('-i', `${V}/audio/agente.wav`);
const iPtt = iAgente + 1;
args.push('-i', `${V}/audio/ptt.wav`);

const f = [];

// Video: escenas fijas. El zoom suave con zoompan tardaba horas en este equipo (un solo
// hilo sobre imagenes escaladas); a 30 minutos del cierre no hay margen para eso. El
// movimiento lo dan las transiciones y el audio.
plan.forEach((_, i) => {
  f.push(`[${i}:v]scale=1920:1080,setsar=1,fps=${FPS},format=yuv420p[v${i}]`);
});
// Transiciones: fundido normal, y fundido a negro en los golpes (red real y cierre).
let prev = 'v0';
for (let i = 1; i < plan.length; i++) {
  const nombre = plan[i].e.nombre;
  const trans = nombre === 'red-real' || nombre === 'final' ? 'fadeblack' : 'fade';
  const out = i === plan.length - 1 ? 'vout' : `x${i}`;
  f.push(`[${prev}][v${i}]xfade=transition=${trans}:duration=${XF}:offset=${plan[i].inicio.toFixed(3)}[${out}]`);
  prev = out;
}

// Audio
const pistas = [];
const nPtt = plan.reduce((n, p) => n + p.eventos.filter((x) => x.tipo === 'ptt').length, 0);
f.push(`[${iPtt}:a]asplit=${nPtt}${Array.from({ length: nPtt }, (_, k) => `[p${k}]`).join('')}`);
let kPtt = 0;
plan.forEach(({ inicio, eventos }) => {
  for (const ev of eventos) {
    const ms = Math.round((inicio + ev.t) * 1000);
    const lbl = `a${pistas.length}`;
    if (ev.tipo === 'narr') {
      f.push(`[${iNarr + escenas.findIndex((x) => x.id === ev.id)}:a]aresample=48000,volume=1.0,adelay=${ms}|${ms}[${lbl}]`);
    } else if (ev.tipo === 'agente') {
      // Filtro de radio: banda de voz de una radio real y un grano digital leve.
      f.push(
        `[${iAgente}:a]aresample=48000,highpass=f=320,lowpass=f=3300,acrusher=bits=11:mix=0.16,volume=1.25,adelay=${ms}|${ms}[${lbl}]`,
      );
    } else if (ev.tipo === 'ptt') {
      f.push(`[p${kPtt++}]aresample=48000,highpass=f=300,volume=0.9,adelay=${ms}|${ms}[${lbl}]`);
    }
    pistas.push(`[${lbl}]`);
  }
});
// Fondo: ruido marron muy bajo y filtrado, textura de cuarto de radio.
f.push(`anoisesrc=color=brown:amplitude=0.05:sample_rate=48000:duration=${TOTAL.toFixed(2)},lowpass=f=260,volume=0.55[bed]`);
pistas.push('[bed]');
f.push(`${pistas.join('')}amix=inputs=${pistas.length}:normalize=0:duration=longest,alimiter=limit=0.93,apad,atrim=0:${TOTAL.toFixed(3)}[aout]`);

args.push(
  '-filter_complex', f.join(';'),
  '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
  `${V}/relevo.mp4`,
);

console.log(`\n  Duracion calculada: ${TOTAL.toFixed(1)} s ${TOTAL > 120 ? '  <-- PASA DE 2 MINUTOS' : ''}`);
plan.forEach(({ e, inicio, D }) => console.log(`   ${String(e.id).padStart(2)} ${e.nombre.padEnd(16)} ${inicio.toFixed(1).padStart(6)}s  +${D.toFixed(1)}s`));
console.log('\n  Renderizando...\n');

const r = spawnSync(FFMPEG, args, { stdio: 'inherit' });
if (r.status !== 0) {
  console.error(`\n  ffmpeg termino con codigo ${r.status}\n`);
  process.exit(r.status || 1);
}
const mb = (fs.statSync(`${V}/relevo.mp4`).size / 1048576).toFixed(1);
console.log(`\n  Listo: ${V}/relevo.mp4  (${mb} MB)\n`);
