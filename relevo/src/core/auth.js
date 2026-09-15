import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { auditar } from './db.js';

/**
 * Acceso a la bitacora.
 *
 * Todo con lo que trae Node, sin dependencias:
 *  - claves con scrypt, cada una con su sal
 *  - sesion: un token aleatorio en una cookie HttpOnly; en la base solo queda su hash, asi que
 *    quien lea la base no puede suplantar a nadie
 *  - bloqueo tras varios intentos fallidos, por correo y por IP
 */

const scrypt = promisify(scryptCb);
// El scrypt asincrono corre en el pool de hilos de libuv. El sincrono bloquea el hilo
// principal ~100 ms, y ese hilo es el que manda los paquetes de audio del agente cada 60 ms.
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LARGO = 64;

export const ROLES = ['admin', 'supervisor', 'radio'];
export const CLAVE_MINIMA = 10;
export const COOKIE = 'relevo_sesion';

// Por correo se bloquea pronto: frena que adivinen la clave de una persona. Por IP el umbral es
// mas alto, porque toda una oficina o una obra puede salir a internet con la misma IP y un solo
// despistado no deberia dejar a todos afuera.
const MAX_FALLOS = { c: 5, ip: 20 };
const VENTANA_MS = 15 * 60_000;
const limite = (k) => MAX_FALLOS[k.split(':')[0]] ?? 5;

