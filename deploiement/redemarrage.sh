#!/usr/bin/env bash
#
# Nom : redemarrage.sh
# Description : Met à jour et relance le serveur d'Albert Go sans redémarrer
#               la machine : arrêt du serveur de ce dossier, puis demarrage.sh
#               en arrière-plan (git pull, dépendances, serveur).
# Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
# Auteur : O. Booklage, d'après L'Atelier d'Albert (Romain P., Luce P.B., Théossian S.D.)
# Licence : GPL-3.0-or-later
#
# Usage : ./deploiement/redemarrage.sh
#
set -uo pipefail

DOSSIER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# local.sh lance Python par son chemin complet : seul le serveur de ce dossier est visé.
SERVEUR="^$DOSSIER/.venv/bin/python -m serveur"

if pkill -f "$SERVEUR"; then
    for _ in $(seq 1 10); do
        pgrep -f "$SERVEUR" > /dev/null || break
        sleep 1
    done
    pkill -9 -f "$SERVEUR" && echo "Arrêt forcé du serveur."
    echo "Serveur arrêté."
else
    echo "Aucun serveur en cours."
fi

nohup "$DOSSIER/deploiement/demarrage.sh" > /dev/null 2>&1 &
echo "Relance en cours : tail -f $DOSSIER/albert-go.log"
