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

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

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
  constructor() {
    super();
    this.radios = new Set();
    this.boards = new Set();
    this.holder = null; // userId que tiene el canal
    this.chunks = new Map(); // userId -> Buffer[]
    this.agentAbort = null;
  }

  get floorBusy() {
    return this.holder !== null;
  }

  async start() {
    const handler = (req, res) => {
      // La query se quita PRIMERO. "/?board=1" tiene que resolver a index.html igual que "/";
      // si no, esto intenta leer el directorio web/ como archivo y tumba el proceso.
      let pathname;
      try {
        pathname = decodeURIComponent(req.url.split('?')[0]);
      } catch {
        res.writeHead(400).end('no');
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

      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
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

    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      ws.userId = null;
      ws.role = null;

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          // Trozo de audio del hablante actual.
          if (!ws.userId) return;
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
          ws.userId = msg.userId || 'desconocido';
          ws.role = msg.role || 'radio';
          (ws.role === 'board' ? this.boards : this.radios).add(ws);
          ws.send(JSON.stringify({ t: 'welcome', userId: ws.userId }));
          this.emit('hello', { userId: ws.userId, role: ws.role });
          return;
        }

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
          this.emit('close-item', { itemId: msg.itemId, by: ws.userId });
          return;
        }

        // Camino de pruebas: transmision de texto, sin grabar audio. Permite probar el
        // arbitro y la maquina de estados antes de tener microfono. No es del producto.
        if (msg.t === 'inject-text') {
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
