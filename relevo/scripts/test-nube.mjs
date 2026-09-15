/**
 * Prueba de lo necesario para correr en la nube, sin subir nada:
 *   node scripts/test-nube.mjs
 *
 * Levanta dos instancias con bases temporales:
 *   8796  detras de un proxy (DETRAS_DE_PROXY=1), HTTP por dentro, como en Fly
 *   8797  sin proxy (DETRAS_DE_PROXY=0), HTTPS propio
 *
 * El apagado limpio con SIGTERM no se puede probar en Windows (no entrega senales a otro
 * proceso): se prueba en el contenedor.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { abrirDb, respaldar } from '../src/core/db.js';
import { Autenticacion } from '../src/core/auth.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'relevo-nube-'));
let ok = 0;
let mal = 0;
const check = (n, c, extra = '') => {
  if (c) { ok++; console.log(`  ok    ${n}`); } else { mal++; console.log(`  FALLA ${n} ${extra}`); }
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function instancia(puerto, env) {
  const db = path.join(DIR, `db-${puerto}.db`);
  const clave = randomBytes(18).toString('base64url');
  const d = abrirDb(db);
  await new Autenticacion(d).crearUsuario({ correo: 'admin@prueba.co', nombre: 'Admin', rol: 'admin', clave });
  d.close();
  const p = spawn(process.execPath, ['src/index.js'], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(puerto), CHANNEL_ADAPTER: 'pwa', MODO_DESARROLLO: '0', DB_ARCHIVO: db, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  p.stdout.on('data', (x) => (salida += x));
  p.stderr.on('data', (x) => (salida += x));
  const fin = Date.now() + 20000;
  while (!salida.includes('Relevo arriba') && Date.now() < fin) await dormir(200);
  if (!salida.includes('Relevo arriba')) throw new Error(`no arranco ${puerto}:\n${salida}`);
  return { p, db, clave, salida: () => salida };
}

function pedir(base, metodo, ruta, { cuerpo, cabeceras = {} } = {}) {
  const mod = base.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const headers = { ...cabeceras };
    let datos = null;
    if (cuerpo) {
      datos = JSON.stringify(cuerpo);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(datos);
    }
    const req = mod.request(`${base}${ruta}`, { method: metodo, headers, rejectUnauthorized: false }, (res) => {
      let t = '';
      res.on('data', (c) => (t += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch {} resolve({ status: res.statusCode, headers: res.headers, json: j }); });
    });
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
}

const intentoMalo = (base, ip, i) =>
  pedir(base, 'POST', '/api/ingresar', {
    cuerpo: { correo: `nadie${i}@prueba.co`, clave: 'no-sirve-' + i },
    cabeceras: { 'X-Forwarded-For': ip },
  });

const proxy = await instancia(8796, { HTTPS: '0', DETRAS_DE_PROXY: '1' });
const directo = await instancia(8797, { HTTPS: '1', DETRAS_DE_PROXY: '0' });
const P = 'http://localhost:8796';
const D = 'https://localhost:8797';

try {
  console.log('\nSalud');
  let r = await pedir(P, 'GET', '/salud');
  check('/salud responde 200 sin sesion', r.status === 200 && r.json?.ok === true, `-> ${r.status}`);
  check('/salud no expone datos de la operacion', JSON.stringify(Object.keys(r.json || {}).sort()) === JSON.stringify(['canal', 'conectado', 'ok']), JSON.stringify(r.json));

  console.log('\nDetras de un proxy (como en Fly)');
  r = await pedir(P, 'POST', '/api/ingresar', { cuerpo: { correo: 'admin@prueba.co', clave: proxy.clave } });
  const cookie = (r.headers['set-cookie'] || [])[0] || '';
  check('la cookie sale con Secure aunque por dentro sea HTTP', r.status === 200 && /; Secure/.test(cookie), cookie);

  for (let i = 0; i < 20; i++) await intentoMalo(P, '203.0.113.5', i);
  r = await pedir(P, 'POST', '/api/ingresar', { cuerpo: { correo: 'admin@prueba.co', clave: proxy.clave }, cabeceras: { 'X-Forwarded-For': '203.0.113.5' } });
  check('una IP con 20 fallos queda bloqueada', r.status === 429, `-> ${r.status}`);
  r = await pedir(P, 'POST', '/api/ingresar', { cuerpo: { correo: 'admin@prueba.co', clave: proxy.clave }, cabeceras: { 'X-Forwarded-For': '198.51.100.7' } });
  check('otra IP detras del mismo proxy NO queda bloqueada', r.status === 200, `-> ${r.status}`);
  r = await pedir(P, 'POST', '/api/ingresar', { cuerpo: { correo: 'admin@prueba.co', clave: proxy.clave }, cabeceras: { 'Fly-Client-IP': '203.0.113.5', 'X-Forwarded-For': '198.51.100.7' } });
  check('Fly-Client-IP manda sobre X-Forwarded-For', r.status === 429, `-> ${r.status}`);

  console.log('\nSin proxy: la cabecera de IP no se cree');
  for (let i = 0; i < 20; i++) await intentoMalo(D, '203.0.113.5', i);
  r = await pedir(D, 'POST', '/api/ingresar', { cuerpo: { correo: 'admin@prueba.co', clave: directo.clave }, cabeceras: { 'X-Forwarded-For': '198.51.100.99' } });
  check('inventarse otra IP en la cabecera no salta el bloqueo', r.status === 429, `-> ${r.status}`);

  console.log('\nRespaldos');
  const carpetaP = path.join(DIR, 'respaldos');
  check('al arrancar se hace una copia de la base', proxy.salida().includes('respaldo: ') && fs.readdirSync(carpetaP).some((f) => /^relevo-.*\.db$/.test(f)));
} finally {
  proxy.p.kill();
  directo.p.kill();
}
await dormir(800);

{
  const origen = path.join(DIR, 'rotacion.db');
  const db = abrirDb(origen);
  await new Autenticacion(db).crearUsuario({ correo: 'x@prueba.co', nombre: 'X', rol: 'supervisor', clave: randomBytes(18).toString('base64url') });
  const carpeta = path.join(DIR, 'rotacion');
  let ultima;
  for (let i = 0; i < 10; i++) { ultima = respaldar(db, carpeta, { conservar: 7 }); await dormir(15); }
  respaldar(db, carpeta, { prefijo: 'antes-migracion-v1' });
  db.close();
  const archivos = fs.readdirSync(carpeta);
  check('se conservan solo las 7 copias diarias mas nuevas', archivos.filter((f) => f.startsWith('relevo-')).length === 7, `-> ${archivos.length}`);
  check('la copia de antes de migrar no se borra por rotacion', archivos.some((f) => f.startsWith('antes-migracion-v1')));
  const copia = new DatabaseSync(ultima, { readOnly: true });
  const n = copia.prepare("SELECT COUNT(*) n FROM usuarios WHERE correo = 'x@prueba.co'").get().n;
  const version = copia.prepare('PRAGMA user_version').get().user_version;
  copia.close();
  check('la copia es una base valida, con los datos y la version de esquema', n === 1 && version >= 1, `-> usuarios ${n}, version ${version}`);
}

console.log(`\n  ${ok} pasaron, ${mal} fallaron\n`);
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
process.exit(mal ? 1 : 0);
