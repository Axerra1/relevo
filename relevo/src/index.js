import { cfg, assertKey } from './config.js';
import { Bitacora } from './core/state.js';
import { Arbiter } from './core/arbiter.js';
import { transcribe, classify, answersItem, matchAnswer, avisoText, handoverBursts } from './core/ai.js';

assertKey();

const { PwaAdapter } = await import('./adapters/pwa.js');

/**
 * `adapter` es el canal: de ahi salen tx-start y tx-end, y ahi habla el agente.
 * `board` sirve solo la bitacora en pantalla.
 *
 * Con la PWA son el mismo objeto. Con Zello no: Zello es el canal y no tiene pantalla, asi
 * que se levanta una PWA aparte unicamente para mostrar el estado. Esa PWA no es canal: sus
 * eventos de radio no se escuchan, solo los de bitacora (inyectar, cerrar a mano).
 */
let adapter;
let board;
if (cfg.adapter === 'zello') {
  const { ZelloAdapter } = await import('./adapters/zello.js');
  adapter = new ZelloAdapter();
  board = new PwaAdapter();
} else {
  adapter = new PwaAdapter();
  board = adapter;
}

const bitacora = new Bitacora();
const arbiter = new Arbiter(adapter);

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

// ---------------------------------------------------------------- M5: pantalla

const publish = () => board.publish({ ...bitacora.snapshot(), agent: { muted: arbiter.muted } });

bitacora.on('change', publish);

// Una pantalla que se conecta o se recarga recibe el estado actual de inmediato. Sin esto
// aparecia en blanco hasta el siguiente cambio, aunque la bitacora estuviera llena: al
// recargar parecia que se habia borrado todo.
board.on('hello', ({ role }) => {
  if (role === 'board') publish();
});
arbiter.on('muted', ({ by }) => { log(`SILENCIADO por ${by}`); publish(); });
arbiter.on('unmuted', ({ by }) => { log(`reactivado por ${by}`); publish(); });

// ------------------------------------------------- P1 / M7: el humano manda

adapter.on('tx-start', ({ userId }) => {
  const wasSpeaking = arbiter.state === 'speaking';
  arbiter.onHumanFloorOpen(); // corta el TTS en seco
  if (wasSpeaking) log(`PTT de ${userId} -> agente cortado a mitad`);
});

// ------------------------------------------------------ el ciclo por transmision

adapter.on('tx-end', async ({ userId, audio, mime }) => {
  try {
    const text = await transcribe(audio, mime); // M3
    audio = null; // M9: el audio no sobrevive a esta linea
    await handleTransmission(userId, text);
  } catch (err) {
    log('fallo el ciclo:', err.message);
    arbiter.awaitingVerdict = null;
    arbiter.drain();
  }
});

// Camino de pruebas: inyecta texto sin grabar nada. Sirve para probar el arbitro y la
// maquina de estados antes de tener audio. No es parte del producto.
board.on('tx-text', async ({ userId, text }) => {
  try {
    await handleTransmission(userId, text);
  } catch (err) {
    log('fallo el ciclo (texto):', err.message);
  }
});

adapter.on('floor-free', () => arbiter.drain());

