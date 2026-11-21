/*
 * chargement.test.js
 * Tests de public/js/socle/chargement.js : ses deux listes suivent les fichiers.
 * Le script travaille sur la page dès son chargement : on lit ses listes dans le texte.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { lirePageComplete } = require('./page-complete.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const SOURCE = fs.readFileSync(path.join(PUBLIC, 'js', 'socle', 'chargement.js'), 'utf8');

/**
 * Lit une liste de chaînes du script, par exemple const MORCEAUX = [...].
 *
 * @param {string} nom - Nom de la constante.
 * @returns {string[]} Les chaînes de la liste.
 */
function liste(nom) {
    const bloc = SOURCE.match(new RegExp('const ' + nom + ' = \\[([^\\]]*)\\]'))[1];
    return [...bloc.matchAll(/'([^']+)'/g)].map((trouve) => trouve[1]);
}

/**
 * Noms des morceaux présents dans pages/, sans l'extension.
 *
 * @param {string} dossier - Dossier à parcourir.
 * @returns {string[]} Noms comme "reglages/ia".
 */
function morceauxPresents(dossier) {
    const noms = [];
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
        const chemin = path.join(dossier, entree.name);
        if (entree.isDirectory()) {
            noms.push(...morceauxPresents(chemin));
        } else if (entree.name.endsWith('.html')) {
            noms.push(path.relative(path.join(PUBLIC, 'pages'), chemin).replace(/\.html$/, '').split(path.sep).join('/'));
        }
    }
    return noms;
}

test('chargement : MORCEAUX liste chaque fichier de pages/, et lui seul', () => {
    assert.deepStrictEqual(liste('MORCEAUX').slice().sort(), morceauxPresents(path.join(PUBLIC, 'pages')).sort());
});

test('chargement : chaque emplacement data-page a son morceau dans MORCEAUX', () => {
    const emplacements = [...lirePageComplete().matchAll(/data-page="([^"]+)"/g)].map((trouve) => trouve[1]);
    assert.ok(emplacements.length > 0, 'aucun emplacement');
    const manquants = emplacements.filter((nom) => !liste('MORCEAUX').includes(nom));
    assert.deepStrictEqual(manquants, []);
});

test('chargement : chaque script de SCRIPTS existe', () => {
    const absents = liste('SCRIPTS').filter((chemin) => !fs.existsSync(path.join(PUBLIC, chemin)));
    assert.deepStrictEqual(absents, []);
});
