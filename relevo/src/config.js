import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Carpeta del proyecto (relevo/). El .env se lee desde aca, se corra el comando donde se corra.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(RAIZ, '.env') });

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const cfg = {
  adapter: process.env.CHANNEL_ADAPTER || 'pwa',
  port: num(process.env.PORT, 8787),

  /**
   * HTTPS con certificado propio. Hace falta para que el microfono funcione en un celular:
   * el navegador solo lo entrega en contexto seguro, y http://10.x.x.x no lo es. Con esto
   * si lo es, aunque el certificado no lo firme nadie y haya que aceptar la advertencia.
   */
  https: process.env.HTTPS === '1',

  /**
   * En la nube el HTTPS lo pone la plataforma: la app recibe HTTP por dentro. Con esto en 1:
   *  - la cookie de sesion igual sale con Secure, porque el usuario si esta en HTTPS
   *  - la IP del cliente se toma de la cabecera del proxy. Sin eso, todos los pedidos
   *    parecerian venir de la misma IP (la del proxy) y 20 claves equivocadas de cualquiera
   *    bloquearian a todo el mundo.
   * Fuera de un proxy va en 0: ahi la cabecera la puede inventar cualquiera.
   */
  detrasDeProxy: process.env.DETRAS_DE_PROXY === '1',
  cert: process.env.CERT_FILE || 'certs/cert.pem',
  key: process.env.KEY_FILE || 'certs/key.pem',
  lanIp: process.env.LAN_IP || '',

  // Base de datos y acceso. El archivo contiene datos personales de los trabajadores: nunca
  // se versiona y se borra lo viejo segun la retencion.
  // Relativo a la carpeta del proyecto, no a donde se corra el comando: si no, un script
  // lanzado desde otra carpeta crearia una base nueva y vacia sin avisar.
  dbArchivo: path.resolve(RAIZ, process.env.DB_ARCHIVO || 'datos/relevo.db'),
  sesionHoras: num(process.env.SESION_HORAS, 12), // un turno
  retencionDias: num(process.env.RETENCION_DIAS, 90), // TBD con el abogado (decision D12)
  // Solo para desarrollo y demos: habilita inyectar texto sin microfono y elegir la identidad
  // del radio por la URL. En produccion va en 0.
  modoDesarrollo: process.env.MODO_DESARROLLO === '1',

  // M6
  unansweredMs: num(process.env.UNANSWERED_MS, 20000),

  // P1 / M7 / P4
  maxBurstMs: num(process.env.MAX_BURST_MS, 3000),
  maxTxPerHour: num(process.env.MAX_TX_PER_HOUR, 2),
  maxRetries: num(process.env.MAX_RETRIES, 1),
  minConfidence: num(process.env.MIN_CONFIDENCE, 0.6),

  stt: process.env.STT_MODEL || 'gpt-4o-mini-transcribe',
  extract: process.env.EXTRACT_MODEL || 'gpt-4o-mini',
  tts: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
  voice: process.env.TTS_VOICE || 'onyx',

  zello: {
    ws: process.env.ZELLO_WS || 'wss://zello.io/ws',
    // Si network esta puesto, es Zello Work y la URL se arma con la red.
    network: process.env.ZELLO_NETWORK || '',
    token: process.env.ZELLO_TOKEN || '',
    username: process.env.ZELLO_USERNAME || '',
    password: process.env.ZELLO_PASSWORD || '',
    channel: process.env.ZELLO_CHANNEL || '',
  },
};

export function assertKey() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('\n  Falta OPENAI_API_KEY. Copia .env.example a .env y llenala.\n');
    process.exit(1);
  }
}
