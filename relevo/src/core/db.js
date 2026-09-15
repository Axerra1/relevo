import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Base de datos. SQLite integrado en Node: sin dependencias y sin compilar nada en Windows.
 * Para un piloto en un solo servidor es lo correcto; cuando haya varios servidores se cambia
 * por Postgres detras de las mismas funciones.
 *
 * El archivo guarda datos personales de los trabajadores (quien dijo que y cuando):
 * nunca se versiona, solo se lee con sesion, y lo viejo se borra (purgar).
 */

// Cada migracion corre una sola vez, en orden. Nunca se edita una que ya salio: se agrega otra.
const MIGRACIONES = [
  `
  CREATE TABLE usuarios (
    id      INTEGER PRIMARY KEY,
    correo  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nombre  TEXT NOT NULL,
    rol     TEXT NOT NULL CHECK (rol IN ('admin', 'supervisor', 'radio')),
    clave   TEXT NOT NULL,
    activo  INTEGER NOT NULL DEFAULT 1,
    creado  INTEGER NOT NULL
  );

  CREATE TABLE sesiones (
    token_hash  TEXT PRIMARY KEY,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creada      INTEGER NOT NULL,
    expira      INTEGER NOT NULL,
    ip          TEXT
  );
  CREATE INDEX sesiones_expira ON sesiones(expira);

  CREATE TABLE transmisiones (
    id         TEXT PRIMARY KEY,
    remitente  TEXT NOT NULL,
    texto      TEXT NOT NULL,
    confianza  REAL,
    ts         INTEGER NOT NULL
  );
  CREATE INDEX transmisiones_ts ON transmisiones(ts);

  CREATE TABLE items (
    id            TEXT PRIMARY KEY,
    tipo          TEXT NOT NULL,
    estado        TEXT NOT NULL,
    remitente     TEXT,
    destinatario  TEXT,
    asunto        TEXT,
    texto_origen  TEXT,
    tx_origen     TEXT,
    confianza     REAL,
    ts            INTEGER NOT NULL,
    anunciado_en  INTEGER,
    intentos      INTEGER NOT NULL DEFAULT 0,
    cerrado_por   TEXT,
    razon_cierre  TEXT,
    nota_revision TEXT,
    actualizado   INTEGER NOT NULL
  );
  CREATE INDEX items_estado ON items(estado);
  CREATE INDEX items_ts ON items(ts);

  CREATE TABLE auditoria (
    id       INTEGER PRIMARY KEY,
    ts       INTEGER NOT NULL,
    usuario  TEXT,
    accion   TEXT NOT NULL,
    detalle  TEXT
  );
  CREATE INDEX auditoria_ts ON auditoria(ts);
  `,
];

export function abrirDb(archivo) {
  if (archivo !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(archivo)), { recursive: true });
  const db = new DatabaseSync(archivo);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  const actual = db.prepare('PRAGMA user_version').get().user_version;
  // Antes de cambiar la estructura de una base que ya tiene datos, una copia. Es el momento
  // mas riesgoso: si una migracion sale mal, se vuelve a esta copia.
  if (archivo !== ':memory:' && actual > 0 && actual < MIGRACIONES.length) {
    const r = respaldar(db, path.join(path.dirname(path.resolve(archivo)), 'respaldos'), { prefijo: `antes-migracion-v${actual}` });
    console.log(`base: copia antes de migrar -> ${r}`);
  }
  for (let v = actual; v < MIGRACIONES.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRACIONES[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Fallo la migracion ${v + 1}: ${err.message}`);
    }
  }
  return db;
}

/**
 * Copia consistente de la base con VACUUM INTO: se puede hacer con el servidor andando, y el
 * resultado es un archivo SQLite normal que se abre directo.
 *
 * Rota solo las copias diarias (prefijo "relevo"): conserva las `conservar` mas nuevas. Las
 * copias de antes de una migracion no se borran solas.
 *
 * Ojo: la copia queda en el MISMO disco que la base. Protege contra una base corrupta o un
 * borrado por error, no contra perder el disco. Para eso hace falta sacarla a otro lugar.
 */
export function respaldar(db, carpeta, { prefijo = 'relevo', conservar = 7 } = {}) {
  fs.mkdirSync(carpeta, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const destino = path.join(carpeta, `${prefijo}-${sello}.db`);
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);

  if (prefijo === 'relevo') {
    const diarias = fs
      .readdirSync(carpeta)
      .filter((f) => /^relevo-.*\.db$/.test(f))
      .sort();
    for (const viejo of diarias.slice(0, Math.max(0, diarias.length - conservar))) {
      fs.rmSync(path.join(carpeta, viejo), { force: true });
    }
  }
  return destino;
}

/** Deja constancia de quien hizo que. Es lo que un HSE o un auditor va a pedir. */
export function auditar(db, usuario, accion, detalle = null) {
  db.prepare('INSERT INTO auditoria (ts, usuario, accion, detalle) VALUES (?, ?, ?, ?)').run(
    Date.now(),
    usuario ?? null,
    accion,
    detalle === null ? null : typeof detalle === 'string' ? detalle : JSON.stringify(detalle),
  );
}

/**
 * Retencion. Borra transmisiones, items resueltos y registros de auditoria mas viejos que el
 * plazo, y las sesiones vencidas. Los pendientes que siguen ABIERTOS no se borran: son operacion
 * viva, y borrarlos haria desaparecer algo que alguien todavia tiene que atender.
 */
export function purgar(db, dias, ahora = Date.now()) {
  const corte = ahora - dias * 86_400_000;
  const tx = db.prepare('DELETE FROM transmisiones WHERE ts < ?').run(corte).changes;
  const items = db.prepare("DELETE FROM items WHERE ts < ? AND estado <> 'abierto'").run(corte).changes;
  const aud = db.prepare('DELETE FROM auditoria WHERE ts < ?').run(corte).changes;
  const ses = db.prepare('DELETE FROM sesiones WHERE expira < ?').run(ahora).changes;
  return { transmisiones: tx, items, auditoria: aud, sesiones: ses };
}
