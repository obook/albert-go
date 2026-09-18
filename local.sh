#!/bin/sh
# Sert public/ en local et ouvre la page dans le navigateur.
# Port fixe : le webhook n8n n'autorise que l'origine http://localhost:8642.

PORT=8642
URL="http://localhost:$PORT"
DOSSIER="$(cd "$(dirname "$0")" && pwd)/public"

if curl -s -o /dev/null "$URL"; then
    echo "ERREUR : le port $PORT est déjà utilisé."
    exit 1
fi

echo "Page : $URL (Ctrl+C pour arrêter)"
( sleep 1
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  elif command -v open >/dev/null 2>&1; then open "$URL"
  fi ) >/dev/null 2>&1 &

exec python3 -m http.server "$PORT" --bind 127.0.0.1 -d "$DOSSIER"
