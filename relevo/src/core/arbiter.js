import { EventEmitter } from 'node:events';
import { cfg } from '../config.js';

/**
 * Arbitro del canal. Es el modulo que hace tolerable al agente.
 *
 * P1 - El canal es de los humanos:
 *   - no empieza a hablar si alguien tiene el PTT apretado
 *   - corta el TTS en el instante en que un humano aprieta
 *   - nunca mas de cfg.maxBurstMs seguidos
 *   - a lo sumo una transmision encolada
 *
 * P4 - El silencio es el estado por defecto: techo de cfg.maxTxPerHour por hora de canal.
 *
 * M7b - Si lo interrumpen, el agente averigua si la interrupcion RESPONDIA lo que estaba
 *   diciendo. Si si: cierra el item y no repite nunca. Si no: reintenta el mensaje completo
 *   en la siguiente ventana de silencio, una sola vez. Si es ambiguo: no reintenta y deja
 *   el item marcado para revision humana.
 */
export class Arbiter extends EventEmitter {
  constructor(adapter) {
    super();
    this.adapter = adapter;
    this.state = 'idle';

    /** Transmision en curso del agente. */
    this.current = null; // { itemId, text, handle, startedAt }
    /** Una sola transmision puede esperar turno. */
    this.queued = null; // { itemId, text }
    /**
     * M7b: lo que quedo colgando por una interrupcion, esperando el veredicto de si la
     * transmision humana que nos corto respondia esto o no.
     */
    this.awaitingVerdict = null; // { itemId, text, spokenMs }

    this.txTimestamps = [];

    /**
     * G1 - Kill switch. Silenciado, el agente sigue escuchando y sosteniendo la bitacora
     * pero no toma el canal nunca. Es tambien el "modo sordo" que el plan de evaluacion
     * necesita como brazo de control.
     */
    this.muted = false;
  }

  /** G1 - apaga al agente. Corta lo que este sonando y vacia la cola. */
  mute(by = 'canal') {
    if (this.muted) return false;
    this.muted = true;
    this.queued = null;
    this.awaitingVerdict = null;
    if (this.state === 'speaking' && this.current) {
      const cur = this.current;
      cur.cancelled = true;
      if (cur.handle) cur.handle.abort();
      else this.#refundBudget(cur.startedAt);
      this.state = 'idle';
      this.current = null;
    }
    this.emit('muted', { by });
    return true;
  }

  unmute(by = 'canal') {
    if (!this.muted) return false;
    this.muted = false;
    this.emit('unmuted', { by });
    return true;
  }

  // ---------------------------------------------------------------- presupuesto

  budgetLeft(now = Date.now()) {
    const hourAgo = now - 3_600_000;
    this.txTimestamps = this.txTimestamps.filter((t) => t > hourAgo);
    return cfg.maxTxPerHour - this.txTimestamps.length;
  }

  // ------------------------------------------------------------------ el humano

  /**
   * tx-start: un humano acaba de apretar PTT.
   *
   * Cubre las dos ventanas, no solo la obvia:
   *  - el agente ya esta sonando -> corte en seco, a mitad de palabra
   *  - el agente todavia esta sintetizando el audio -> se marca cancelado y nunca suena
   * La segunda dura lo que tarde el TTS y es la que se olvida.
   */
  onHumanFloorOpen() {
    if (this.state !== 'speaking' || !this.current) return;

    const cur = this.current;
    cur.cancelled = true;

    const sounded = cur.handle !== null;
    if (sounded) cur.handle.abort();
    else this.#refundBudget(cur.startedAt); // no ocupo el canal: no gasta presupuesto

    const spokenMs = sounded ? Date.now() - cur.startedAt : 0;
    this.state = 'idle';
    this.current = null;

    // No decidimos nada todavia: hay que oir QUE dijo el humano.
    this.awaitingVerdict = { itemId: cur.itemId, text: cur.text, spokenMs };
    this.emit('interrupted', { itemId: cur.itemId, spokenMs, sounded });
  }