async function handleTransmission(userId, text) {
  if (!text) {
    arbiter.awaitingVerdict = null;
    arbiter.drain();
    return;
  }
  log(`<${userId}> ${text}`);

  // Los comandos de voz se comparan sin tildes. "Relevo" es tambien un verbo, y la
  // transcripcion lo escribe "relevó" con frecuencia: con tildes, "Relevo, relevo de turno"
  // llegaba como "Relevo relevó de turno" y el comando no se detectaba.
  const t = text.normalize('NFD').replace(/\p{M}/gu, '');

  // G1: kill switch por voz. Se evalua ANTES que todo lo demas, porque apagar al agente
  // no puede depender de que el agente clasifique bien.
  if (/relevo[,.\s]+(silencio|callate|apagate|apagado)/i.test(t)) {
    arbiter.mute(userId);
    return;
  }
  if (/relevo[,.\s]+(activo|encendido|despierta|reactivate|prendete)/i.test(t)) {
    arbiter.unmute(userId);
    arbiter.drain();
    return;
  }

  // M8: relevo de turno por comando de voz.
  if (/relevo[,.\s]+(relevo|entrega|cambio)\s+de\s+turno/i.test(t)) {
    arbiter.awaitingVerdict = null;
    await doHandover();
    return;
  }

  // S1: cierre por voz.
  const cierre = t.match(/relevo[,.\s]+(cerrado|cerrar|listo)/i);
  if (cierre) {
    const open = bitacora.openItems();
    if (open.length) {
      bitacora.close(open[0].id, { reason: 'voz' });
      log(`cerrado por voz: ${open[0].subject}`);
    }
    arbiter.awaitingVerdict = null;
    arbiter.drain();
    return;
  }

  const parsed = await classify(text); // M4
  const tx = bitacora.logTransmission({ userId, text, confidence: parsed.confidence });

  // M7b: si esta transmision nos interrumpio, primero hay que saber si nos respondia.
  const pending = arbiter.awaitingVerdict;
  if (pending) {
    const item = bitacora.get(pending.itemId);
    if (item) {
      const verdict = await answersItem(text, item);
      const outcome = arbiter.resolveInterruption(verdict, bitacora);
      log(`interrupcion sobre "${item.subject}" -> ${outcome} (conf ${verdict.confidence}) ${verdict.razon}`);

      // Si la interrupcion era de otro tema, tambien puede ser una transmision valida
      // por si misma. Si nos respondia, ya se cerro y no se ingesta de nuevo.
      if (outcome !== 'cerrado_por_interrupcion') bitacora.ingest(tx, parsed);
      arbiter.drain();
      return;
    }
    arbiter.awaitingVerdict = null;
  }

  // Camino pasivo de cierre: alguien contesto sin que el agente estuviera anunciando nada.
  // Se empareja con el modelo, no por coincidencia de texto, porque con varios pendientes
  // abiertos la coincidencia falla y el relevo de turno termina leyendo cosas ya resueltas.
  //
  // Tambien entran los reportes. "Ya va subiendo el material al 8" atiende una peticion,
  // pero se lee como parte de estado y el clasificador lo etiqueta `reporte`. Si el cierre
  // dependiera de la etiqueta exacta, esa respuesta nunca cerraba nada. La senal real no es
  // la etiqueta: es si la transmision corresponde a un pendiente abierto, y eso lo decide
  // matchAnswer, que es conservador.
  const puedeCerrar = ['respuesta', 'cierre', 'reporte'].includes(parsed.type);
  if (puedeCerrar && parsed.confidence >= cfg.minConfidence) {
    const abiertos = bitacora.openItems().filter((i) => i.type === 'peticion');
    if (abiertos.length) {
      const match = await matchAnswer(text, abiertos);
      if (match.itemId && match.confidence >= cfg.minConfidence) {
        // La razon es "respuesta" aunque el clasificador lo etiquetara reporte: si cerro un
        // pendiente, respondio. "cerrado (reporte)" en la bitacora confundia.
        const cerrado = bitacora.close(match.itemId, { byTxId: tx.id, reason: 'respuesta' });
        log(`  -> cierra "${cerrado.subject}" (conf ${match.confidence}) ${match.razon}`);
        arbiter.drain();
        return;
      }
      if (parsed.type !== 'reporte') {
        log(`  -> respuesta sin pendiente claro (conf ${match.confidence}). No cierra nada`);
      }
    }
    // Una respuesta sin pendiente no se registra como item: no se inventa a que respondia.
    // Un reporte sin pendiente si: sigue abajo y queda en la bitacora como reporte.
    if (parsed.type !== 'reporte') {
      arbiter.drain();
      return;
    }
  }

  const item = bitacora.ingest(tx, parsed);
  if (item) log(`  -> ${item.type} | ${item.subject} | conf ${item.confidence} | ${item.status}`);
  arbiter.drain();
}

