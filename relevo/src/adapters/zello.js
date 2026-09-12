import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { cfg } from '../config.js';
import { synthesizePcm } from '../core/ai.js';
import {
  SAMPLE_RATE,
  FRAME_MS,
  codecHeader,
  leerCodecHeader,
  opusAWav,
  pcmAOpus,
  paqueteZello,
} from '../core/opus.js';

/**
 * Adaptador de canal contra una red PTT real: la Zello Channel API.
 *
 * Cumple el mismo contrato que PwaAdapter, asi que el nucleo no sabe en cual esta corriendo:
 *   emite 'tx-start' { userId }                 alguien empezo a transmitir
 *   emite 'tx-end'   { userId, audio, mime }    termino; audio es un WAV listo para transcribir
 *   get floorBusy                               el canal esta tomado
 *   speak(text, { maxMs }) -> { abort(), done } el agente transmite
 *   publish(snapshot)                           no aplica: la bitacora no vive en Zello
 *
 * Lo que importa de diseno, y es la razon por la que este entorno es el correcto:
 * `on_stream_start` trae el campo `from` con el usuario de la red. La identidad del hablante
 * llega **firmada por Zello**, antes del audio. Relevo nunca necesita huella vocal, y la
 * objecion de biometria como dato sensible se cae por arquitectura.
 *
 * Protocolo: github.com/zelloptt/zello-channel-api
 */
