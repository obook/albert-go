/*
 * lancement.test.js
 * Chaque image de lancement iOS existe et fait la taille que sa balise annonce.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const BALISE = /<link rel="apple-touch-startup-image" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: (portrait|landscape)\)" href="([^"]+)">/g;

test('lancement iOS : chaque balise pointe une image à la taille exacte de l\'écran', () => {
    const page = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
    const balises = [...page.matchAll(BALISE)];
    /* Une balise mal écrite échappe au motif : elle doit manquer au compte. */
    assert.strictEqual(balises.length, page.split('apple-touch-startup-image').length - 1);
    assert.ok(balises.length > 0, 'aucune image de lancement');
    const ecarts = [];
    for (const [, largeur, hauteur, densite, orientation, href] of balises) {
        const portrait = [largeur * densite, hauteur * densite];
        const attendu = (orientation === 'portrait' ? portrait : portrait.reverse()).join('x');
        const chemin = path.join(PUBLIC, href);
        if (!fs.existsSync(chemin)) {
            ecarts.push(href + ' : absente');
            continue;
        }
        /* En-tête PNG (IHDR) : largeur à l'octet 16, hauteur à l'octet 20. */
        const png = fs.readFileSync(chemin);
        const taille = png.readUInt32BE(16) + 'x' + png.readUInt32BE(20);
        if (taille !== attendu) {
            ecarts.push(href + ' : ' + taille + ' au lieu de ' + attendu);
        }
    }
    assert.deepStrictEqual(ecarts, []);
});
