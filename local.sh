#!/bin/sh
#
# Nom : local.sh
# Description : Lance le serveur d'Albert Go (crée .venv au premier lancement).
# Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
# Auteur : O. Booklage
# Licence : GPL-3.0-or-later
#
# Options transmises au serveur : --port N, --ssl, --no-browser, --kiosque.
#
set -eu

DOSSIER="$(cd "$(dirname "$0")" && pwd)"
# httpx et non le seul .venv : une installation interrompue (proxy) est reprise.
if ! "$DOSSIER/.venv/bin/python" -c "import httpx" 2>/dev/null; then
    python3 -m venv "$DOSSIER/.venv"
    "$DOSSIER/.venv/bin/python" -m pip install -q -r "$DOSSIER/serveur/requirements.txt"
fi
cd "$DOSSIER"
# Chemin complet : deploiement/redemarrage.sh arrête le serveur de ce dossier seulement.
exec "$DOSSIER/.venv/bin/python" -m serveur "$@"
