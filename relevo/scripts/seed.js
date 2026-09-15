/**
 * Siembra el turno anterior en la bitacora, para que la pantalla no salga vacia en camara.
 *
 *   npm run seed
 *
 * Siembra en MODO SORDO: apaga a Relevo, carga el historial, espera a que los pendientes
 * viejos venzan su reloj en silencio, y lo reactiva. Asi el turno queda escrito sin que
 * salgan veinte avisos atrasados al aire justo cuando empiezas a grabar.
 *
 * Los pares peticion/respuesta van pegados para que cada respuesta encuentre su pendiente.
 * Lo que queda deliberadamente abierto va al final, y es lo que el relevo de turno va a leer.
 */
import WebSocket from 'ws';
import { cfg } from '../src/config.js';
import { cookieLocal, servidorEnDesarrollo } from './lib/sesion-local.mjs';

// La bitacora ahora pide sesion: el script entra con una sesion de servicio de 15 minutos.
const COOKIE = cookieLocal('siembra');
const enDesarrollo = await servidorEnDesarrollo(COOKIE);
if (enDesarrollo === null) {
  console.error('\n  No pude conectarme al servidor. Arrancalo primero con: npm run dev\n');
  process.exit(1);
}
if (!enDesarrollo) {
  console.error('\n  El servidor no esta en modo desarrollo, asi que no acepta texto inyectado.');
  console.error('  Pon MODO_DESARROLLO=1 en .env y reinicia el servidor. Solo para demos.\n');
  process.exit(1);
}

const PASO_MS = 2600; // la clasificacion tarda ~2s: no la atropelles
const ESPERA_VENCIMIENTO_MS = 26000;

/** El turno anterior. [quien, que dijo] */
const HISTORIAL = [
  ['central', 'Buenos dias, arranca turno, cuadrillas reporten novedades.'],
  ['torre3', 'Torre 3 en la escucha, sin novedad.'],
  ['grua', 'Grua operativa, revision de cables hecha.'],

  ['torre3', 'Central, me falta formaleta para la placa del 7.'],
  ['central', 'Copiado torre 3, almacen despacha formaleta al 7.'],

  ['grua', 'Central, el balde vino con menos acero del pedido.'],
  ['central', 'Copiado grua, lo cuadro con el maestro.'],

  ['torre3', 'HSE, tenemos un andamio sin linea de vida en el 6.'],
  ['central', 'Copiado, HSE sube al 6 y lo corrige ya.'],

  ['central', 'Cuadrillas, el vaciado de la placa arranca a las diez y media.'],
  ['torre3', 'Copiado, diez y media.'],

  ['grua', 'Central, necesito que despejen el patio para bajar carga.'],
  ['central', 'Copiado grua, patio despejado, adelante.'],

  ['torre3', 'Central, el mixer viene con veinte minutos de retraso.'],
  ['central', 'Copiado torre 3, avisamos al residente.'],

  ['grua', 'Pluma parada cinco minutos por relevo de operador.'],

  ['torre3', 'Central, se acabo el figurado de doce en el 7, me copia.'],
  ['central', 'Copiado, mando figurado de doce al 7.'],

  // --- Lo que queda abierto a proposito: es el material del relevo de turno ---
  ['grua', 'Central, hay una filtracion en el sotano 1, junto a la columna C4.'],
  ['torre3', 'Central, el maestro pide que revisen el arnes del de la cuadrilla 2, esta rozado.'],
  ['central', 'Almacen, quedo pendiente confirmar si llego el acero de tres octavos.'],
];

// Sigue el esquema del servidor: con HTTPS=1 hay que ir por wss, y aceptar el
// certificado propio.
const URL_WS = `${cfg.https ? 'wss' : 'ws'}://localhost:${cfg.port}`;
const ws = new WebSocket(URL_WS, { rejectUnauthorized: false, headers: { Cookie: COOKIE } });
const send = (o) => ws.send(JSON.stringify(o));
const inject = (userId, text) => send({ t: 'inject-text', text, userId });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let ultimo = null;
ws.on('message', (data, isBinary) => {
  if (isBinary) return;
  const m = JSON.parse(data.toString());
  if (m.t === 'state') ultimo = m.snapshot;
});

ws.on('error', (e) => {
  console.error(`\n  No pude conectarme: ${e.message}`);
  console.error('  Arranca el servidor primero con: npm run dev\n');
  process.exit(1);
});

ws.on('open', async () => {
  send({ t: 'hello', userId: 'sembrador', role: 'board' });
  await dormir(300);

  console.log('\nSembrando el turno anterior en modo sordo.\n');

  inject('central', 'relevo silencio');
  await dormir(1200);
  console.log('  Relevo silenciado: escucha y registra, no transmite.\n');

  let n = 0;
  for (const [quien, texto] of HISTORIAL) {
    n++;
    console.log(`  ${String(n).padStart(2)}/${HISTORIAL.length}  <${quien}> ${texto}`);
    inject(quien, texto);
    await dormir(PASO_MS);
  }

  console.log(`\n  Esperando ${ESPERA_VENCIMIENTO_MS / 1000}s a que los pendientes viejos venzan en silencio,`);
  console.log('  para que no salgan avisos atrasados cuando empieces a grabar.');
  await dormir(ESPERA_VENCIMIENTO_MS);

  inject('central', 'relevo activo');
  await dormir(1800);

  const abiertos = ultimo?.open?.length ?? '?';
  const revision = ultimo?.review?.length ?? '?';
  const total = ultimo?.all?.length ?? '?';

  console.log('\n  Relevo reactivado.\n');
  console.log(`  Bitacora: ${total} registros, ${abiertos} abiertos, ${revision} en revision.`);
  if (ultimo?.open?.length) {
    console.log('\n  Lo que el relevo de turno va a leer:');
    for (const i of ultimo.open.slice(0, 5)) console.log(`    - ${i.subject}`);
  }
  console.log('\n  listo para grabar\n');

  ws.close();
  process.exit(0);
});