  #refundBudget(ts) {
    const i = this.txTimestamps.lastIndexOf(ts);
    if (i !== -1) this.txTimestamps.splice(i, 1);
  }

  /**
   * M7b, el veredicto. Se llama despues de transcribir y clasificar la transmision
   * que nos interrumpio.
   *
   * @param {{answers: boolean, confidence: number}} verdict
   * @returns {'cerrado_por_interrupcion'|'reintenta'|'sin_reintento_ambiguo'|'sin_reintento_agotado'|'nada'}
   */
  resolveInterruption(verdict, bitacora) {
    const pending = this.awaitingVerdict;
    this.awaitingVerdict = null;
    if (!pending) return 'nada';

    const item = bitacora.get(pending.itemId);
    if (!item || item.status === 'cerrado') return 'nada';

    // Ambiguo: no se adivina y no se insiste (P3 + P4).
    if (verdict.confidence < cfg.minConfidence) {
      bitacora.markNeedsReview(
        pending.itemId,
        'Interrumpido al transmitir; no se pudo determinar si la interrupcion respondia.',
      );
      this.emit('verdict', { itemId: pending.itemId, outcome: 'sin_reintento_ambiguo' });
      return 'sin_reintento_ambiguo';
    }

    // La interrupcion era la respuesta: se cierra y no se repite nunca.
    if (verdict.answers) {
      bitacora.close(pending.itemId, { reason: 'interrupcion' });
      this.emit('verdict', { itemId: pending.itemId, outcome: 'cerrado_por_interrupcion' });
      return 'cerrado_por_interrupcion';
    }

    // La interrupcion era de otro tema: el aviso se perdio. Un solo reintento.
    if (item.attempts > cfg.maxRetries) {
      this.emit('verdict', { itemId: pending.itemId, outcome: 'sin_reintento_agotado' });
      return 'sin_reintento_agotado';
    }

    this.#enqueue({ itemId: pending.itemId, text: pending.text });
    this.emit('verdict', { itemId: pending.itemId, outcome: 'reintenta' });
    return 'reintenta';
  }

  /** tx-end: el canal quedo en silencio. Momento de drenar la cola. */
  onHumanFloorClose() {
    // Si quedo algo esperando veredicto, el drenaje espera: primero hay que entender
    // que dijo el humano. index.js llama a drain() despues de resolveInterruption().
    if (this.awaitingVerdict) return;
    this.drain();
  }

  // ------------------------------------------------------------------ el agente

  /** Pide hablar. Devuelve por que no se hablo, si no se hablo. */
  async announce({ itemId, text }) {
    // G1: silenciado no encola ni pospone. El aviso se pierde, y eso es lo correcto.
    if (this.muted) {
      this.emit('suppressed', { itemId, reason: 'silenciado' });
      return 'silenciado';
    }
    if (this.budgetLeft() <= 0) {
      this.emit('suppressed', { itemId, reason: 'presupuesto' });
      return 'presupuesto';
    }
    if (this.adapter.floorBusy) {
      this.#enqueue({ itemId, text });
      return 'encolado';
    }
    if (this.state === 'speaking') {
      this.#enqueue({ itemId, text });
      return 'encolado';
    }
    return this.#speak({ itemId, text });
  }

  #enqueue(entry) {
    // A lo sumo una. La mas nueva reemplaza: si algo urge, urge lo ultimo.
    if (this.queued) this.emit('suppressed', { itemId: this.queued.itemId, reason: 'cola_llena' });
    this.queued = entry;
  }

  drain() {
    if (this.muted) {
      this.queued = null;
      return;
    }
    if (this.state !== 'idle' || !this.queued || this.adapter.floorBusy) return;
    const next = this.queued;
    this.queued = null;
    this.#speak(next);
  }

  async #speak({ itemId, text }) {
    this.state = 'speaking';
    const startedAt = Date.now();
    this.txTimestamps.push(startedAt);

    // Se reserva el turno ANTES de sintetizar, para que un PTT humano durante el TTS
    // encuentre algo que cancelar. Sin esto el agente habla igual y no se corta.
    const cur = { itemId, text, handle: null, startedAt, cancelled: false };
    this.current = cur;

    let handle;
    try {
      handle = await this.adapter.speak(text, { maxMs: cfg.maxBurstMs });
    } catch (err) {
      if (this.current === cur) {
        this.state = 'idle';
        this.current = null;
      }
      this.emit('error', err);
      return 'error';
    }

    // El humano apreto mientras sintetizabamos: esto no suena nunca.
    if (cur.cancelled) {
      handle.abort();
      return 'cortado_antes_de_sonar';
    }

    cur.handle = handle;
    this.emit('speaking', { itemId, text });

    // P1: tope duro de duracion, por si el audio sintetizado salio mas largo.
    const cap = setTimeout(() => handle.abort(), cfg.maxBurstMs);

    handle.done
      .then(() => {
        clearTimeout(cap);
        // Identidad, no itemId: el relevo de turno reusa el mismo itemId en varias rafagas.
        if (this.current === cur) {
          this.state = 'idle';
          this.current = null;
          this.emit('spoken', { itemId });
        }
        this.drain();
      })
      .catch(() => {
        clearTimeout(cap);
      });

    return 'hablando';
  }
}
