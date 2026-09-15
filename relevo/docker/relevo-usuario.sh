#!/bin/sh
# Administrar usuarios dentro del servidor en la nube:
#
#   fly ssh console -C "relevo-usuario crear"
#   fly ssh console -C "relevo-usuario listar"
#
# Corre como "node", no como root: si root tocara la base, los archivos nuevos quedarian con
# dueno root y el servidor ya no podria escribirlos.
# La ruta de la base va explicita: sin ella, el script crearia una base nueva y vacia en /app.
set -e
export DB_ARCHIVO="${DB_ARCHIVO:-/data/relevo.db}"
cd /app
if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid=node --regid=node --init-groups node scripts/usuario.js "$@"
fi
exec node scripts/usuario.js "$@"
