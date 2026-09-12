import OpusScript from 'opusscript';

/**
 * Codec para hablar y escuchar en un canal de Zello.
 *
 * Zello no manda un archivo: manda **paquetes Opus crudos**, sin contenedor. Concatenarlos
 * no produce nada que un transcriptor pueda abrir. Y al reves, para transmitir hay que
 * entregar paquetes Opus, no el MP3 que sale del TTS.
 *
 * Este modulo es ese puente, y en las dos direcciones:
 *   entra Opus  -> se decodifica a PCM -> se envuelve en WAV -> se transcribe
 *   sale PCM    -> se codifica a Opus  -> se manda paquete por paquete
 *
 * Se usa opusscript, que es JS puro: no hace falta compilador en Windows.
 *
 * Nota de diseno: se trabaja a 24 kHz porque es lo que entrega el TTS de OpenAI en formato
 * pcm, y Opus acepta 24 kHz nativamente. Asi se evita resamplear, que es una fuente de
 * ruido y de bugs que no necesitamos hoy.
 */

export const SAMPLE_RATE = 24000;
export const FRAME_MS = 60; // Opus admite 2.5, 5, 10, 20, 40 y 60
export const FRAMES_POR_PAQUETE = 1;

const muestrasPorTrama = (sampleRate, frameMs) => Math.round((sampleRate * frameMs) / 1000);

/**
 * El codec_header de Zello: 4 bytes, sample_rate en uint16 little endian, luego
 * frames_per_packet y frame_size_ms en un byte cada uno. Va en base64.
 */
export function codecHeader(sampleRate = SAMPLE_RATE, framesPorPaquete = FRAMES_POR_PAQUETE, frameMs = FRAME_MS) {
  const b = Buffer.alloc(4);
  b.writeUInt16LE(sampleRate, 0);
  b.writeUInt8(framesPorPaquete, 2);
  b.writeUInt8(frameMs, 3);
  return b.toString('base64');
}

/** Lee el codec_header que manda Zello al abrir un stream entrante. */
export function leerCodecHeader(base64) {
  try {
    const b = Buffer.from(base64, 'base64');
    if (b.length < 4) return { sampleRate: SAMPLE_RATE, framesPorPaquete: 1, frameMs: FRAME_MS };
    return {
      sampleRate: b.readUInt16LE(0) || SAMPLE_RATE,
      framesPorPaquete: b.readUInt8(2) || 1,
      frameMs: b.readUInt8(3) || FRAME_MS,
    };
  } catch {
    return { sampleRate: SAMPLE_RATE, framesPorPaquete: 1, frameMs: FRAME_MS };
  }
}

/** Envuelve PCM de 16 bits mono en un WAV, que si es un archivo que se puede transcribir. */
export function pcmAWav(pcm, sampleRate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); // tamano del bloque fmt
  h.writeUInt16LE(1, 20); // PCM sin comprimir
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28); // bytes por segundo
  h.writeUInt16LE(2, 32); // bytes por bloque
  h.writeUInt16LE(16, 34); // bits por muestra
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/**
 * Paquetes Opus de Zello -> WAV listo para transcribir.
 * Un paquete corrupto no tumba la transmision completa: se salta y se sigue.
 */
export function opusAWav(paquetes, { sampleRate = SAMPLE_RATE } = {}) {
  if (!paquetes.length) return null;
  const dec = new OpusScript(sampleRate, 1, OpusScript.Application.VOIP);
  const trozos = [];
  let fallidos = 0;
  try {
    for (const p of paquetes) {
      try {
        trozos.push(Buffer.from(dec.decode(p)));
      } catch {
        fallidos++;
      }
    }
  } finally {
    dec.delete?.();
  }
  if (trozos.length === 0) return null;
  return { wav: pcmAWav(Buffer.concat(trozos), sampleRate), fallidos };
}

/**
 * PCM del TTS -> paquetes Opus para transmitir.
 * La ultima trama se rellena con silencio: Opus exige tramas completas.
 */
export function pcmAOpus(pcm, { sampleRate = SAMPLE_RATE, frameMs = FRAME_MS } = {}) {
  const muestras = muestrasPorTrama(sampleRate, frameMs);
  const bytesPorTrama = muestras * 2; // 16 bits mono
  const enc = new OpusScript(sampleRate, 1, OpusScript.Application.AUDIO);
  const paquetes = [];
  try {
    for (let off = 0; off < pcm.length; off += bytesPorTrama) {
      let trama = pcm.subarray(off, off + bytesPorTrama);
      if (trama.length < bytesPorTrama) {
        const rellena = Buffer.alloc(bytesPorTrama);
        trama.copy(rellena);
        trama = rellena;
      }
      paquetes.push(Buffer.from(enc.encode(trama, muestras)));
    }
  } finally {
    enc.delete?.();
  }
  return paquetes;
}

/** Arma el paquete binario de Zello: type(8)=0x01, stream_id(32), packet_id(32), datos. */
export function paqueteZello(streamId, packetId, datos) {
  const h = Buffer.alloc(9);
  h.writeUInt8(0x01, 0);
  h.writeUInt32BE(streamId, 1); // orden de red
  h.writeUInt32BE(packetId, 5);
  return Buffer.concat([h, datos]);
}

/** Cuantos milisegundos de audio representan estos paquetes. */
export function duracionMs(paquetes, frameMs = FRAME_MS) {
  return paquetes.length * frameMs;
}
