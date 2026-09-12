/**
 * Prueba del arbitro sin API key y sin audio: valida P1, P4 y M7b, que es la logica
 * mas nueva y la que mas facil se rompe.
 *
 *   node scripts/test-arbiter.js
 */
import { EventEmitter } from 'node:events';
import { Arbiter } from '../src/core/arbiter.js';
import { Bitacora } from '../src/core/state.js';
import { cfg } from '../src/config.js';

class FakeAdapter extends EventEmitter {
  constructor(ttsDelayMs = 0) {
    super();
    this.holder = null; this.spoken = []; this.aborted = []; this.ttsDelayMs = ttsDelayMs;
  }
  get floorBusy() { return this.holder !== null; }
  async speak(text) {
    // Simula el tiempo que tarda el TTS. En esa ventana el agente aun no suena.
    if (this.ttsDelayMs) await new Promise((r) => setTimeout(r, this.ttsDelayMs));
    this.spoken.push(text);
    let settle;
    const done = new Promise((r) => (settle = r));
    const h = {
      abort: () => { this.aborted.push(text); settle('cortado'); },
      done,
      finish: () => settle('fin'),
    };
    this.last = h;
    return h;
  }
  publish() {}
}

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

function fresh() {
  const a = new FakeAdapter();
  const b = new Bitacora();
  const ar = new Arbiter(a);
  const tx = b.logTransmission({ userId: 'torre3', text: 'suban material al piso 8', confidence: 0.9 });
  const item = b.ingest(tx, { type: 'peticion', to: 'central', subject: 'material al piso 8', confidence: 0.9 });
  return { a, b, ar, item };
}

console.log('\nP1 - no transmite si el canal esta tomado');
{
  const { a, ar, item } = fresh();
  a.holder = 'central';
  const out = await ar.announce({ itemId: item.id, text: 'Pendiente.' });
  check('se encola en vez de hablar', out === 'encolado', `-> ${out}`);
  check('no hablo nada', a.spoken.length === 0);
  a.holder = null;
  ar.drain();
  check('drena al quedar libre', a.spoken.length === 1);
}

console.log('\nP1 - corte en seco al apretar PTT');
{
  const { a, ar, item } = fresh();
  await ar.announce({ itemId: item.id, text: 'Pendiente. Material al piso 8.' });
  check('esta hablando', ar.state === 'speaking');
  ar.onHumanFloorOpen();
  check('se corto', a.aborted.length === 1);
  check('quedo idle', ar.state === 'idle');
  check('espera veredicto', ar.awaitingVerdict?.itemId === item.id);
}

console.log('\nM7b - la interrupcion respondia: cierra y no repite');
{
  const { a, b, ar, item } = fresh();
  await ar.announce({ itemId: item.id, text: 'Pendiente.' });
  ar.onHumanFloorOpen();
  const outcome = ar.resolveInterruption({ answers: true, confidence: 0.95 }, b);
  check('veredicto correcto', outcome === 'cerrado_por_interrupcion', `-> ${outcome}`);
  check('item cerrado', b.get(item.id).status === 'cerrado');
  check('razon registrada', b.get(item.id).closedReason === 'interrupcion');
  ar.drain();
  check('NO repitio', a.spoken.length === 1, `hablo ${a.spoken.length} veces`);
}

console.log('\nM7b - la interrupcion era de otro tema: reintenta una sola vez');
{
  const { a, b, ar, item } = fresh();
  await ar.announce({ itemId: item.id, text: 'Pendiente. Material al piso 8.' });
  b.markAnnounced(item.id);
  ar.onHumanFloorOpen();
  const outcome = ar.resolveInterruption({ answers: false, confidence: 0.9 }, b);
  check('veredicto correcto', outcome === 'reintenta', `-> ${outcome}`);
  check('item sigue abierto', b.get(item.id).status === 'abierto');
  ar.drain();
  await new Promise((r) => setImmediate(r)); // deja que el TTS "termine" de sintetizar
  check('repitio el mensaje completo', a.spoken.length === 2 && a.spoken[1] === a.spoken[0],
    `-> ${JSON.stringify(a.spoken)}`);

  // Segunda interrupcion ajena: ya no hay mas reintentos.
  b.markAnnounced(item.id);
  ar.onHumanFloorOpen();
  const second = ar.resolveInterruption({ answers: false, confidence: 0.9 }, b);
  check('no hay segundo reintento', second === 'sin_reintento_agotado', `-> ${second}`);
  ar.drain();
  check('siguen siendo 2 transmisiones', a.spoken.length === 2, `-> ${a.spoken.length}`);
}

console.log('\nM7b + P3 - veredicto ambiguo: no reintenta y va a revision humana');
{
  const { a, b, ar, item } = fresh();
  await ar.announce({ itemId: item.id, text: 'Pendiente.' });
  ar.onHumanFloorOpen();
  const outcome = ar.resolveInterruption({ answers: false, confidence: 0.2 }, b);
  check('veredicto correcto', outcome === 'sin_reintento_ambiguo', `-> ${outcome}`);
  check('marcado para revision', b.get(item.id).status === 'requiere_revision');
  ar.drain();
  check('no repitio', a.spoken.length === 1);
}