export class ZelloAdapter extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.seq = 0;
    this.pendientes = new Map(); // seq -> { resolve, reject }
    this.streams = new Map(); // stream_id entrante -> { userId, paquetes, sampleRate }
    this.holder = null;
    this.tx = null; // transmision del agente en curso
  }

  get floorBusy() {
    return this.holder !== null;
  }

  get url() {
    // Consumer: wss://zello.io/ws · Zello Work: wss://zellowork.io/ws/<red>
    if (cfg.zello.network) return `wss://zellowork.io/ws/${cfg.zello.network}`;
    return cfg.zello.ws;
  }

  async start() {
    const esWork = !!cfg.zello.network;
    if (!cfg.zello.channel) throw new Error('Falta ZELLO_CHANNEL en .env');
    if (!esWork && !cfg.zello.token) {
      throw new Error('Falta ZELLO_TOKEN (Friends and Family) o ZELLO_NETWORK (Zello Work)');
    }
    if (esWork && (!cfg.zello.username || !cfg.zello.password)) {
      throw new Error('Zello Work necesita ZELLO_USERNAME y ZELLO_PASSWORD');
    }

    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });

    this.ws.on('message', (data, isBinary) => {
      if (isBinary) return this.#onBinary(Buffer.from(data));
      let m;
      try {
        m = JSON.parse(data.toString());
      } catch {
        return;
      }
      this.#onJson(m);
    });

    this.ws.on('close', () => console.error('Zello: conexion cerrada'));

    // `channels` es un arreglo, no una cadena. Es el error clasico con esta API.
    const logon = {
      command: 'logon',
      channels: [cfg.zello.channel],
    };
    // En Zello Work la autenticacion es usuario y clave de la red; el auth_token es de la
    // red Friends and Family y mandarlo aca solo confunde al servidor.
    if (!esWork && cfg.zello.token) logon.auth_token = cfg.zello.token;
    if (cfg.zello.username) logon.username = cfg.zello.username;
    if (cfg.zello.password) logon.password = cfg.zello.password;

    const res = await this.#enviarEsperando(logon);
    if (!res.success) throw new Error(`Zello rechazo el logon: ${res.error || 'sin detalle'}`);
    console.log(`Zello: conectado a "${cfg.zello.channel}" en ${this.url}`);

    return null; // el canal es Zello, no hay UI local que ofrecer
  }

  // ------------------------------------------------------------------ protocolo

  #enviar(obj) {
    obj.seq = ++this.seq;
    this.ws.send(JSON.stringify(obj));
    return obj.seq;
  }

  /** Manda un comando y espera la respuesta que trae el mismo seq. */
  #enviarEsperando(obj, msTope = 10000) {
    const seq = this.#enviar(obj);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pendientes.delete(seq);
        reject(new Error(`Zello no respondio a "${obj.command}" en ${msTope}ms`));
      }, msTope);
      this.pendientes.set(seq, {
        resolve: (v) => {
          clearTimeout(t);
          resolve(v);
        },
      });
    });
  }

  #onJson(m) {
    // Respuesta a un comando nuestro
    if (m.seq !== undefined && this.pendientes.has(m.seq)) {
      this.pendientes.get(m.seq).resolve(m);
      this.pendientes.delete(m.seq);
      return;
    }

    if (m.command === 'on_channel_status') {
      console.log(`Zello: canal ${m.channel} ${m.status}, ${m.users_online ?? '?'} en linea`);
      return;
    }

    if (m.command === 'on_stream_start') {
      const userId = m.from || 'desconocido';
      const { sampleRate } = leerCodecHeader(m.codec_header);
      this.streams.set(m.stream_id, { userId, paquetes: [], sampleRate });
      this.holder = userId;
      // P1 / M7: alguien tomo el canal. El agente se calla ya.
      this.emit('tx-start', { userId });
      return;
    }

    if (m.command === 'on_stream_stop') {
      const s = this.streams.get(m.stream_id);
      this.streams.delete(m.stream_id);
      if (this.streams.size === 0) this.holder = null;
      if (!s) return this.emit('floor-free');

      const r = opusAWav(s.paquetes, { sampleRate: s.sampleRate });
      if (!r) {
        console.error(`Zello: no pude decodificar el audio de ${s.userId}`);
        return this.emit('floor-free');
      }
      if (r.fallidos) console.error(`Zello: ${r.fallidos} paquetes Opus ilegibles, sigo con el resto`);
      this.emit('tx-end', { userId: s.userId, audio: r.wav, mime: 'audio/wav' });
      return;
    }

    if (m.command === 'on_error' || m.error) {
      console.error('Zello error:', m.error || JSON.stringify(m));
    }
  }

  #onBinary(buf) {
    // type(8)=0x01, stream_id(32), packet_id(32), datos. Orden de red.
    if (buf.length < 9 || buf.readUInt8(0) !== 0x01) return;
    const streamId = buf.readUInt32BE(1);
    const s = this.streams.get(streamId);
    if (s) s.paquetes.push(buf.subarray(9));
  }

  // -------------------------------------------------------------------- hablar

  /**
   * El agente transmite. El pulso de paquetes va al ritmo real del audio (una trama cada
   * FRAME_MS), y abort() detiene el pulso en el acto: eso es el corte a mitad de palabra
   * que exige P1, y aca es literal, porque los paquetes que no se enviaron no existen.
   */
  async speak(text, { maxMs } = {}) {
    const pcm = await synthesizePcm(text);
    const paquetes = pcmAOpus(pcm, { sampleRate: SAMPLE_RATE, frameMs: FRAME_MS });

    // P1: el mensaje se envia COMPLETO. Nunca se recorta el audio.
    //
    // La primera version recortaba a maxMs y el agente decia media frase y se callaba:
    // sonaba roto y encima igual habia ocupado el canal. Lo que protege una emergencia no
    // es un reloj que corta a ciegas, es que el agente se calle en el acto cuando un humano
    // aprieta PTT (eso es abort, y sigue intacto). La brevedad se consigue escribiendo el
    // mensaje corto, no mutilando el sonido.
    //
    // Solo queda una guarda contra un audio desbocado, muy por encima de cualquier aviso.
    const objetivo = maxMs ?? cfg.maxBurstMs;
    const duracion = paquetes.length * FRAME_MS;
    if (duracion > objetivo) {
      console.warn(`Zello: "${text}" dura ${duracion}ms, mas que el objetivo de ${objetivo}ms. Acorta el texto.`);
    }
    const desbocado = Math.max(1, Math.floor((objetivo * 3) / FRAME_MS));
    const aEnviar = paquetes.slice(0, desbocado);

    const res = await this.#enviarEsperando({
      command: 'start_stream',
      channel: cfg.zello.channel,
      type: 'audio',
      codec: 'opus',
      codec_header: codecHeader(SAMPLE_RATE, 1, FRAME_MS),
      packet_duration: FRAME_MS,
    });
    if (!res.success || res.stream_id === undefined) {
      throw new Error(`Zello rechazo start_stream: ${res.error || 'sin detalle'}`);
    }

    const streamId = res.stream_id;
    let settle;
    const done = new Promise((r) => (settle = r));
    const tx = { streamId, cancelado: false, timer: null };
    this.tx = tx;

    const cerrar = (porque) => {
      if (tx.cerrado) return;
      tx.cerrado = true;
      clearTimeout(tx.timer);
      try {
        this.#enviar({ command: 'stop_stream', stream_id: streamId, channel: cfg.zello.channel });
      } catch {}
      if (this.tx === tx) this.tx = null;
      settle(porque);
    };

    let i = 0;
    const pulso = () => {
      if (tx.cancelado) return cerrar('cortado');
      if (i >= aEnviar.length) return cerrar('fin');
      try {
        this.ws.send(paqueteZello(streamId, 0, aEnviar[i]), { binary: true });
      } catch {
        return cerrar('error');
      }
      i++;
      tx.timer = setTimeout(pulso, FRAME_MS);
    };
    pulso();

    return {
      abort: () => {
        tx.cancelado = true;
        clearTimeout(tx.timer);
        cerrar('cortado');
      },
      done,
    };
  }

  publish() {
    // La bitacora no vive en Zello. Para verla en pantalla, corre la PWA en modo board.
  }
}
