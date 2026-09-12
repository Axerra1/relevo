import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { cfg } from '../config.js';
import { synthesize } from '../core/ai.js';

/**
 * ============================================================================
 *  ESTADO REAL: NO VERIFICADO. Escrito sin credenciales, nunca ejecutado
 *  contra un canal de Zello. No afirmes en el pitch que corre sobre Zello
 *  hasta haber visto audio fluir en las dos direcciones.
 *
 *  Lo que creemos correcto:  el handshake JSON (logon, on_channel_status) y los
 *                            eventos on_stream_start / on_stream_stop.
 *  Lo que NO esta resuelto:  la paquetizacion Opus de salida. Zello espera frames
 *                            Opus con cabecera binaria propia; nosotros producimos
 *                            MP3 desde el TTS. Falta el transcodificado.
 *
 *  Recomendacion: usa `ts-zello` (npm), que ya resuelve el codec. Esta clase sirve
 *  para entender el contrato y para el handshake.
 *  Protocolo: github.com/zelloptt/zello-channel-api
 * ============================================================================
 *
 * Cumple el mismo contrato que PwaAdapter:
 *   emite 'tx-start' { userId }
 *   emite 'tx-end'   { userId, audio, mime }
 *   get floorBusy
 *   speak(text, { maxMs }) -> { abort(), done }
 *   publish(snapshot)
 *
 * Nota de diseno que si esta confirmada y es la que importa: `on_stream_start` trae el
 * campo `from` con el usuario de la red. Eso es M2 y P2: la identidad del hablante llega
 * firmada por Zello, asi que Relevo nunca necesita huella vocal.
 */
export class ZelloAdapter extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.seq = 0;
    this.streams = new Map(); // streamId -> { userId, chunks }
    this.holder = null;
    this.agentAbort = null;
  }

  get floorBusy() {
    return this.holder !== null;
  }

  async start() {
    if (!cfg.zello.token) {
      throw new Error('ZELLO_TOKEN vacio. Pon CHANNEL_ADAPTER=pwa o consigue el token.');
    }
    this.ws = new WebSocket(cfg.zello.ws);

    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });

    this.#send({
      command: 'logon',
      auth_token: cfg.zello.token,
      username: cfg.zello.username,
      password: cfg.zello.password,
      channel: cfg.zello.channel,
    });

    this.ws.on('message', (data, isBinary) => {
      if (isBinary) return this.#onBinary(Buffer.from(data));
      let m;
      try { m = JSON.parse(data.toString()); } catch { return; }
      this.#onJson(m);
    });

    return null; // no hay UI local: el canal es Zello
  }

  #send(obj) {
    obj.seq = ++this.seq;
    this.ws.send(JSON.stringify(obj));
  }

  #onJson(m) {
    if (m.command === 'on_channel_status') {
      console.log(`Zello: canal ${m.channel} ${m.status}, ${m.users_online} en linea`);
      return;
    }

    if (m.command === 'on_stream_start') {
      // M2: la identidad viene firmada por la red. No hay biometria en ninguna parte.
      const userId = m.from || 'desconocido';
      this.streams.set(m.stream_id, { userId, chunks: [] });
      this.holder = userId;
      this.emit('tx-start', { userId });
      return;
    }

    if (m.command === 'on_stream_stop') {
      const s = this.streams.get(m.stream_id);
      this.streams.delete(m.stream_id);
      this.holder = null;
      if (!s) return this.emit('floor-free');
      const audio = Buffer.concat(s.chunks);
      if (audio.length) this.emit('tx-end', { userId: s.userId, audio, mime: 'audio/ogg' });
      else this.emit('floor-free');
      return;
    }

    if (m.command === 'on_error') console.error('Zello error:', m.error);
  }

  #onBinary(buf) {
    // NO VERIFICADO: cabecera de 9 bytes -> type(1) + stream_id(4 BE) + packet_id(4 BE).
    if (buf.length < 9) return;
    const streamId = buf.readUInt32BE(1);
    const s = this.streams.get(streamId);
    if (s) s.chunks.push(buf.subarray(9));
  }

  /**
   * P1 / M7: el corte. abort() manda stop_stream, que es lo que libera el canal.
   * NO VERIFICADO: falta transcodificar el MP3 del TTS a frames Opus.
   */
  async speak(text, { maxMs } = {}) {
    const mp3 = await synthesize(text);
    void mp3; // TODO: transcodificar a Opus antes de enviar frames

    this.#send({ command: 'start_stream', type: 'audio', codec: 'opus' });
    console.warn('ZelloAdapter.speak: sin transcodificado a Opus. No sale audio todavia.');

    let settle;
    const done = new Promise((r) => (settle = r));
    const estMs = Math.min(maxMs ?? cfg.maxBurstMs, 350 + text.length * 62);
    const timer = setTimeout(() => finish('fin'), estMs);

    const finish = (why) => {
      clearTimeout(timer);
      if (!this.agentAbort) return;
      this.agentAbort = null;
      try { this.#send({ command: 'stop_stream' }); } catch {}
      settle(why);
    };

    this.agentAbort = { abort: () => finish('cortado') };
    return { abort: () => this.agentAbort?.abort(), done };
  }

  publish() {
    // La bitacora no vive en Zello. Corre la PWA en modo board aparte si la quieres en pantalla.
  }
}
