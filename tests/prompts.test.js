/*
 * prompts.test.js
 * Chaque consigne nommée dans Albert.OUTILS existe dans chaque langue.
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
require('../public/js/i18n.js');
const Albert = require('../public/js/albert.js');

test('consignes : un fichier par langue pour chaque consigne, revue et complément', () => {
    const manquants = [];
    for (const langue of ['fr', 'en', 'es', 'de']) {
        for (const outil of Object.values(Albert.OUTILS)) {
            /* Compétences de la carte du même nom, ajoutées à toute consigne. */
            for (const fichier of [outil.consigne, outil.revue, outil.complement, 'ecriture-soignee.txt', 'style-direct.txt', 'sans-redite.txt'].filter(Boolean)) {
                const chemin = path.join(__dirname, '..', 'public', 'prompts', langue, fichier);
                if (!fs.existsSync(chemin) || !fs.readFileSync(chemin, 'utf8').trim()) {
                    manquants.push(langue + '/' + fichier);
                }
            }
        }
    }
    assert.deepStrictEqual(manquants, []);
});