export async function hashClave(clave) {
  const sal = randomBytes(16);
  const h = await scrypt(clave.normalize('NFKC'), sal, LARGO, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${sal.toString('base64')}$${h.toString('base64')}`;
}

export async function verificarClave(clave, guardado) {
  const partes = String(guardado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, salB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, 'base64');
  const h = await scrypt(String(clave).normalize('NFKC'), Buffer.from(salB64, 'base64'), esperado.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return h.length === esperado.length && timingSafeEqual(h, esperado);
}

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** Solo rutas internas: evita que ?volver= mande a alguien a otro sitio despues de entrar. */
export function volverSeguro(v) {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : '/?board=1';
}

export function leerCookie(cabecera, nombre = COOKIE) {
  for (const parte of String(cabecera || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

export function cookieSesion(token, { segundos, segura }) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${segundos}${segura ? '; Secure' : ''}`;
}

export function cookieBorrada({ segura }) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${segura ? '; Secure' : ''}`;
}

export class Autenticacion {
  constructor(db, { horas = 12 } = {}) {
    this.db = db;
    this.ms = horas * 3_600_000;
    this.fallos = new Map(); // clave de bloqueo -> [timestamps]
    this.dummy = null; // hash de relleno para correos que no existen
  }

  // ------------------------------------------------------------------ usuarios

  async crearUsuario({ correo, nombre, rol, clave }) {
    correo = String(correo || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('Correo no valido');
    if (!String(nombre || '').trim()) throw new Error('Falta el nombre');
    if (!ROLES.includes(rol)) throw new Error(`Rol no valido: usa ${ROLES.join(', ')}`);
    if (String(clave || '').length < CLAVE_MINIMA) throw new Error(`La clave necesita al menos ${CLAVE_MINIMA} caracteres`);
    const hash = await hashClave(clave);
    const r = this.db
      .prepare('INSERT INTO usuarios (correo, nombre, rol, clave, activo, creado) VALUES (?, ?, ?, ?, 1, ?)')
      .run(correo, nombre.trim(), rol, hash, Date.now());
    auditar(this.db, 'sistema', 'usuario_creado', { correo, rol });
    return Number(r.lastInsertRowid);
  }

  async cambiarClave(correo, clave) {
    if (String(clave || '').length < CLAVE_MINIMA) throw new Error(`La clave necesita al menos ${CLAVE_MINIMA} caracteres`);
    const u = this.#porCorreo(correo);
    if (!u) throw new Error('No existe ese usuario');
    this.db.prepare('UPDATE usuarios SET clave = ? WHERE id = ?').run(await hashClave(clave), u.id);
    this.db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(u.id); // se cierran todas
    auditar(this.db, 'sistema', 'clave_cambiada', { correo: u.correo });
  }

  desactivar(correo) {
    const u = this.#porCorreo(correo);
    if (!u) throw new Error('No existe ese usuario');
    this.db.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(u.id);
    this.db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(u.id);
    auditar(this.db, 'sistema', 'usuario_desactivado', { correo: u.correo });
  }

  listar() {
    return this.db
      .prepare("SELECT correo, nombre, rol, activo, creado FROM usuarios WHERE correo <> 'sistema@relevo.local' ORDER BY creado")
      .all();
  }

  hayUsuarios() {
    return this.db.prepare("SELECT COUNT(*) n FROM usuarios WHERE activo = 1 AND correo <> 'sistema@relevo.local'").get().n > 0;
  }

  #porCorreo(correo) {
    return this.db.prepare('SELECT * FROM usuarios WHERE correo = ?').get(String(correo || '').trim().toLowerCase());
  }

  // -------------------------------------------------------------------- sesion

  /**
   * @returns {{ok:true, token, usuario} | {ok:false, motivo:'credenciales'|'bloqueado', esperaSeg?:number}}
   */
  async ingresar(correo, clave, ip = '') {
    correo = String(correo || '').trim().toLowerCase();
    const claves = [`c:${correo}`, `ip:${ip}`];

    const espera = this.#bloqueo(claves);
    if (espera > 0) {
      auditar(this.db, correo, 'ingreso_bloqueado', { ip });
      return { ok: false, motivo: 'bloqueado', esperaSeg: Math.ceil(espera / 1000) };
    }

    const u = this.#porCorreo(correo);
    // Un correo que no existe cuesta lo mismo que una clave equivocada: asi no se puede
    // averiguar por el tiempo de respuesta que correos estan registrados.
    if (!this.dummy) this.dummy = await hashClave(randomBytes(12).toString('hex'));
    const valida = await verificarClave(clave, u ? u.clave : this.dummy);

    if (!u || !u.activo || !valida || u.correo === 'sistema@relevo.local') {
      this.#fallo(claves);
      auditar(this.db, correo, 'ingreso_fallido', { ip });
      return { ok: false, motivo: 'credenciales' };
    }

    claves.forEach((k) => this.fallos.delete(k));
    const token = randomBytes(32).toString('base64url');
    const ahora = Date.now();
    this.db
      .prepare('INSERT INTO sesiones (token_hash, usuario_id, creada, expira, ip) VALUES (?, ?, ?, ?, ?)')
      .run(hashToken(token), u.id, ahora, ahora + this.ms, ip);
    auditar(this.db, u.correo, 'ingreso', { ip });
    return { ok: true, token, usuario: { correo: u.correo, nombre: u.nombre, rol: u.rol } };
  }

  /** Devuelve el usuario de un token vigente, o null. */
  validar(token) {
    if (!token) return null;
    const fila = this.db
      .prepare(
        `SELECT u.correo, u.nombre, u.rol, u.activo, s.expira FROM sesiones s
         JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ?`,
      )
      .get(hashToken(token));
    if (!fila || !fila.activo || fila.expira < Date.now()) return null;
    return { correo: fila.correo, nombre: fila.nombre, rol: fila.rol };
  }

  salir(token) {
    if (!token) return;
    const u = this.validar(token);
    this.db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(hashToken(token));
    if (u) auditar(this.db, u.correo, 'salida');
  }

  /**
   * Sesion de corta duracion para scripts locales (sembrar el turno, pruebas). Quien puede
   * correr esto ya tiene el archivo de la base en su maquina, asi que no abre nada nuevo.
   */
  crearSesionServicio(motivo = 'script', minutos = 15) {
    let sis = this.#porCorreo('sistema@relevo.local');
    if (!sis) {
      // Clave imposible: el formato no es scrypt, asi que verificarClave siempre da falso.
      this.db
        .prepare("INSERT INTO usuarios (correo, nombre, rol, clave, activo, creado) VALUES ('sistema@relevo.local', 'sistema', 'admin', '!', 1, ?)")
        .run(Date.now());
      sis = this.#porCorreo('sistema@relevo.local');
    }
    const token = randomBytes(32).toString('base64url');
    const ahora = Date.now();
    this.db
      .prepare('INSERT INTO sesiones (token_hash, usuario_id, creada, expira, ip) VALUES (?, ?, ?, ?, ?)')
      .run(hashToken(token), sis.id, ahora, ahora + minutos * 60_000, 'local');
    auditar(this.db, 'sistema', 'sesion_servicio', { motivo, minutos });
    return token;
  }

  // ------------------------------------------------------------------- bloqueo

  #fallo(claves) {
    const ahora = Date.now();
    for (const k of claves) {
      const lista = (this.fallos.get(k) || []).filter((t) => ahora - t < VENTANA_MS);
      lista.push(ahora);
      this.fallos.set(k, lista);
    }
  }

  /** Milisegundos que faltan para poder intentar, o 0. */
  #bloqueo(claves) {
    const ahora = Date.now();
    let espera = 0;
    for (const k of claves) {
      const lista = (this.fallos.get(k) || []).filter((t) => ahora - t < VENTANA_MS);
      const max = limite(k);
      if (lista.length >= max) espera = Math.max(espera, VENTANA_MS - (ahora - lista[lista.length - max]));
    }
    return espera;
  }
}
