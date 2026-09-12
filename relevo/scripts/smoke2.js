/**
 * Segunda prueba de humo: el camino de reintento (interrupcion de OTRO tema) y el relevo
 * de turno con presupuesto agotado.
 *
 *   node scripts/smoke2.js
 */
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8787');
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + 's';
const send = (o) => ws.send(JSON.stringify(o));
const inject = (text, hold = false) => send({ t: 'inject-text', text, userId: 'torre3', hold });

let habla = 0;

ws.on('open', () => {
  send({ t: 'hello', userId: 'smoke2', role: 'board' });
  console.log(`${el()} conectado`);
  setTimeout(() => {
    console.log(`${el()} inyecto peticion: "central, necesito la retro en el sotano 2"`);
    inject('central, necesito la retro en el sotano 2');
  }, 400);
});

ws.on('message', (data, isBinary) => {
  if (isBinary) return;
  const m = JSON.parse(data.toString());

  if (m.t === 'agent-speak') {
    habla++;
    console.log(`${el()} >>> AGENTE (${habla}): "${m.text}"`);

    if (habla === 1) {
      // Interrupcion de OTRO tema: el aviso se perdio, debe reintentar una sola vez.
      setTimeout(() => {
        console.log(`${el()} INTERRUMPO con algo ajeno: "cuidado con el viento en la torre 2"`);
        inject('cuidado con el viento en la torre 2', true);
      }, 500);
    }
  }

  if (m.t === 'agent-stop') console.log(`${el()} <<< detenido: ${m.why}`);

  if (m.t === 'state') {
    const s = m.snapshot;
    const p = s.all.filter((i) => i.type === 'peticion');
    if (p.length) {
      console.log(`${el()} estado: ${p.map((i) => `"${i.subject}"=${i.status}`).join(' | ')}`);
    }
  }
});

ws.on('error', (e) => console.error('ws:', e.message));

// Con dos transmisiones ya gastadas (aviso + reintento), el presupuesto esta en cero.
// El relevo de turno tiene que salir igual, porque lo pidio un humano.
setTimeout(() => {
  console.log(`${el()} --- presupuesto deberia estar agotado ---`);
  console.log(`${el()} inyecto: "relevo, relevo de turno"`);
  inject('relevo, relevo de turno');
}, 42000);

setTimeout(() => {
  console.log(`${el()} fin`);
  ws.close();
  process.exit(0);
}, 58000);
