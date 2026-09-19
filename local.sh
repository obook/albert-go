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
# Pas d'en-tête de cache : après une modification, recharger avec Ctrl+Maj+R.
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

exec python3 -m http.server "$PORT" --bind 127.0.0.1 -d "$DOSSIER"