console.log('\nP1 - PTT humano DURANTE la sintesis del TTS: no debe sonar nunca');
{
  const a = new FakeAdapter(60); // el TTS tarda 60ms
  const b = new Bitacora();
  const ar = new Arbiter(a);
  const tx = b.logTransmission({ userId: 'torre3', text: 'suban material', confidence: 0.9 });
  const item = b.ingest(tx, { type: 'peticion', to: 'central', subject: 'material al 8', confidence: 0.9 });

  const p = ar.announce({ itemId: item.id, text: 'Pendiente.' });
  check('reservo el turno antes de sintetizar', ar.current?.itemId === item.id);
  ar.onHumanFloorOpen(); // el humano aprieta mientras el TTS todavia trabaja
  check('espera veredicto igual', ar.awaitingVerdict?.itemId === item.id);
  check('reporta que no sono', ar.awaitingVerdict?.spokenMs === 0);
  const out = await p;
  check('el agente nunca emitio', out === 'cortado_antes_de_sonar', `-> ${out}`);
  check('devolvio el presupuesto', ar.budgetLeft() === cfg.maxTxPerHour, `-> ${ar.budgetLeft()}`);
}

console.log('\nP4 - presupuesto de transmisiones por hora');
{
  const { a, b, ar } = fresh();
  const mk = (n) => {
    const tx = b.logTransmission({ userId: 'u', text: `p${n}`, confidence: 0.9 });
    return b.ingest(tx, { type: 'peticion', to: 'x', subject: `asunto ${n}`, confidence: 0.9 });
  };
  for (let n = 0; n < cfg.maxTxPerHour; n++) {
    const it = mk(n);
    await ar.announce({ itemId: it.id, text: `Pendiente ${n}.` });
    a.last.finish();
    await new Promise((r) => setImmediate(r));
  }
  const extra = mk(99);
  const out = await ar.announce({ itemId: extra.id, text: 'Pendiente 99.' });
  check(`se agota en ${cfg.maxTxPerHour}/hora`, out === 'presupuesto', `-> ${out}`);
  check('no hablo la extra', a.spoken.length === cfg.maxTxPerHour, `-> ${a.spoken.length}`);

  // Lo solicitado pasa por encima del presupuesto: el relevo de turno que pidio el
  // supervisor no puede quedar suprimido por avisos previos.
  const sol = await ar.announce({ itemId: 'handover', text: 'Abierto 1.', solicited: true });
  check('el relevo de turno pasa con presupuesto agotado', sol === 'hablando', `-> ${sol}`);
  a.last.finish();
  await new Promise((r) => setImmediate(r));
  check('y no gasta presupuesto', ar.budgetLeft() === 0, `-> ${ar.budgetLeft()}`);

  // Pero si lo apagaron, ni lo solicitado suena.
  ar.mute('supervisor');
  const sol2 = await ar.announce({ itemId: 'handover', text: 'Abierto 2.', solicited: true });
  check('silenciado gana sobre solicitado', sol2 === 'silenciado', `-> ${sol2}`);
}

console.log('\nG1 - kill switch: silenciado no toma el canal, y corta lo que este sonando');
{
  const { a, b, ar, item } = fresh();
  await ar.announce({ itemId: item.id, text: 'Pendiente.' });
  await new Promise((r) => setImmediate(r));
  check('estaba hablando', ar.state === 'speaking');

  ar.mute('supervisor');
  check('quedo silenciado', ar.muted === true);
  check('corto la transmision en curso', a.aborted.length === 1);
  check('no quedo esperando veredicto', ar.awaitingVerdict === null);

  const tx2 = b.logTransmission({ userId: 'x', text: 'otra cosa', confidence: 0.9 });
  const it2 = b.ingest(tx2, { type: 'peticion', to: 'y', subject: 'otra cosa', confidence: 0.9 });
  const out = await ar.announce({ itemId: it2.id, text: 'Pendiente 2.' });
  check('no transmite silenciado', out === 'silenciado', `-> ${out}`);
  check('no encolo nada', ar.queued === null);
  ar.drain();
  check('drain no despierta al agente', a.spoken.length === 1, `-> ${a.spoken.length}`);

  check('la bitacora sigue viva', b.openItems().length === 2, `-> ${b.openItems().length}`);

  ar.unmute('supervisor');
  check('reactivado', ar.muted === false);
  const out2 = await ar.announce({ itemId: it2.id, text: 'Pendiente 2.' });
  check('vuelve a transmitir', out2 === 'hablando', `-> ${out2}`);
}

console.log('\nP3 - confianza baja no crea pendiente, crea revision humana');
{
  const b = new Bitacora();
  const tx = b.logTransmission({ userId: 'grua', text: 'ksh ksh material ksh', confidence: 0.2 });
  const item = b.ingest(tx, { type: 'peticion', subject: 'algo de material', confidence: 0.2 });
  check('no quedo como peticion abierta', item.status === 'requiere_revision', `-> ${item.status}`);
  check('no entra a dueUnanswered', b.dueUnanswered(Date.now() + 999999).length === 0);
  check('cita la frase original', item.sourceText === 'ksh ksh material ksh');
}

console.log(`\n${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
