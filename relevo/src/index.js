import { cfg, assertKey } from './config.js';
import { Bitacora } from './core/state.js';
import { Arbiter } from './core/arbiter.js';
import { transcribe, classify, answersItem, avisoText, handoverBursts } from './core/ai.js';

assertKey();

const { PwaAdapter } = await import('./adapters/pwa.js');
let adapter;
if (cfg.adapter === 'zello') {
  const { ZelloAdapter } = await import('./adapters/zello.js');
  adapter = new ZelloAdapter();
} else {
  adapter = new PwaAdapter();
}

const bitacora = new Bitacora();
const arbiter = new Arbiter(adapter);

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

// ---------------------------------------------------------------- M5: pantalla

const publish = () =>
  adapter.publish?.({ ...bitacora.snapshot(), agent: { muted: arbiter.muted } });

bitacora.on('change', publish);
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
adapter.on('tx-text', async ({ userId, text }) => {
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

  // G1: kill switch por voz. Se evalua ANTES que todo lo demas, porque apagar al agente
  // no puede depender de que el agente clasifique bien.
  if (/relevo[,.\s]+(silencio|callate|apagate|apagado)/i.test(text)) {
    arbiter.mute(userId);
    return;
  }
  if (/relevo[,.\s]+(activo|encendido|despierta|reactivate|prendete)/i.test(text)) {
    arbiter.unmute(userId);
    arbiter.drain();
    return;
  }

  // M8: relevo de turno por comando de voz.
  if (/relevo[,.\s]+(relevo|entrega|cambio)\s+de\s+turno/i.test(text)) {
    arbiter.awaitingVerdict = null;
    await doHandover();
    return;
  }

  // S1: cierre por voz.
  const cierre = text.match(/relevo[,.\s]+(cerrado|cerrar|listo)/i);
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
    await arbiter.announce({ itemId: 'handover', text: 'Relevo de turno. Nada abierto.' });
    return;
  }
  for (const burst of handoverBursts(open)) {
    await arbiter.announce({ itemId: 'handover', text: burst });
    await new Promise((r) => setTimeout(r, cfg.maxBurstMs + 400)); // rafagas separadas
  }
  log(`relevo de turno: ${Math.min(open.length, 3)} de ${open.length} al aire, resto en bitacora`);
}

// ------------------------------------------------------------------- S4: etiqueta

adapter.on('close-item', ({ itemId, by }) => {
  const item = bitacora.close(itemId, { reason: 'supervisor' });
  if (item) log(`${by} cerro a mano: ${item.subject}`);
});

// ------------------------------------------------------------------------ arranque

arbiter.on('suppressed', ({ itemId, reason }) => log(`suprimido (${reason}): ${itemId}`));
arbiter.on('interrupted', ({ spokenMs }) => log(`cortado a los ${spokenMs}ms, esperando veredicto`));

const url = await adapter.start();
log(`Relevo arriba. Adaptador: ${cfg.adapter}`);
if (url) {
  log(`Radio:    ${url}/?user=torre3`);
  log(`Bitacora: ${url}/?board=1`);
}
log(`umbral ${cfg.unansweredMs}ms | rafaga ${cfg.maxBurstMs}ms | ${cfg.maxTxPerHour} tx/hora | ${cfg.maxRetries} reintento`);
