import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { cfg } from '../config.js';

const client = new OpenAI();

/**
 * M3 - Transcripcion por transmision.
 *
 * El boton PTT ya segmento el audio: cada llamada recibe UN bloque cerrado, con remitente
 * y hora. Por eso no hay streaming, ni VAD, ni diarizacion. Ese es el regalo del medio.
 *
 * M9 - El buffer entra, se usa y se descarta. Nunca se escribe a disco ni se retorna.
 */
export async function transcribe(audioBuffer, mime = 'audio/webm') {
  const ext = mime.includes('wav') ? 'wav' : mime.includes('mp4') ? 'mp4' : 'webm';
  const file = await toFile(audioBuffer, `tx.${ext}`, { type: mime });

  const res = await client.audio.transcriptions.create({
    file,
    model: cfg.stt,
    language: 'es',
    prompt:
      'Radio de obra de construccion en Colombia. Jerga: torre, vaciado, formaleta, ' +
      'retro, grua, cuadrilla, piso, sotano, HSE, novedad, copiado, QAP.',
  });

  return (res.text || '').trim();
}

const CLASSIFY_SYSTEM = `Eres el clasificador de un agente que escucha un canal de radio de obra.
Clasificas UNA transmision. Responde JSON y nada mas.

Campos:
- type: "peticion" | "respuesta" | "cierre" | "reporte" | "ruido"
  peticion  = alguien pide algo a alguien y espera accion
  respuesta = alguien contesta o atiende una peticion previa
  cierre    = alguien declara algo terminado
  reporte   = informa un hecho sin pedir nada
  ruido     = saludo, chiste, prueba de radio, ininteligible
- to: a quien va dirigido, o null
- subject: de que se trata, en 8 palabras o menos, en espanol
- resolvesSubject: si es respuesta o cierre, el asunto que resuelve; si no, null
- confidence: 0 a 1, que tan seguro estas de la clasificacion Y de haber entendido el audio

Reglas duras:
- Si el texto llega cortado, con ruido o sin sentido, confidence BAJA. No adivines.
- Una pregunta retorica o una queja no es peticion.
- Nunca completes informacion que no este dicha.
- En radio, una transmision que empieza por "copiado", "copio", "enterado", "recibido" o
  "QSL" es casi siempre una RESPUESTA a algo anterior, aunque despues mencione una accion.
  "Copiado, HSE sube al 6" es respuesta, no peticion nueva.
- Confirmar que se va a hacer algo es respuesta. Pedir que alguien lo haga es peticion.`;

/** M4 - Extraccion a estado, con nivel de confianza. */
export async function classify(text) {
  const res = await client.chat.completions.create({
    model: cfg.extract,
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      { role: 'system', content: CLASSIFY_SYSTEM },
      { role: 'user', content: text || '(sin texto)' },
    ],
  });

  try {
    const p = JSON.parse(res.choices[0].message.content);
    const subject = (p.subject || '(sin asunto)').trim();
    return {
      type: p.type || 'ruido',
      to: p.to ?? null,
      // El modelo devuelve el asunto con mayuscula inicial inconsistente y la bitacora
      // se va a filmar. Se normaliza aca, no en la vista.
      subject: subject.charAt(0).toUpperCase() + subject.slice(1),
      resolvesSubject: p.resolvesSubject ?? null,
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
    };
  } catch {
    return { type: 'ruido', to: null, subject: '(no parseado)', resolvesSubject: null, confidence: 0 };
  }
}

/**
 * M7b - El veredicto de la interrupcion.
 *
 * El agente estaba diciendo un aviso sobre `item` y un humano lo corto. La pregunta es
 * una sola: lo que dijo el humano RESPONDE eso, o era de otro tema.
 */
