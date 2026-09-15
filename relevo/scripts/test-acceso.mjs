/**
 * Prueba del acceso y la base de datos, atacando el servidor como lo haria alguien de afuera.
 *
 *   npm run test:acceso
 *
 * Levanta una instancia aparte (puerto 8795, canal propio, HTTPS, sin modo desarrollo) con una
 * base temporal. Las claves de prueba son aleatorias y nunca se imprimen.
 */
import { spawn } from 'node:child_process';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { abrirDb, purgar } from '../src/core/db.js';
import { Autenticacion, volverSeguro } from '../src/core/auth.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8795;
const BASE = `https://localhost:${PUERTO}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'relevo-acceso-'));
const DB = path.join(DIR, 'prueba.db');

let ok = 0;
let mal = 0;
const check = (nombre, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ok    ${nombre}`); }
  else { mal++; console.log(`  FALLA ${nombre} ${extra}`); }
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const clave = () => randomBytes(18).toString('base64url');

function pedir(metodo, ruta, { cookie, cuerpo, tipo = 'application/json' } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    let datos = null;
    if (cuerpo !== undefined) {
      datos = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
      headers['Content-Type'] = tipo;
      headers['Content-Length'] = Buffer.byteLength(datos);
    }
    const req = https.request(`${BASE}${ruta}`, { method: metodo, headers, rejectUnauthorized: false }, (res) => {
      let t = '';
      res.on('data', (c) => (t += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(t); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, json, texto: t });
      });
    });
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
}

const cookieDe = (r) => (r.headers['set-cookie'] || [])[0]?.split(';')[0] || null;

function conectar({ cookie, origen } = {}) {
  return new Promise((resolve) => {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (origen) headers.Origin = origen;
    const ws = new WebSocket(`wss://localhost:${PUERTO}`, { rejectUnauthorized: false, headers });
    const mensajes = [];
    ws.on('message', (d, bin) => { if (!bin) mensajes.push(JSON.parse(d.toString())); });
    ws.on('open', () => resolve({ ws, mensajes, abierto: true }));
    ws.on('unexpected-response', (_req, res) => resolve({ ws, mensajes, abierto: false, status: res.statusCode }));
    ws.on('error', () => resolve({ ws, mensajes, abierto: false, status: 'error' }));
  });
}

// ------------------------------------------------------------- preparar usuarios
const claves = { supervisor: clave(), radio: clave(), bloqueo: clave() };
{
  const db = abrirDb(DB);
  const auth = new Autenticacion(db);
  await auth.crearUsuario({ correo: 'super@prueba.co', nombre: 'Supervisora Prueba', rol: 'supervisor', clave: claves.supervisor });
  await auth.crearUsuario({ correo: 'radio@prueba.co', nombre: 'Radio Prueba', rol: 'radio', clave: claves.radio });
  await auth.crearUsuario({ correo: 'bloqueo@prueba.co', nombre: 'Bloqueo', rol: 'supervisor', clave: claves.bloqueo });
  db.close();
}

