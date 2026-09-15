import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { cfg } from '../config.js';
import { synthesizePcm } from '../core/ai.js';
import { pcmAWav, SAMPLE_RATE } from '../core/opus.js';
import { auditar } from '../core/db.js';
import { leerCookie, cookieSesion, cookieBorrada, volverSeguro } from '../core/auth.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// Lo unico que se sirve sin sesion: la pantalla de ingreso y lo que ella necesita.
const PUBLICOS = new Set(['/login.html', '/icono.svg', '/manifest.json', '/demo.js']);

const CABECERAS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
};

/** IP real del cliente. Solo se cree la cabecera del proxy cuando de verdad hay un proxy. */
function ipCliente(req) {
  if (cfg.detrasDeProxy) {
    const fly = req.headers['fly-client-ip'];
    if (fly) return String(fly).trim();
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

function rechazarUpgrade(socket, codigo) {
  const texto = codigo === 401 ? 'Unauthorized' : 'Forbidden';
  socket.write(`HTTP/1.1 ${codigo} ${texto}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function leerJson(req, limite = 4096) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').includes('application/json')) return reject(Object.assign(new Error('json'), { codigo: 415 }));
    let largo = 0;
    const partes = [];
    req.on('data', (c) => {
      largo += c.length;
      if (largo > limite) {
        reject(Object.assign(new Error('grande'), { codigo: 413 }));
        req.destroy();
      } else partes.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('json'), { codigo: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Adaptador de canal propio: PTT en el navegador.
 *
 * Es el camino garantizado. Mismo contrato que el adaptador de Zello, asi que cambiar de
 * uno a otro es cambiar CHANNEL_ADAPTER y nada mas.
 *
 * Contrato de adaptador:
 *   emite 'tx-start' { userId }                 un humano apreto PTT
 *   emite 'tx-end'   { userId, audio, mime }    lo solto; audio es el bloque cerrado
 *   get floorBusy                               alguien tiene el canal tomado
 *   speak(text, { maxMs }) -> { abort(), done } el agente transmite
 *   publish(snapshot)                           empuja la bitacora a las pantallas
 */
export class PwaAdapter extends EventEmitter {
  /**
   * @param {{auth: import('../core/auth.js').Autenticacion}} opciones
   * Sin autenticacion no arranca: la bitacora muestra lo que dicen los trabajadores.
   */
  constructor({ auth } = {}) {
    super();
    if (!auth) throw new Error('PwaAdapter necesita autenticacion');
    this.auth = auth;
    this.wss = null;
    this.radios = new Set();
    this.boards = new Set();
    this.holder = null; // userId que tiene el canal
    this.chunks = new Map(); // userId -> Buffer[]
    this.agentAbort = null;
  }

  get floorBusy() {
    return this.holder !== null;
  }

  // ---------------------------------------------------------------- api de acceso

  async #api(req, res, pathname) {
    const segura = cfg.https || cfg.detrasDeProxy;
    const json = (codigo, cuerpo, extra = {}) => {
      res.writeHead(codigo, { ...CABECERAS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
      res.end(JSON.stringify(cuerpo));
    };

    if (pathname === '/api/ingresar' && req.method === 'POST') {
      let cuerpo;
      try {
        cuerpo = await leerJson(req);
      } catch (e) {
        return json(e.codigo || 400, { error: 'solicitud no valida' });
      }
      const r = await this.auth.ingresar(cuerpo.correo, cuerpo.clave, ipCliente(req));
      if (!r.ok && r.motivo === 'bloqueado') {
        return json(429, { error: 'bloqueado', esperaSeg: r.esperaSeg }, { 'Retry-After': String(r.esperaSeg) });
      }
      // Mensaje identico para correo inexistente y clave equivocada.
      if (!r.ok) return json(401, { error: 'credenciales' });
      return json(200, { usuario: r.usuario }, {
        'Set-Cookie': cookieSesion(r.token, { segundos: Math.floor(this.auth.ms / 1000), segura }),
      });
    }

    if (pathname === '/api/salir' && req.method === 'POST') {
      const token = leerCookie(req.headers.cookie);
      this.auth.salir(token);
      // Las conexiones abiertas con esa sesion se cierran en el acto, no al vencer.
      for (const ws of this.wss?.clients || []) if (ws.token === token) ws.close(4401, 'sesion cerrada');
      return json(200, { ok: true }, { 'Set-Cookie': cookieBorrada({ segura }) });
    }

    if (pathname === '/api/sesion' && req.method === 'GET') {
      const usuario = this.auth.validar(leerCookie(req.headers.cookie));
      if (!usuario) return json(401, { error: 'sin sesion' });
      return json(200, { usuario, modoDesarrollo: cfg.modoDesarrollo });
    }

    return json(404, { error: 'no existe' });
  }

  async start() {
    const handler = async (req, res) => {
      // La query se quita PRIMERO. "/?board=1" tiene que resolver a index.html igual que "/";
      // si no, esto intenta leer el directorio web/ como archivo y tumba el proceso.
      let pathname;
      try {
        pathname = decodeURIComponent(req.url.split('?')[0]);
      } catch {
        res.writeHead(400).end('no');
        return;
      }

      // Chequeo de salud para la plataforma. Publico y sin datos de la operacion.
      // Si el canal de radio esta caido responde 200 igual: reiniciar la maquina no arregla una
      // caida de Zello (el adaptador ya se reconecta solo) y reiniciar en bucle lo empeoraria.
      // Solo una base de datos que no responde amerita reiniciar.
      if (pathname === '/salud') {
        let codigo = 200;
        const cuerpo = { ok: true, ...(this.estadoSalud?.() || {}) };
        try {
          this.auth.db.prepare('SELECT 1').get();
        } catch {
          codigo = 503;
          cuerpo.ok = false;
        }
        res.writeHead(codigo, { ...CABECERAS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(cuerpo));
        return;
      }

      if (pathname.startsWith('/api/')) {
        try {
          await this.#api(req, res, pathname);
        } catch (err) {
          console.log('api:', err.message);
          if (!res.headersSent) res.writeHead(500, CABECERAS).end();
        }
        return;
      }

      // Todo lo que no es publico pide sesion. La bitacora en modo demo no tiene datos reales
      // y se puede mostrar sin entrar.
      const esIndice = pathname === '/' || pathname === '/index.html';
      const esDemo = esIndice && /[?&]demo=1/.test(req.url) && /[?&]board=1/.test(req.url);
      if (!PUBLICOS.has(pathname) && !esDemo && !this.auth.validar(leerCookie(req.headers.cookie))) {
        res.writeHead(302, { ...CABECERAS, Location: `/login.html?volver=${encodeURIComponent(volverSeguro(req.url))}`, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }

      let file = path.join(WEB, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(WEB)) {
        res.writeHead(403).end('no');
        return;
      }

      let st;
      try {
        st = fs.statSync(file);
      } catch {
        res.writeHead(404).end('no');
        return;
      }
      if (st.isDirectory()) {
        file = path.join(file, 'index.html');
        if (!fs.existsSync(file)) {
          res.writeHead(404).end('no');
          return;
        }
      }

      res.writeHead(200, {
        ...CABECERAS,
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      const stream = fs.createReadStream(file);
      // Sin esto, un error de lectura emite 'error' sin manejar y mata el servidor.
      stream.on('error', () => {
        res.destroy();
      });
      stream.pipe(res);
    };

    let server;
    if (cfg.https) {
      if (!fs.existsSync(cfg.cert) || !fs.existsSync(cfg.key)) {
        throw new Error(`HTTPS=1 pero no encuentro ${cfg.cert} o ${cfg.key}. Corre: npm run cert`);
      }
      server = https.createServer(
        { cert: fs.readFileSync(cfg.cert), key: fs.readFileSync(cfg.key) },
        handler,
      );
    } else {
      server = http.createServer(handler);
    }

    server.on('error', (err) => console.error('servidor:', err.message));
    this.server = server;

    // El WebSocket es por donde viajan los datos, asi que el candado va aca y no solo en la
    // pagina: sin sesion valida la conexion ni se abre.
    const wss = new WebSocketServer({ noServer: true });
    this.wss = wss;

    server.on('upgrade', (req, socket, head) => {
      // Otra pagina abierta en el mismo navegador no puede usar la sesion de alguien para
      // conectarse (secuestro de WebSocket entre sitios).
      const origen = req.headers.origin;
      if (origen) {
        let host = null;
        try {
          host = new URL(origen).host;
        } catch {}
        if (host !== req.headers.host) return rechazarUpgrade(socket, 403);
      }
      const token = leerCookie(req.headers.cookie);
      const usuario = this.auth.validar(token);
      if (!usuario) return rechazarUpgrade(socket, 401);
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.usuario = usuario;
        ws.token = token;
        wss.emit('connection', ws, req);
      });
    });

    // Una conexion abierta no sobrevive a su sesion: si vence o desactivan al usuario, se cierra.
    this.revision = setInterval(() => {
      for (const ws of wss.clients) if (!this.auth.validar(ws.token)) ws.close(4401, 'sesion vencida');
    }, 30_000);
    this.revision.unref?.();

    wss.on('connection', (ws) => {
      ws.userId = null;
      ws.role = null;

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          // Trozo de audio del hablante actual. Solo de un radio.
          if (ws.role !== 'radio' || !ws.userId) return;
          const buf = this.chunks.get(ws.userId);
          if (buf) buf.push(Buffer.from(data));
          // Relay en vivo a los otros radios: asi el canal se oye como un canal.
          this.#relay(data, ws);
          return;
        }

        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        if (msg.t === 'hello') {
          const quiere = msg.role === 'board' ? 'board' : 'radio';
          const rol = ws.usuario.rol;
          // La bitacora la ven admin y supervisor. Un usuario de radio solo habla.
          const puede = quiere === 'board' ? rol === 'admin' || rol === 'supervisor' : true;
          if (!puede) {
            ws.send(JSON.stringify({ t: 'sin-permiso', role: quiere }));
            ws.close(4403, 'sin permiso');
            return;
          }
          ws.role = quiere;
          // La identidad es la del usuario que entro, no la que diga la URL. Solo en desarrollo
          // se puede elegir, para probar varios radios desde un mismo computador.
          ws.userId = cfg.modoDesarrollo && msg.userId ? String(msg.userId).slice(0, 40) : ws.usuario.nombre;
          (ws.role === 'board' ? this.boards : this.radios).add(ws);
          ws.send(JSON.stringify({ t: 'welcome', userId: ws.userId, usuario: ws.usuario }));
          this.emit('hello', { userId: ws.userId, role: ws.role });
          return;
        }

        if (!ws.role) return; // nada antes del saludo

        if ((msg.t === 'tx-start' || msg.t === 'tx-end') && ws.role !== 'radio') return;

        if (msg.t === 'tx-start') {
          if (this.holder && this.holder !== ws.userId) {
            ws.send(JSON.stringify({ t: 'busy', holder: this.holder }));
            return;
          }
          this.holder = ws.userId;
          this.chunks.set(ws.userId, []);
          this.#announceFloor();
          // P1 / M7: el humano apretó. El agente se calla ya.
          this.emit('tx-start', { userId: ws.userId });
          return;
        }

        if (msg.t === 'tx-end') {
          if (this.holder !== ws.userId) return;
          const parts = this.chunks.get(ws.userId) || [];
          this.chunks.delete(ws.userId);
          this.holder = null;
          this.#announceFloor();
          const audio = Buffer.concat(parts);
          if (audio.length > 0) {
            this.emit('tx-end', { userId: ws.userId, audio, mime: msg.mime || 'audio/webm' });
          } else {
            this.emit('floor-free');
          }
          return;
        }

        if (msg.t === 'close-item') {
          if (ws.role !== 'board') return;
          this.emit('close-item', { itemId: String(msg.itemId || ''), by: ws.usuario.correo });
          return;
        }

        // Camino de pruebas: transmision de texto, sin grabar audio. Permite probar el
        // arbitro y la maquina de estados antes de tener microfono. No es del producto:
        // solo en modo desarrollo y solo un admin.
        if (msg.t === 'inject-text') {
          if (!cfg.modoDesarrollo || ws.usuario.rol !== 'admin') {
            auditar(this.auth.db, ws.usuario.correo, 'inyeccion_rechazada');
            return;
          }
          const who = msg.userId || ws.userId || 'prueba';
          if (msg.hold) {
            // Simula que alguien apreto PTT: dispara el corte del agente.
            this.holder = who;
            this.#announceFloor();
            this.emit('tx-start', { userId: who });
            setTimeout(() => {
              this.holder = null;
              this.#announceFloor();
              this.emit('tx-text', { userId: who, text: msg.text });
            }, 120);
          } else {
            this.emit('tx-text', { userId: who, text: msg.text });
          }
        }
      });

      ws.on('close', () => {
        this.radios.delete(ws);
        this.boards.delete(ws);
        if (this.holder === ws.userId) {
          this.holder = null;
          this.#announceFloor();
        }
      });
    });

    await new Promise((r) => server.listen(cfg.port, '0.0.0.0', r));
    const esquema = cfg.https ? 'https' : 'http';
    const host = cfg.lanIp || 'localhost';
    return `${esquema}://${host}:${cfg.port}`;
  }

  /** Apagado limpio: avisa a las pantallas y deja de aceptar conexiones. */
  async detener() {
    clearInterval(this.revision);
    for (const ws of this.wss?.clients || []) ws.close(1001, 'servidor reiniciandose');
    if (!this.server) return;
    await new Promise((resolve) => {
      const tope = setTimeout(resolve, 3000);
      this.server.close(() => {
        clearTimeout(tope);
        resolve();
      });
      this.server.closeAllConnections?.();
    });
  }

  #relay(data, from) {
    for (const ws of this.radios) {
      if (ws !== from && ws.readyState === 1) ws.send(data, { binary: true });
    }
  }

  #announceFloor() {
    this.#send({ t: 'floor', holder: this.holder });
  }

  #send(obj) {
    const s = JSON.stringify(obj);
    for (const ws of [...this.radios, ...this.boards]) {
      if (ws.readyState === 1) ws.send(s);
    }
  }

  /** M5 - empuja la bitacora a las pantallas. */
  publish(snapshot) {
    const s = JSON.stringify({ t: 'state', snapshot });
    for (const ws of this.boards) if (ws.readyState === 1) ws.send(s);

    // G1: el estado de silencio va tambien a los radios. Quien apago al agente tiene que
    // poder confirmar que quedo apagado.
    const m = JSON.stringify({ t: 'agent-muted', muted: !!snapshot.agent?.muted });
    for (const ws of this.radios) if (ws.readyState === 1) ws.send(m);
  }

  /**
   * El agente transmite. Devuelve un handle con abort() que corta en seco.
   * La duracion se estima del texto y se topa en maxMs (P1).
   */
  async speak(text, { maxMs } = {}) {
    // PCM en vez de MP3: asi la duracion es exacta, no una estimacion por largo de texto.
    // La version anterior estimaba, se quedaba corta, y pausaba el audio a mitad de frase.
    const pcm = await synthesizePcm(text);
    const duracionMs = Math.round((pcm.length / (SAMPLE_RATE * 2)) * 1000); // 16 bits mono
    const wav = pcmAWav(pcm, SAMPLE_RATE);
    const id = Math.random().toString(36).slice(2);

    const objetivo = maxMs ?? cfg.maxBurstMs;
    if (duracionMs > objetivo) {
      console.warn(`PWA: "${text}" dura ${duracionMs}ms, mas que el objetivo de ${objetivo}ms. Acorta el texto.`);
    }

    this.#send({ t: 'agent-speak', id, text });
    for (const ws of this.radios) if (ws.readyState === 1) ws.send(wav, { binary: true });

    let settle;
    const done = new Promise((r) => (settle = r));
    // Termina cuando termina el audio de verdad, con un margen para la red y el buffer.
    const timer = setTimeout(() => finish('fin'), duracionMs + 250);

    const finish = (why) => {
      clearTimeout(timer);
      if (this.agentAbort?.id !== id) return;
      this.agentAbort = null;
      this.#send({ t: 'agent-stop', id, why });
      settle(why);
    };

    this.agentAbort = { id, abort: () => finish('cortado') };
    return { abort: () => this.agentAbort?.abort(), done };
  }
}