// --------------------------------------------------- M6: la peticion que se cae

setInterval(async () => {
  for (const item of bitacora.dueUnanswered()) {
    bitacora.markAnnounced(item.id);
    const outcome = await arbiter.announce({ itemId: item.id, text: avisoText(item) });
    log(`aviso "${item.subject}" -> ${outcome}`);
  }
}, 2000);

// ------------------------------------------------------------ M8: relevo de turno

async function doHandover() {
  const open = bitacora.openItems();
  if (open.length === 0) {
    await arbiter.announce({ itemId: 'handover', text: 'Relevo de turno. Nada abierto.', solicited: true });
    log('relevo de turno: nada abierto');
    return;
  }
  const rafagas = handoverBursts(open);
  for (const burst of rafagas) {
    // solicited: el supervisor lo pidio. No gasta presupuesto de interrupcion.
    await arbiter.announce({ itemId: 'handover', text: burst, solicited: true });
    // Se espera a que la rafaga TERMINE antes de pedir la siguiente. Con un tiempo fijo, una
    // rafaga larga dejaba la siguiente en cola, y con tres pendientes la tercera pisaba a la
    // segunda (la cola tiene un solo lugar): el relevo perdia un item en voz alta.
    await esperarSilencio();
    await new Promise((r) => setTimeout(r, 600));
  }
  log(`relevo de turno: ${rafagas.length} de ${open.length} al aire, resto en bitacora`);
}

/** Resuelve cuando el agente no esta hablando ni tiene nada en cola. */
function esperarSilencio(msTope = 20000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const mirar = () => {
      if ((arbiter.state === 'idle' && !arbiter.queued) || Date.now() - t0 > msTope) return resolve();
      setTimeout(mirar, 150);
    };
    mirar();
  });
}

// ------------------------------------------------------------------- S4: etiqueta

board.on('close-item', ({ itemId, by }) => {
  const item = bitacora.close(itemId, { reason: 'supervisor' });
  if (item) log(`${by} cerro a mano: ${item.subject}`);
});

// ------------------------------------------------------------------------ arranque

// Se muestra el asunto, no el id interno: estos logs se proyectan en el demo.
arbiter.on('suppressed', ({ itemId, reason }) =>
  log(`suprimido (${reason}): ${bitacora.get(itemId)?.subject || itemId}`),
);
arbiter.on('interrupted', ({ spokenMs }) => log(`cortado a los ${spokenMs}ms, esperando veredicto`));

let url;
try {
  url = await adapter.start();
} catch (err) {
  console.error(`\n  No pude abrir el canal (${cfg.adapter}): ${err.message}\n`);
  if (cfg.adapter === 'zello') {
    console.error('  Si dice "socket disconnected before secure TLS connection", la red esta');
    console.error('  bloqueando zellowork.io. Pasa el PC al hotspot del celular y vuelve a arrancar.');
    console.error('  Para seguir sin Zello: CHANNEL_ADAPTER=pwa en .env\n');
  }
  process.exit(1);
}
log(`Relevo arriba. Canal: ${cfg.adapter}`);

if (board === adapter) {
  log(`Radio:    ${url}/?user=torre3`);
  log(`Bitacora: ${url}/?board=1`);
} else {
  // Zello es el canal: la PWA solo sirve la pantalla de la bitacora.
  const boardUrl = await board.start();
  log(`Canal:    Zello, "${cfg.zello.channel}"${cfg.zello.network ? ` en ${cfg.zello.network}` : ''}`);
  log(`Bitacora: ${boardUrl}/?board=1`);
}
log(`umbral ${cfg.unansweredMs}ms | rafaga ${cfg.maxBurstMs}ms | ${cfg.maxTxPerHour} tx/hora | ${cfg.maxRetries} reintento`);
