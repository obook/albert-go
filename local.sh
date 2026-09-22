#!/bin/sh
#
# Nom : local.sh
# Description : Sert public/ en local et ouvre la page dans le navigateur.
# Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
# Auteur : O. Booklage
# Date : Septembre 2026
# Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
#
# Port fixe : le webhook n8n n'accepte que l'origine http://localhost:8642.
# Servi sans cache : un simple rechargement prend les fichiers modifiés.
#
set -eu

PORT=8642
URL="http://localhost:$PORT"
DOSSIER="$(cd "$(dirname "$0")" && pwd)/public"

if curl -s -o /dev/null "$URL"; then
    echo "ERREUR : le port $PORT est déjà utilisé."
    exit 1
fi

echo "Page : $URL (Ctrl+C pour arrêter)"
# Ouvre le navigateur une seconde plus tard, quand le serveur écoute.
(
    sleep 1
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$URL"
    elif command -v open >/dev/null 2>&1; then
        open "$URL"
    fi
) >/dev/null 2>&1 &

# Sans cache : les adresses restent en ?v=dev, un simple rechargement doit prendre les fichiers modifiés.
exec python3 - "$PORT" "$DOSSIER" <<'PYTHON'
import functools, http.server, sys

class SansCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port, dossier = int(sys.argv[1]), sys.argv[2]
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(SansCache, directory=dossier)).serve_forever()
PYTHON
