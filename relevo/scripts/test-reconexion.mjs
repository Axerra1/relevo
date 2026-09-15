/**
 * Prueba la reconexion del adaptador de Zello contra la red real.
 * NO correr con el servidor arriba: Zello no deja el mismo usuario en dos sesiones.
 *
 *   node scripts/test-reconexion.mjs
 *
 * 1. Zello contesta pings? Si no, el latido daria falsas caidas.
 * 2. Caida brusca: el socket se cierra -> debe reconectar.
 * 3. Caida silenciosa: el socket sigue "abierto" pero no llega nada (lo que pasa al cambiar
 *    de red) -> el latido debe detectarla y reconectar.
 */
import { ZelloAdapter } from '../src/adapters/zello.js';

const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + 's';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const origLog = console.log;
console.log = (...a) => origLog(el(), ...a);

let fallas = 0;
const check = (nombre, ok) => {
  origLog(`${el()}   ${ok ? 'OK  ' : 'FALLA'} ${nombre}`);
  if (!ok) fallas++;
};
const esperar = async (cond, ms) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (cond()) return true;
    await dormir(200);
  }
  return cond();
};

const z = new ZelloAdapter();
await z.start();
check('conecta', z.conectado);

// 1 · pong
const pong = await new Promise((resolve) => {
  const t = setTimeout(() => resolve(false), 5000);
  z.ws.once('pong', () => { clearTimeout(t); resolve(true); });
  z.ws.ping();
});
check('Zello contesta pings (el latido no dara falsas caidas)', pong);

// 2 · caida brusca
origLog(`${el()} --- simulo caida brusca`);
z.ws.terminate();
check('detecta la caida', await esperar(() => !z.conectado, 3000));
check('reconecta sola', await esperar(() => z.conectado, 15000));

// 3 · caida silenciosa: el socket queda abierto pero ya no entra nada, ni pong ni mensajes
origLog(`${el()} --- simulo caida silenciosa (cambio de red)`);
const muerto = z.ws;
muerto.removeAllListeners('pong');
muerto.removeAllListeners('message');
check('el latido la detecta y reconecta', await esperar(() => z.conectado && z.ws !== muerto, 45000));
check('el canal no quedo marcado como ocupado', z.floorBusy === false);

origLog(`\n  ${fallas === 0 ? 'TODO OK' : fallas + ' FALLAS'}\n`);
z.deseado = false;
z.ws.terminate();
setTimeout(() => process.exit(fallas ? 1 : 0), 300);
