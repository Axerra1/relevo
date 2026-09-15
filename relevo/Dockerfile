# Relevo en produccion.
#
# UNA sola instancia, siempre encendida: la base es SQLite en un disco, y el agente entra a
# Zello con un solo usuario. Dos copias corriendo tendrian bases distintas y se expulsarian
# del canal entre si.

FROM node:24-slim

ENV NODE_ENV=production \
    TZ=America/Bogota \
    PORT=8080 \
    HTTPS=0 \
    DETRAS_DE_PROXY=1 \
    MODO_DESARROLLO=0 \
    CHANNEL_ADAPTER=zello \
    DB_ARCHIVO=/data/relevo.db

WORKDIR /app

# Solo dependencias de produccion: ffmpeg (80 MB) es para el video, no para el servidor.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts/usuario.js ./scripts/usuario.js

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/relevo-usuario.sh /usr/local/bin/relevo-usuario
# Si el repo se clono en Windows, los scripts pueden venir con finales de linea CRLF y el
# contenedor no los reconoce. Se normalizan aca, pase lo que pase con git.
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh /usr/local/bin/relevo-usuario \
 && chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/relevo-usuario \
 && mkdir -p /data

EXPOSE 8080
ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "src/index.js"]
