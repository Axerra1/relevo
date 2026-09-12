/**
 * Genera un certificado propio para servir HTTPS en la red local.
 *
 *   npm run cert
 *
 * Para que el microfono funcione en un celular. El navegador solo entrega getUserMedia en
 * contexto seguro, y http://10.x.x.x no lo es. Con HTTPS si lo es, aunque el certificado no
 * lo firme nadie: hay que aceptar la advertencia una vez por dispositivo.
 *
 * El certificado lleva la IP de red de esta maquina en el SAN. Si cambias de wifi, la IP
 * cambia y hay que volver a correr esto.
 */
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'certs';

function ipsLocales() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

function buscarOpenssl() {
  const candidatos = ['openssl'];

  // Git para Windows trae openssl. En vez de adivinar la unidad y la carpeta, se le
  // pregunta a git donde vive: --exec-path devuelve <raiz>/mingw64/libexec/git-core.
  try {
    const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
    const raiz = exec.replace(/[/\\](mingw64|usr|mingw32)[/\\].*$/i, '');
    if (raiz && raiz !== exec) {
      for (const sub of ['mingw64\\bin', 'usr\\bin', 'mingw32\\bin']) {
        candidatos.push(path.join(raiz, sub, 'openssl.exe'));
      }
    }
  } catch {}

  for (const base of ['C:\\Program Files\\Git', 'C:\\Program Files (x86)\\Git']) {
    candidatos.push(path.join(base, 'mingw64\\bin\\openssl.exe'));
    candidatos.push(path.join(base, 'usr\\bin\\openssl.exe'));
  }

  for (const c of candidatos) {
    try {
      execFileSync(c, ['version'], { stdio: 'pipe' });
      return c;
    } catch {}
  }
  return null;
}

const ips = ipsLocales();
if (ips.length === 0) {
  console.error('\n  No encontre ninguna IP de red. Conectate al wifi y vuelve a intentar.\n');
  process.exit(1);
}

const openssl = buscarOpenssl();
if (!openssl) {
  console.error('\n  No encontre openssl. Viene con Git para Windows.');
  console.error('  Si lo tienes instalado en otra ruta, agregalo al PATH.\n');
  process.exit(1);
}

fs.mkdirSync(DIR, { recursive: true });

const san = [...ips.map((ip) => `IP:${ip}`), 'IP:127.0.0.1', 'DNS:localhost'].join(',');

console.log(`\n  openssl: ${openssl}`);
console.log(`  IPs incluidas: ${ips.join(', ')}\n`);

execFileSync(
  openssl,
  [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '14',
    '-keyout', path.join(DIR, 'key.pem'),
    '-out', path.join(DIR, 'cert.pem'),
    '-subj', '/CN=relevo',
    '-addext', `subjectAltName=${san}`,
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

console.log('  certs/cert.pem y certs/key.pem generados.\n');
console.log('  Para arrancar en HTTPS, en .env pon:');
console.log('    HTTPS=1');
console.log(`    LAN_IP=${ips[0]}`);
console.log('\n  Y desde el celular, en la misma wifi:');
for (const ip of ips) {
  console.log(`    https://${ip}:8787/?user=torre3`);
}
console.log('\n  La primera vez el navegador va a advertir que el certificado no es de fiar.');
console.log('  Es normal: lo firmamos nosotros. Toca Avanzado y Continuar.\n');
