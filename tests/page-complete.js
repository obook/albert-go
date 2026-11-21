/*
 * page-complete.js
 * Texte de index.html suivi de ses morceaux de public/pages/, pour les tests
 * qui y cherchent un élément (curseurs des réglages, exemples de l'accueil).
 * Pas un fichier de tests : node --test ne lance que les *.test.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');

/**
 * Liste les fichiers .html d'un dossier et de ses sous-dossiers.
 *
 * @param {string} dossier - Dossier à parcourir.
 * @returns {string[]} Chemins des fichiers, triés.
 */
function fichiersHtml(dossier) {
    const chemins = [];
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
        const chemin = path.join(dossier, entree.name);
        if (entree.isDirectory()) {
            chemins.push(...fichiersHtml(chemin));
        } else if (entree.name.endsWith('.html')) {
            chemins.push(chemin);
        }
    }
    return chemins.sort();
}

/**
 * Lit index.html et les morceaux de pages/.
 *
 * @returns {string} Les textes, mis bout à bout.
 */
function lirePageComplete() {
    const textes = [fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')];
    for (const chemin of fichiersHtml(path.join(PUBLIC, 'pages'))) {
        textes.push(fs.readFileSync(chemin, 'utf8'));
    }
    return textes.join('\n');
}

module.exports = { lirePageComplete };