export async function answersItem(incomingText, item) {
  const res = await client.chat.completions.create({
    model: cfg.extract,
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `Un agente de radio estaba transmitiendo un aviso sobre un pendiente y un humano lo interrumpio.
Decide si la transmision del humano atiende, responde o cierra ESE pendiente, o si hablaba de otra cosa.

Responde JSON: { "answers": boolean, "confidence": number, "razon": string }

- answers true solo si la transmision atiende ese pendiente concreto.
- Si la transmision es de otro tema, una emergencia ajena, o no se entiende: answers false.
- Si no puedes determinarlo con seguridad, baja confidence. No adivines.`,
      },
      {
        role: 'user',
        content: `PENDIENTE: ${item.subject}\nPEDIDO POR: ${item.from}\nDIRIGIDO A: ${item.to || 'sin destinatario'}\nFRASE ORIGINAL: "${item.sourceText}"\n\nTRANSMISION QUE INTERRUMPIO: "${incomingText}"`,
      },
    ],
  });

  try {
    const p = JSON.parse(res.choices[0].message.content);
    return {
      answers: !!p.answers,
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
      razon: p.razon || '',
    };
  } catch {
    return { answers: false, confidence: 0, razon: 'no parseado' };
  }
}

/**
 * Empareja una respuesta del canal con el pendiente que resuelve.
 *
 * Antes esto se hacia por coincidencia de texto, y con varios pendientes abiertos no
 * acertaba: quedaban abiertos pendientes que el canal ya habia resuelto, y el relevo de
 * turno los leia como si siguieran vivos. Es el mismo problema que `answersItem` resuelve
 * para la interrupcion, asi que recibe el mismo trato.
 *
 * Devuelve { itemId: string|null, confidence }. Conservador: si duda, no cierra nada.
 */
export async function matchAnswer(incomingText, openItems) {
  if (openItems.length === 0) return { itemId: null, confidence: 0 };

  const lista = openItems
    .map((i, n) => `${n + 1}. [${i.id}] "${i.subject}" (pedido por ${i.from}: "${i.sourceText}")`)
    .join('\n');

  const res = await client.chat.completions.create({
    model: cfg.extract,
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `En un canal de radio de obra hay pendientes abiertos. Llega una transmision que
parece una respuesta o un cierre. Decide a CUAL de los pendientes corresponde, si a alguno.

Responde JSON: { "itemId": string|null, "confidence": number, "razon": string }

- itemId debe ser exactamente uno de los identificadores entre corchetes, o null.
- Si la transmision no corresponde claramente a ninguno, itemId null.
- Si podria ser varios, itemId null y confidence baja. Cerrar el pendiente equivocado es
  peor que no cerrar ninguno.`,
      },
      { role: 'user', content: `PENDIENTES ABIERTOS:\n${lista}\n\nTRANSMISION: "${incomingText}"` },
    ],
  });

  try {
    const p = JSON.parse(res.choices[0].message.content);
    const valido = openItems.some((i) => i.id === p.itemId);
    return {
      itemId: valido ? p.itemId : null,
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
      razon: p.razon || '',
    };
  } catch {
    return { itemId: null, confidence: 0, razon: 'no parseado' };
  }
}

/** M6 - Redaccion del aviso. Tiene que caber en 3 segundos hablados. */
export function avisoText(item) {
  return `Pendiente. ${item.subject}. Sin respuesta.`;
}

/** M8 - Relevo de turno: maximo 3 items, cada uno en una rafaga aparte. */
export function handoverBursts(items) {
  return items.slice(0, 3).map((i, n) => `Abierto ${n + 1}. ${i.subject}.`);
}

/**
 * TTS. Tono de despachador: plano, corto, sin cortesia.
 * P3: el agente no suena seguro cuando no lo esta, y por eso nunca sintetiza un item
 * que no haya pasado el umbral de confianza (eso lo garantiza state.js).
 */
export async function synthesize(text) {
  const res = await client.audio.speech.create({
    model: cfg.tts,
    voice: cfg.voice,
    input: text,
    instructions:
      'Despachador de radio. Plano, rapido, sin emocion y sin cortesia. Nada de saludos.',
    response_format: 'mp3',
  });
  return Buffer.from(await res.arrayBuffer());
}
