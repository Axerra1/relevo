#!/bin/sh
set -e

# El disco de datos llega montado con dueno root. Se le entrega al usuario "node" y el
# servidor corre como "node": Relevo nunca corre como administrador del contenedor.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown -R node:node /data
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