// ------------------------------------------------------------------ servidor
const servidor = spawn(process.execPath, ['src/index.js'], {
  cwd: RAIZ,
  env: { ...process.env, PORT: String(PUERTO), CHANNEL_ADAPTER: 'pwa', HTTPS: '1', MODO_DESARROLLO: '0', DB_ARCHIVO: DB },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let salida = '';
servidor.stdout.on('data', (d) => (salida += d));
servidor.stderr.on('data', (d) => (salida += d));
const fin = Date.now() + 20000;
while (!salida.includes('Relevo arriba') && Date.now() < fin) await dormir(200);
if (!salida.includes('Relevo arriba')) {
  console.log('\n  El servidor de prueba no arranco:\n' + salida);
  servidor.kill();
  process.exit(1);
}

try {
  console.log('\nPaginas y API sin sesion');
  let r = await pedir('GET', '/?board=1');
  check('la bitacora sin sesion redirige a entrar', r.status === 302 && String(r.headers.location).startsWith('/login.html?volver='), `-> ${r.status} ${r.headers.location}`);
  r = await pedir('GET', '/login.html');
  check('la pantalla de entrar es publica', r.status === 200);
  r = await pedir('GET', '/?board=1&demo=1');
  check('la bitacora de demo (sin datos reales) es publica', r.status === 200);
  r = await pedir('GET', '/api/sesion');
  check('/api/sesion sin sesion da 401', r.status === 401);
  check('cabeceras de seguridad presentes', r.headers['x-frame-options'] === 'DENY' && r.headers['x-content-type-options'] === 'nosniff');

  console.log('\nEntrar');
  const malClave = await pedir('POST', '/api/ingresar', { cuerpo: { correo: 'super@prueba.co', clave: 'equivocada-123' } });
  const noExiste = await pedir('POST', '/api/ingresar', { cuerpo: { correo: 'nadie@prueba.co', clave: 'equivocada-123' } });
  check('clave equivocada da 401', malClave.status === 401);
  check('correo inexistente responde IGUAL que clave equivocada', noExiste.status === 401 && JSON.stringify(noExiste.json) === JSON.stringify(malClave.json));
  r = await pedir('POST', '/api/ingresar', { cuerpo: 'correo=super@prueba.co', tipo: 'application/x-www-form-urlencoded' });
  check('rechaza un formulario que no es JSON (415)', r.status === 415, `-> ${r.status}`);

  r = await pedir('POST', '/api/ingresar', { cuerpo: { correo: 'SUPER@prueba.co', clave: claves.supervisor } });
  const setCookie = (r.headers['set-cookie'] || [])[0] || '';
  check('clave correcta entra (correo sin importar mayusculas)', r.status === 200 && r.json?.usuario?.rol === 'supervisor', `-> ${r.status}`);
  check('cookie HttpOnly, SameSite=Strict y Secure', /HttpOnly/.test(setCookie) && /SameSite=Strict/.test(setCookie) && /Secure/.test(setCookie), setCookie);
  const cSuper = cookieDe(r);
  r = await pedir('GET', '/api/sesion', { cookie: cSuper });
  check('con sesion, /api/sesion devuelve el usuario', r.status === 200 && r.json?.usuario?.nombre === 'Supervisora Prueba');
  r = await pedir('GET', '/?board=1', { cookie: cSuper });
  check('con sesion, la bitacora carga', r.status === 200);
  check('volver= no deja salir del sitio', volverSeguro('//malo.com') === '/?board=1' && volverSeguro('https://malo.com') === '/?board=1' && volverSeguro('/?board=1') === '/?board=1');

  console.log('\nWebSocket (por donde viajan los datos)');
  let c = await conectar();
  check('sin cookie la conexion se rechaza con 401', !c.abierto && c.status === 401, `-> ${c.status}`);
  c = await conectar({ cookie: cSuper, origen: 'https://pagina-mala.com' });
  check('desde otra pagina (Origin ajeno) se rechaza con 403', !c.abierto && c.status === 403, `-> ${c.status}`);
  c = await conectar({ cookie: 'relevo_sesion=token-inventado' });
  check('un token inventado se rechaza', !c.abierto && c.status === 401);

  const sup = await conectar({ cookie: cSuper, origen: BASE });
  sup.ws.send(JSON.stringify({ t: 'hello', role: 'board', userId: 'otro' }));
  await dormir(700);
  const bienvenida = sup.mensajes.find((m) => m.t === 'welcome');
  check('supervisor conectado recibe la bitacora', sup.abierto && sup.mensajes.some((m) => m.t === 'state'));
  check('la identidad es la del usuario, no la que manda el cliente', bienvenida?.userId === 'Supervisora Prueba', `-> ${bienvenida?.userId}`);

  const antes = sup.mensajes.length;
  sup.ws.send(JSON.stringify({ t: 'inject-text', text: 'Central, necesito material en el piso 8' }));
  await dormir(1500);
  check('sin modo desarrollo NO se puede inyectar texto', sup.mensajes.length === antes, `-> llegaron ${sup.mensajes.length - antes} mensajes`);

  r = await pedir('POST', '/api/ingresar', { cuerpo: { correo: 'radio@prueba.co', clave: claves.radio } });
  const cRadio = cookieDe(r);
  const rad = await conectar({ cookie: cRadio });
  const cierre = new Promise((res) => rad.ws.on('close', (code) => res(code)));
  rad.ws.send(JSON.stringify({ t: 'hello', role: 'board' }));
  const codigo = await Promise.race([cierre, dormir(2000).then(() => 'abierta')]);
  check('un usuario de radio NO ve la bitacora', codigo === 4403 && !rad.mensajes.some((m) => m.t === 'state'), `-> ${codigo}`);

  console.log('\nSalir');
  const cerrada = new Promise((res) => sup.ws.on('close', (code) => res(code)));
  r = await pedir('POST', '/api/salir', { cookie: cSuper });
  const codSalida = await Promise.race([cerrada, dormir(2000).then(() => 'abierta')]);
  check('al salir, la conexion abierta se cierra en el acto', codSalida === 4401, `-> ${codSalida}`);
  r = await pedir('GET', '/api/sesion', { cookie: cSuper });
  check('la sesion ya no sirve despues de salir', r.status === 401);

  console.log('\nFuerza bruta');
  for (let i = 0; i < 5; i++) await pedir('POST', '/api/ingresar', { cuerpo: { correo: 'bloqueo@prueba.co', clave: 'intento-' + i + '-malo' } });
  r = await pedir('POST', '/api/ingresar', { cuerpo: { correo: 'bloqueo@prueba.co', clave: claves.bloqueo } });
  check('tras 5 intentos fallidos se bloquea, aunque la clave sea correcta', r.status === 429 && Number(r.headers['retry-after']) > 0, `-> ${r.status}`);
} finally {
  servidor.kill();
}

// --------------------------------------------------------- base de datos directa
console.log('\nBase de datos');
{
  const db = abrirDb(DB);
  const fila = db.prepare("SELECT clave FROM usuarios WHERE correo = 'super@prueba.co'").get();
  check('la clave no se guarda en texto plano', fila.clave.startsWith('scrypt$') && !fila.clave.includes(claves.supervisor));
  const sesiones = db.prepare('SELECT token_hash FROM sesiones').all();
  check('las sesiones guardan el hash del token, no el token', sesiones.every((s) => /^[0-9a-f]{64}$/.test(s.token_hash)));
  const acciones = new Set(db.prepare('SELECT accion FROM auditoria').all().map((a) => a.accion));
  check('auditoria registra ingreso, fallo, salida, bloqueo e inyeccion rechazada',
    ['ingreso', 'ingreso_fallido', 'salida', 'ingreso_bloqueado', 'inyeccion_rechazada'].every((a) => acciones.has(a)),
    `-> ${[...acciones].join(', ')}`);
  db.close();
}
{
  const { Bitacora } = await import('../src/core/state.js');
  const archivo = path.join(DIR, 'bitacora.db');
  let db = abrirDb(archivo);
  let b = new Bitacora(db);
  const tx1 = b.logTransmission({ userId: 'torre 3', text: 'Necesito material en el piso 8', confidence: 0.9 });
  const pet = b.ingest(tx1, { type: 'peticion', subject: 'Material en el piso 8', confidence: 0.9 });
  const tx2 = b.logTransmission({ userId: 'grua', text: 'Pluma libre', confidence: 0.9 });
  const rep = b.ingest(tx2, { type: 'reporte', subject: 'Pluma libre', confidence: 0.9 });
  b.markAnnounced(pet.id);
  db.close();

  db = abrirDb(archivo);
  b = new Bitacora(db);
  const p2 = b.get(pet.id);
  check('la bitacora sobrevive a un reinicio', p2 && p2.subject === 'Material en el piso 8' && p2.sourceText === 'Necesito material en el piso 8' && p2.from === 'torre 3');
  check('se conservan el aviso y los intentos', p2.announcedAt !== null && p2.attempts === 1);
  check('lo cargado tras reiniciar no dispara avisos atrasados', b.dueUnanswered(Date.now() + 10 * 60_000).length === 0);
  b.close(pet.id, { reason: 'respuesta' });
  const tx3 = b.logTransmission({ userId: 'central', text: 'Necesito el mixer', confidence: 0.9 });
  const abierto = b.ingest(tx3, { type: 'peticion', subject: 'Mixer', confidence: 0.9 });

  // Retencion: se envejece todo 100 dias y se purga con 90.
  const viejo = Date.now() - 100 * 86_400_000;
  db.exec(`UPDATE items SET ts = ${viejo}; UPDATE transmisiones SET ts = ${viejo};`);
  const borrado = purgar(db, 90);
  const quedan = db.prepare('SELECT id, estado FROM items').all();
  check('retencion borra lo resuelto viejo', !quedan.some((i) => i.id === pet.id || i.id === rep.id), `-> ${JSON.stringify(borrado)}`);
  check('retencion NO borra un pendiente que sigue abierto', quedan.some((i) => i.id === abierto.id));
  check('retencion borra las transmisiones viejas', db.prepare('SELECT COUNT(*) n FROM transmisiones').get().n === 0);
  db.close();
}

console.log(`\n  ${ok} pasaron, ${mal} fallaron\n`);
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
process.exit(mal ? 1 : 0);
