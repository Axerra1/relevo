import 'dotenv/config';

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
  cert: process.env.CERT_FILE || 'certs/cert.pem',
  key: process.env.KEY_FILE || 'certs/key.pem',
  lanIp: process.env.LAN_IP || '',

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
