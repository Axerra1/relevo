import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { cfg } from '../config.js';

/**
 * Bitacora. Es la memoria que el canal no tiene.
 *
 * Invariante P3 (no afirmar lo que no se puede citar): todo item guarda `sourceText`,
 * la frase literal de la que salio, y su `confidence`. Nada se transmite sin poder citarse.
 *
 * Invariante M9: aca nunca entra audio. Solo texto, y `from` es el id que la red PTT ya entrega.
 * No hay huella vocal en ninguna parte del sistema.
 *
 * Con base de datos (`new Bitacora(db)`) cada cambio se guarda en el momento, y la bitacora
 * sobrevive a un reinicio. Sin base (`new Bitacora()`) vive en memoria, que es lo que usan las
 * pruebas del arbitro.
 *
 * En memoria queda solo lo vivo: lo abierto, lo que espera revision y lo de las ultimas 24 h.
 * Lo mas viejo sigue en la base y no se carga.
 */

const EN_MEMORIA_MS = 24 * 3_600_000;
const MAX_TX_MEMORIA = 200;
const MAX_EN_PANTALLA = 200;

const deFila = (f) => ({
  id: f.id,
  type: f.tipo,
  status: f.estado,
  from: f.remitente,
  to: f.destinatario,
  subject: f.asunto,
  sourceText: f.texto_origen,
  sourceTxId: f.tx_origen,
  confidence: f.confianza,
  ts: f.ts,
  announcedAt: f.anunciado_en,
  attempts: f.intentos,
  closedBy: f.cerrado_por,
  closedReason: f.razon_cierre,
  reviewNote: f.nota_revision,
});

export class Bitacora extends EventEmitter {
  constructor(db = null) {
    super();
    this.db = db;
    /** @type {Map<string, Item>} */
    this.items = new Map();
    this.transmissions = [];

    if (db) {
      this.sql = {
        tx: db.prepare('INSERT INTO transmisiones (id, remitente, texto, confianza, ts) VALUES (?, ?, ?, ?, ?)'),
        item: db.prepare(`
          INSERT INTO items (id, tipo, estado, remitente, destinatario, asunto, texto_origen, tx_origen,
                             confianza, ts, anunciado_en, intentos, cerrado_por, razon_cierre, nota_revision, actualizado)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            estado = excluded.estado, anunciado_en = excluded.anunciado_en, intentos = excluded.intentos,
            cerrado_por = excluded.cerrado_por, razon_cierre = excluded.razon_cierre,
            nota_revision = excluded.nota_revision, actualizado = excluded.actualizado`),
        uno: db.prepare('SELECT * FROM items WHERE id = ?'),
      };
      this.#cargar();
    }
  }

  #cargar() {
    const desde = Date.now() - EN_MEMORIA_MS;
    const filas = this.db
      .prepare("SELECT * FROM items WHERE estado IN ('abierto', 'requiere_revision') OR ts >= ? ORDER BY ts")
      .all(desde);
    for (const f of filas) {
      // Lo que viene de antes del arranque no dispara avisos atrasados: un reinicio no puede
      // soltar una rafaga de avisos viejos al canal. Sigue abierto y llega al relevo de turno.
      this.items.set(f.id, { ...deFila(f), cargado: true });
    }
    this.transmissions = this.db
      .prepare('SELECT * FROM transmisiones WHERE ts >= ? ORDER BY ts DESC LIMIT ?')
      .all(desde, MAX_TX_MEMORIA)
      .reverse()
      .map((t) => ({ id: t.id, userId: t.remitente, text: t.texto, confidence: t.confianza, ts: t.ts }));
  }

  #guardar(item) {
    if (!this.db) return;
    this.sql.item.run(
      item.id, item.type, item.status, item.from ?? null, item.to ?? null, item.subject ?? null,
      item.sourceText ?? null, item.sourceTxId ?? null, item.confidence ?? null, item.ts,
      item.announcedAt ?? null, item.attempts ?? 0, item.closedBy ?? null, item.closedReason ?? null,
      item.reviewNote ?? null, Date.now(),
    );
  }

  /** Registra la transmision cruda (solo texto) para poder citarla despues. */
  logTransmission({ userId, text, confidence, ts }) {
    const tx = { id: randomUUID(), userId, text, confidence, ts: ts || Date.now() };
    this.transmissions.push(tx);
    if (this.transmissions.length > MAX_TX_MEMORIA) this.transmissions.splice(0, this.transmissions.length - MAX_TX_MEMORIA);
    if (this.db) this.sql.tx.run(tx.id, String(userId ?? 'desconocido'), String(text ?? ''), confidence ?? null, tx.ts);
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
    this.#guardar(item);
    this.#podar();
    this.emit('change');
    return item;
  }

  /** Saca de memoria lo resuelto de hace mas de 24 h. En la base sigue estando. */
  #podar() {
    if (!this.db) return;
    const corte = Date.now() - EN_MEMORIA_MS;
    for (const [id, i] of this.items) {
      if (i.ts < corte && i.status !== 'abierto' && i.status !== 'requiere_revision') this.items.delete(id);
    }
  }

  /** Peticiones abiertas que ya pasaron el umbral y todavia no se anunciaron. */
  dueUnanswered(now = Date.now()) {
    return [...this.items.values()].filter(
      (i) =>
        i.type === 'peticion' &&
        i.status === 'abierto' &&
        i.announcedAt === null &&
        !i.cargado &&
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
    const enMemoria = this.items.get(id);
    if (enMemoria || !this.db) return enMemoria;
    const f = this.sql.uno.get(id);
    return f ? deFila(f) : undefined;
  }

  close(id, { byTxId = null, reason = 'respuesta' } = {}) {
    const item = this.get(id);
    if (!item) return null;
    item.status = 'cerrado';
    item.closedBy = byTxId;
    item.closedReason = reason;
    this.#guardar(item);
    this.emit('change');
    return item;
  }

  markAnnounced(id) {
    const item = this.items.get(id);
    if (!item) return;
    item.announcedAt = Date.now();
    item.attempts += 1;
    this.#guardar(item);
    this.emit('change');
  }

  markNeedsReview(id, note) {
    const item = this.items.get(id);
    if (!item) return;
    item.status = 'requiere_revision';
    item.reviewNote = note;
    this.#guardar(item);
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
    const limpio = ({ cargado, ...i }) => i;
    return {
      open: this.openItems().map(limpio),
      review: this.needsReview().map(limpio),
      all: [...this.items.values()].sort((a, b) => b.ts - a.ts).slice(0, MAX_EN_PANTALLA).map(limpio),
      transmissions: this.transmissions.slice(-40).reverse(),
    };
  }
}
