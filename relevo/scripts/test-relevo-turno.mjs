/**
 * Verifica que el relevo de turno transmita TODOS los pendientes (hasta 3), sin que una
 * rafaga pise a otra en la cola. Corre contra una instancia aparte con canal propio.
 *
 *   PORT=8790 CHANNEL_ADAPTER=pwa node src/index.js    (en otra terminal)
 *   node scripts/test-relevo-turno.mjs 8790
 */
import WebSocket from 'ws';

const puerto = process.argv[2] || '8790';
const ws = new WebSocket(`wss://localhost:${puerto}`, { rejectUnauthorized: false });
const send = (o) => ws.send(JSON.stringify(o));
const di = (text) => send({ t: 'inject-text', text, userId: 'torre3' });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + 's';

const rafagas = [];
ws.on('message', (d, bin) => {
  if (bin) return;
  const m = JSON.parse(d.toString());
  if (m.t === 'agent-speak') {
    console.log(`${el()} >>> ${m.text}`);
    if (m.text.startsWith('Abierto')) rafagas.push(m.text);
  }
});

ws.on('open', async () => {
  send({ t: 'hello', userId: 'test', role: 'board' });
  await dormir(300);
  di('relevo silencio');
  await dormir(800);
  for (const p of [
    'Central, necesito la bomba de achique en el sotano 1.',
    'Central, falta el mixer en la torre 3.',
    'Central, hay que revisar el arnes de la cuadrilla 2, esta rozado.',
  ]) {
    di(p);
    console.log(`${el()} peticion: ${p}`);
    await dormir(3000);
  }
  console.log(`${el()} esperando a que venzan en silencio...`);
  await dormir(15000);
  di('relevo activo');
  await dormir(800);
  console.log(`${el()} pido: relevo, relevo de turno`);
  di('relevo, relevo de turno');
  await dormir(30000);
  console.log(`\n  rafagas del relevo: ${rafagas.length} de 3 ${rafagas.length === 3 ? 'OK' : 'FALLO'}\n`);
  process.exit(rafagas.length === 3 ? 0 : 1);
});
ws.on('error', (e) => { console.error('ws:', e.message); process.exit(1); });
