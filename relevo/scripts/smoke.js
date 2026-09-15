/**
 * Prueba de humo contra el servidor corriendo. Ejercita el ciclo real con la API:
 * transcripcion no (inyecta texto), pero si clasificacion, bitacora, aviso, TTS,
 * interrupcion y veredicto.
 *
 *   node scripts/smoke.js
 */
import WebSocket from 'ws';
import { cfg } from '../src/config.js';
import { cookieLocal } from './lib/sesion-local.mjs';

const ws = new WebSocket(`${cfg.https ? 'wss' : 'ws'}://localhost:${cfg.port}`, {
  rejectUnauthorized: false,
  headers: { Cookie: cookieLocal('prueba de humo') },
});
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + 's';
const send = (o) => ws.send(JSON.stringify(o));
const inject = (text, hold = false) => send({ t: 'inject-text', text, userId: 'torre3', hold });

let lastOpen = -1;

ws.on('open', () => {
  send({ t: 'hello', userId: 'smoke', role: 'board' });
  console.log(`${el()} conectado como bitacora`);
  setTimeout(() => {
    console.log(`${el()} inyecto: "necesito material en el piso 8, me copian"`);
    inject('necesito material en el piso 8, me copian');
  }, 400);
});

ws.on('message', (data, isBinary) => {
  if (isBinary) return;
  const m = JSON.parse(data.toString());

  if (m.t === 'state') {
    const s = m.snapshot;
    if (s.open.length !== lastOpen) {
      lastOpen = s.open.length;
      console.log(`${el()} ESTADO: ${s.open.length} abierto(s), ${s.review.length} en revision, silenciado=${!!s.agent?.muted}`);
      for (const i of s.all.slice(0, 4)) {
        console.log(`        [${i.type}] "${i.subject}" conf=${i.confidence} ${i.status}${i.closedReason ? ' (' + i.closedReason + ')' : ''}`);
      }
    }
  }

  if (m.t === 'agent-speak') {
    console.log(`${el()} >>> EL AGENTE TRANSMITE: "${m.text}"`);
    // Lo interrumpimos con la respuesta al pendiente: debe cerrar y NO repetir.
    setTimeout(() => {
      console.log(`${el()} INTERRUMPO con la respuesta: "ya va subiendo el material al 8"`);
      inject('ya va subiendo el material al 8', true);
    }, 500);
  }

  if (m.t === 'agent-stop') console.log(`${el()} <<< agente detenido: ${m.why}`);
});

ws.on('error', (e) => console.error('error de ws:', e.message));

// Cierre del guion: prueba el kill switch y sale.
setTimeout(() => {
  console.log(`${el()} inyecto: "relevo silencio"`);
  inject('relevo silencio');
}, 45000);

setTimeout(() => {
  console.log(`${el()} fin de la prueba`);
  ws.close();
  process.exit(0);
}, 50000);
