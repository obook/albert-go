#!/bin/sh
#
# Nom : construire-linux.sh
# Description : Construit l'AppImage de la version autonome dans standalone/dist/.
# Projet : Albert Go, https://github.com/obook/albert-go
# Auteur : O. Booklage
# Licence : GPL-3.0-or-later
#
# Mêmes étapes que le job paquet-linux de .gitlab-ci.yml. Il faut node, npm, curl et git.
#
set -eu

cd "$(dirname "$0")"

for outil in node npm curl git; do
    command -v "$outil" >/dev/null || { echo "$outil introuvable." >&2; exit 1; }
done

# Python autonome (python-build-standalone), téléchargé une fois.
if [ ! -x python-linux/bin/python3 ]; then
    rm -rf python
    curl -fsSL "https://github.com/astral-sh/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz" | tar -xz
    mv python python-linux
fi
# Sans PYTHONNOUSERSITE, pip voit les paquets de ~/.local et ne les copie pas dans le Python embarqué.
PYTHONNOUSERSITE=1 python-linux/bin/python3 -m pip install -q -r ../serveur/requirements.txt

npm ci
# appimagetool s'extrait sans FUSE.
APPIMAGE_EXTRACT_AND_RUN=1 npm run build -- --linux AppImage

ls -l dist/Albert-Go.AppImage
