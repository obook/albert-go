/*
 * styles.test.js
 * Accolades équilibrées dans chaque feuille de style.
 *
 * Une accolade en trop ne casse rien de visible dans le fichier : elle annule
 * la règle qui la suit, sans erreur.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DOSSIER = path.join(__dirname, '..', 'public', 'styles');

test('feuilles de style : accolades équilibrées, jamais refermées en trop', () => {
    const fautives = [];
    for (const nom of fs.readdirSync(DOSSIER).filter(f => f.endsWith('.css'))) {
        /* Commentaires et chaînes retirés : ils peuvent contenir des accolades. */
        const css = fs.readFileSync(path.join(DOSSIER, nom), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/"[^"\n]*"|'[^'\n]*'/g, '');
        let niveau = 0;
        let ligne = 1;
        for (const caractere of css) {
            if (caractere === '\n') {
                ligne += 1;
            } else if (caractere === '{') {
                niveau += 1;
            } else if (caractere === '}') {
                niveau -= 1;
                if (niveau < 0) {
                    fautives.push(nom + ' : accolade en trop vers la ligne ' + ligne);
                    niveau = 0;
                }
            }
        }
        if (niveau > 0) {
            fautives.push(nom + ' : ' + niveau + ' accolade(s) non refermée(s)');
        }
    }
    assert.deepStrictEqual(fautives, []);
});
