#!/usr/bin/env bash
#
# Nom : demarrage.sh
# Description : Lance le serveur d'Albert Go au démarrage de la machine
#               (crontab @reboot, voir docs/DEPLOIEMENT.md) : attente du réseau,
#               git pull, dépendances, puis le serveur, qui garde la main.
# Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
# Auteur : O. Booklage, d'après L'Atelier d'Albert (Romain P., Luce P.B., Théossian S.D.)
# Licence : GPL-3.0-or-later
#
# Réglages dans le .env du dépôt : ALBERT_MISE_A_JOUR (git pull, oui par
# défaut) ; port, HTTPS et kiosque sont lus par le serveur.
# Journal : albert-go.log à la racine du dépôt, celui d'avant en albert-go.log.1.
#
# Pas de set -e : sans réseau, le pull échoue et le serveur démarre quand même.
set -uo pipefail

DOSSIER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JOURNAL="$DOSSIER/albert-go.log"
cd "$DOSSIER" || exit 1
[ -f "$JOURNAL" ] && mv "$JOURNAL" "$JOURNAL.1"

journal() {
    echo "$(date '+%F %T') -- $*" >> "$JOURNAL"
}

# Valeur d'un réglage du .env, sans guillemets ni espaces ; vide s'il manque.
reglage() {
    sed -n "s/^[[:space:]]*$1[[:space:]]*=//p" .env 2>/dev/null | tail -n 1 | tr -d "\"' \r"
}

journal "Démarrage d'Albert Go"
for _ in $(seq 1 60); do
    ip route 2>/dev/null | grep -q default && break
    sleep 1
done
ip route 2>/dev/null | grep -q default || journal "Pas de réseau après 60 s : démarrage sans mise à jour"

if [ "$(reglage ALBERT_MISE_A_JOUR)" != "non" ]; then
    avant=$(git rev-parse --short HEAD)
    # --ff-only : jamais de fusion sur la machine, un dépôt modifié sur place reste tel quel.
    git pull --ff-only >> "$JOURNAL" 2>&1 || journal "git pull a échoué : version inchangée"
    apres=$(git rev-parse --short HEAD)
    if [ "$avant" = "$apres" ]; then
        journal "Version $apres"
    else
        journal "Mise à jour $avant -> $apres"
    fi
fi

# Environnement Python absent ou cassé (Python mis à jour, dossier déplacé) : recréé.
if ! .venv/bin/python -c '' 2>/dev/null; then
    journal "Création de l'environnement Python"
    python3 -m venv --clear .venv >> "$JOURNAL" 2>&1
fi
.venv/bin/python -m pip install -q --disable-pip-version-check -r serveur/requirements.txt >> "$JOURNAL" 2>&1 \
    || journal "Dépendances non mises à jour (pip install a échoué)"

exec ./local.sh --no-browser >> "$JOURNAL" 2>&1
