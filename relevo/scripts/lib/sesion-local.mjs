/**
 * Para scripts locales (sembrar el turno, pruebas de humo): crea una sesion de servicio de
 * 15 minutos directamente en la base y devuelve la cookie para el WebSocket.
 *
 * No abre ninguna puerta nueva: quien puede correr esto ya tiene el archivo de la base.
 */
import { abrirDb } from '../../src/core/db.js';
import { Autenticacion } from '../../src/core/auth.js';
import { cfg } from '../../src/config.js';

export function cookieLocal(motivo = 'script') {
  const db = abrirDb(cfg.dbArchivo);
  try {
    const token = new Autenticacion(db).crearSesionServicio(motivo, 15);
    return `relevo_sesion=${encodeURIComponent(token)}`;
  } finally {
    db.close();
  }
}

/** Pregunta al servidor si acepta inyeccion de texto. Sin MODO_DESARROLLO=1 no la acepta. */
export async function servidorEnDesarrollo(cookie) {
  const base = `${cfg.https ? 'https' : 'http'}://localhost:${cfg.port}`;
  const https = await import('node:https');
  const http = await import('node:http');
  const mod = cfg.https ? https : http;
  return new Promise((resolve) => {
    const req = mod.get(`${base}/api/sesion`, { headers: { Cookie: cookie }, rejectUnauthorized: false }, (res) => {
      let t = '';
      res.on('data', (c) => (t += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(t).modoDesarrollo === true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(null));
  });
}
