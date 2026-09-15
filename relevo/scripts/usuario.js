/**
 * Administrar usuarios de la bitacora. Se corre en la terminal del servidor.
 *
 *   npm run usuario -- crear                 pregunta todo
 *   npm run usuario -- listar
 *   npm run usuario -- clave <correo>        cambiar la clave (cierra sus sesiones)
 *   npm run usuario -- desactivar <correo>   le quita el acceso (cierra sus sesiones)
 *
 * Roles:
 *   admin       ve la bitacora y administra
 *   supervisor  ve la bitacora y cierra pendientes a mano
 *   radio       solo habla por el radio del navegador; no ve la bitacora
 *
 * La clave se escribe a mano y no se muestra. Nunca se pasa como argumento: quedaria en el
 * historial de la terminal.
 */
import readline from 'node:readline';
import { abrirDb } from '../src/core/db.js';
import { Autenticacion, ROLES, CLAVE_MINIMA } from '../src/core/auth.js';
import { cfg } from '../src/config.js';

const [cmd, arg] = process.argv.slice(2);

function preguntar(texto, { oculto = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      rl._writeToOutput = (s) => {
        if (!rl.silencio) return rl.output.write(s);
        if (s.includes('\n') || s.includes('\r')) rl.output.write('\n');
      };
    }
    rl.question(texto, (r) => {
      rl.close();
      resolve(r);
    });
    if (oculto) rl.silencio = true;
  });
}

async function pedirClave() {
  if (!process.stdin.isTTY) {
    console.error('\n  Este comando se corre en tu propia terminal: la clave se escribe a mano y no se muestra.\n');
    process.exit(1);
  }
  for (;;) {
    const a = await preguntar(`  Clave (minimo ${CLAVE_MINIMA} caracteres, no se ve al escribir): `, { oculto: true });
    if (a.length < CLAVE_MINIMA) {
      console.log(`  Muy corta. Minimo ${CLAVE_MINIMA} caracteres.`);
      continue;
    }
    const b = await preguntar('  Repite la clave: ', { oculto: true });
    if (a !== b) {
      console.log('  No coinciden. Otra vez.');
      continue;
    }
    return a;
  }
}

const db = abrirDb(cfg.dbArchivo);
const auth = new Autenticacion(db);

try {
  if (cmd === 'crear') {
    console.log(`\n  Nuevo usuario en ${cfg.dbArchivo}\n`);
    const correo = (await preguntar('  Correo: ')).trim();
    const nombre = (await preguntar('  Nombre (asi aparece en la bitacora): ')).trim();
    let rol = '';
    while (!ROLES.includes(rol)) {
      rol = (await preguntar(`  Rol (${ROLES.join(' / ')}): `)).trim().toLowerCase();
    }
    const clave = await pedirClave();
    await auth.crearUsuario({ correo, nombre, rol, clave });
    console.log(`\n  Listo: ${correo} (${rol}). Ya puede entrar a la bitacora.\n`);
  } else if (cmd === 'listar') {
    const lista = auth.listar();
    if (!lista.length) console.log('\n  No hay usuarios. Crea uno con: npm run usuario -- crear\n');
    else {
      console.log('');
      for (const u of lista) {
        console.log(`  ${u.activo ? '●' : '○'} ${u.correo.padEnd(34)} ${u.rol.padEnd(11)} ${u.nombre}${u.activo ? '' : '  (desactivado)'}`);
      }
      console.log('');
    }
  } else if (cmd === 'clave' && arg) {
    const clave = await pedirClave();
    await auth.cambiarClave(arg, clave);
    console.log(`\n  Clave cambiada para ${arg}. Sus sesiones abiertas se cerraron.\n`);
  } else if (cmd === 'desactivar' && arg) {
    auth.desactivar(arg);
    console.log(`\n  ${arg} ya no puede entrar. Sus sesiones abiertas se cerraron.\n`);
  } else {
    console.log(`
  Uso:
    npm run usuario -- crear
    npm run usuario -- listar
    npm run usuario -- clave <correo>
    npm run usuario -- desactivar <correo>
`);
  }
} catch (e) {
  console.error(`\n  No se pudo: ${e.message.includes('UNIQUE') ? 'ese correo ya existe' : e.message}\n`);
  process.exitCode = 1;
} finally {
  db.close();
}
