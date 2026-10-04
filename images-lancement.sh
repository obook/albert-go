#!/bin/sh
#
# Nom : images-lancement.sh
# Description : Fabrique les images de lancement iOS et affiche leurs balises.
# Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
# Auteur : O. Booklage
# Date : Octobre 2026
# Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
#
# iOS ne montre le logo à l'ouverture que s'il trouve une image à la taille
# exacte de l'écran. Nouvel appareil : ajouter sa ligne à ECRANS, relancer,
# puis coller les balises affichées dans public/index.html.
# Demande inkscape et convert (ImageMagick).
#
set -eu

PUBLIC="$(cd "$(dirname "$0")" && pwd)/public"
SORTIE="$PUBLIC/images/lancement"
FOND='#000091'
# Largeur du logo, en points CSS.
LOGO=128

# Largeur et hauteur en points CSS (portrait), densité, puis "paysage" pour
# les tablettes, qui s'ouvrent aussi couchées.
ECRANS='
375 667 2
414 736 3
375 812 3
414 896 2
414 896 3
390 844 3
428 926 3
393 852 3
430 932 3
402 874 3
440 956 3
420 912 3
768 1024 2 paysage
744 1133 2 paysage
810 1080 2 paysage
820 1180 2 paysage
834 1112 2 paysage
834 1194 2 paysage
834 1210 2 paysage
1024 1366 2 paysage
1032 1376 2 paysage
'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$SORTIE"

# image <largeur> <hauteur> <densité> <portrait|landscape>
# px_l, px_h : pas de variable locale en sh, ne pas écraser celles de la boucle.
image() {
    px_l=$(($1 * $3))
    px_h=$(($2 * $3))
    if [ "$4" = landscape ]; then
        px_l=$(($2 * $3))
        px_h=$(($1 * $3))
    fi
    logo="$TMP/logo-$3.png"
    if [ ! -f "$logo" ]; then
        inkscape "$PUBLIC/images/favicon.svg" -w $((LOGO * $3)) -o "$logo" 2>/dev/null
    fi
    convert -size "${px_l}x${px_h}" "xc:$FOND" "$logo" -gravity center -composite \
        -strip -depth 8 "$SORTIE/${px_l}x${px_h}.png"
    echo "    <link rel=\"apple-touch-startup-image\" media=\"(device-width: $1px) and (device-height: $2px) and (-webkit-device-pixel-ratio: $3) and (orientation: $4)\" href=\"images/lancement/${px_l}x${px_h}.png\">"
}

echo "$ECRANS" | while read -r largeur hauteur densite paysage; do
    [ -n "$largeur" ] || continue
    image "$largeur" "$hauteur" "$densite" portrait
    if [ -n "$paysage" ]; then
        image "$largeur" "$hauteur" "$densite" landscape
    fi
done
