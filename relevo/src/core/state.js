import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { cfg } from '../config.js';

/**
 * Bitacora. Es la memoria que el canal no tiene.
 *
 * Invariante P3 (no afirmar lo que no se puede citar): todo item guarda `sourceText`,
 * la frase literal de la que salio, y su `confidence`. Nada se transmite sin poder citarse.
 *
 * Invariante P2 / M9: aca nunca entra audio. Solo texto, y `from` es el id que la red
 * PTT ya entrega. No hay huella vocal en ninguna parte del sistema.
 */
export class Bitacora extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, Item>} */
    this.items = new Map();
    this.transmissions = [];
  }

  /** Registra la transmision cruda (solo texto) para poder citarla despues. */
  logTransmission({ userId, text, confidence, ts }) {
    const tx = { id: randomUUID(), userId, text, confidence, ts: ts || Date.now() };
    this.transmissions.push(tx);
    this.emit('change');
    return tx;
  }

  /**
   * Ingesta una transmision ya clasificada (M4).
   * Devuelve el item creado, o null si la transmision no genera item.
   */
  ingest(tx, parsed) {
    // P3: por debajo del umbral no se adivina. Se marca y se deja para revision humana.
    if (parsed.confidence < cfg.minConfidence) {
      return this.#add({
        type: 'no_entendido',
        status: 'requiere_revision',
        from: tx.userId,
        to: null,
        subject: parsed.subject || '(audio no entendido)',
        sourceText: tx.text,
        sourceTxId: tx.id,
        confidence: parsed.confidence,
      });
    }

    if (parsed.type === 'respuesta' || parsed.type === 'cierre') {
      const target = this.#findOpenMatch(parsed);
      if (target) {
        this.close(target.id, { byTxId: tx.id, reason: parsed.type });
        return target;
      }
      // Respuesta sin peticion conocida: se registra, no se inventa a que respondia.
      return null;
    }

    if (parsed.type === 'peticion') {
      return this.#add({
        type: 'peticion',
        status: 'abierto',
        from: tx.userId,
        to: parsed.to || null,
        subject: parsed.subject,
        sourceText: tx.text,
        sourceTxId: tx.id,
        confidence: parsed.confidence,
      });
    }

    // reporte: entra al estado pero no arranca reloj ni genera aviso.
    return this.#add({
      type: 'reporte',
      status: 'registrado',
      from: tx.userId,
      to: null,
      subject: parsed.subject,
      sourceText: tx.text,
      sourceTxId: tx.id,
      confidence: parsed.confidence,
    });
  }

  #add(partial) {
    const item = {
      id: randomUUID(),
      ts: Date.now(),
      announcedAt: null,
      attempts: 0,
      closedBy: null,
      closedReason: null,
      ...partial,
    };
    this.items.set(item.id, item);
    this.emit('change');
    return item;
  }

  /** Peticiones abiertas que ya pasaron el umbral y todavia no se anunciaron. */
  dueUnanswered(now = Date.now()) {
    return [...this.items.values()].filter(
      (i) =>
        i.type === 'peticion' &&
        i.status === 'abierto' &&
        i.announcedAt === null &&
        now - i.ts >= cfg.unansweredMs,
    );
  }

  openItems() {
    return [...this.items.values()]
      .filter((i) => i.status === 'abierto')
      .sort((a, b) => a.ts - b.ts);
  }

  needsReview() {
    return [...this.items.values()].filter((i) => i.status === 'requiere_revision');
  }

  get(id) {
    return this.items.get(id);
  }

  close(id, { byTxId = null, reason = 'respuesta' } = {}) {
    const item = this.items.get(id);
    if (!item) return null;
    item.status = 'cerrado';
    item.closedBy = byTxId;
    item.closedReason = reason;
    this.emit('change');
    return item;
  }

  markAnnounced(id) {
    const item = this.items.get(id);
    if (!item) return;
    item.announcedAt = Date.now();
    item.attempts += 1;
    this.emit('change');
  }

  markNeedsReview(id, note) {
    const item = this.items.get(id);
    if (!item) return;
    item.status = 'requiere_revision';
    item.reviewNote = note;
    this.emit('change');
  }

  /** Empareja una respuesta con la peticion abierta mas plausible. Conservador a proposito. */
  #findOpenMatch(parsed) {
    const open = this.openItems().filter((i) => i.type === 'peticion');
    if (open.length === 0) return null;
    if (parsed.resolvesSubject) {
      const needle = parsed.resolvesSubject.toLowerCase();
      const hit = open.find(
        (i) =>
          i.subject.toLowerCase().includes(needle) || needle.includes(i.subject.toLowerCase()),
      );
      if (hit) return hit;
    }
    // Si hay exactamente una peticion abierta, la respuesta es de ella.
    return open.length === 1 ? open[0] : null;
  }

  /** Vista serializable para la pantalla (M5). */
  snapshot() {
    return {
      open: this.openItems(),
      review: this.needsReview(),
      all: [...this.items.values()].sort((a, b) => b.ts - a.ts),
      transmissions: this.transmissions.slice(-40).reverse(),
    };
  }
}
