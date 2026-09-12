/**
 * Prueba aislada del canal de Zello. Antes de meter a Relevo, hay que saber si el audio
 * fluye en las dos direcciones.
 *
 *   node scripts/zello-test.js           escucha 40 segundos
 *   node scripts/zello-test.js --hablar  escucha y transmite una prueba a los 8 segundos
 *
 * No toca la bitacora ni el arbitro. Solo el canal.
 */
import { ZelloAdapter } from '../src/adapters/zello.js';
import { cfg, assertKey } from '../src/config.js';
import { transcribe } from '../src/core/ai.js';

const hablar = process.argv.includes('--hablar');
if (hablar) assertKey(); // transmitir necesita TTS

const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + 's';

console.log('\n  Configuracion:');
console.log(`    canal:   ${cfg.zello.channel || '(VACIO — falta ZELLO_CHANNEL)'}`);
console.log(`    red:     ${cfg.zello.network || 'Friends and Family'}`);
console.log(`    token:   ${cfg.zello.token ? cfg.zello.token.length + ' chars' : '(vacio)'}`);
console.log(`    usuario: ${cfg.zello.username || '(vacio — entrarias anonimo, solo escuchar)'}`);
console.log('');

const z = new ZelloAdapter();

z.on('tx-start', ({ userId }) => console.log(`${el()} >> ${userId} empezo a transmitir`));

z.on('tx-end', async ({ userId, audio, mime }) => {
  console.log(`${el()} << ${userId} termino. WAV de ${audio.length} bytes (${mime})`);
  try {
    const texto = await transcribe(audio, mime);
    console.log(`${el()}    transcripcion: "${texto}"`);
  } catch (e) {
    console.log(`${el()}    no pude transcribir: ${e.message}`);
  }
});

z.on('floor-free', () => console.log(`${el()} -- canal libre`));

try {
  await z.start();
  console.log(`${el()} conectado. Habla desde la app de Zello en ese canal.\n`);
} catch (e) {
  console.error(`\n  FALLO EL LOGON: ${e.message}\n`);
  console.error('  Revisa, en este orden:');
  console.error('   1. ZELLO_CHANNEL escrito exacto como aparece en la app');
  console.error('   2. Para Friends and Family: ZELLO_TOKEN de developers.zello.com,');
  console.error('      mas ZELLO_USERNAME y ZELLO_PASSWORD (sin ellos entras anonimo');
  console.error('      y no puedes transmitir)');
  console.error('   3. Para Zello Work: ZELLO_NETWORK con el nombre de la red,');
  console.error('      ZELLO_USERNAME y ZELLO_PASSWORD, y ZELLO_TOKEN vacio');
  console.error('   4. Que tu cuenta este dentro de ese canal\n');
  process.exit(1);
}

if (hablar) {
  setTimeout(async () => {
    console.log(`${el()} transmitiendo una prueba...`);
    try {
      const h = await z.speak('Prueba de Relevo. Uno, dos, tres.', { maxMs: 3000 });
      const porque = await h.done;
      console.log(`${el()} transmision terminada: ${porque}`);
      console.log(`${el()} si lo escuchaste en el celular, el camino de salida funciona.\n`);
    } catch (e) {
      console.error(`${el()} FALLO AL TRANSMITIR: ${e.message}\n`);
    }
  }, 8000);
}

const argSeg = process.argv.find((a) => a.startsWith('--segundos='));
const duracionMs = argSeg ? Number(argSeg.split('=')[1]) * 1000 : 40000;

setTimeout(() => {
  console.log(`\n${el()} fin de la prueba.\n`);
  process.exit(0);
}, duracionMs);
