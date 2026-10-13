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

test('petits textes : par variable, à 14 px au moins sur grand écran', () => {
    const lire = nom => fs.readFileSync(path.join(DOSSIER, nom), 'utf8');
    const grand = /@media \(min-width: 64rem\) \{\s*:root \{([^}]*)\}/.exec(lire('base.css'));
    assert.ok(grand, 'bloc grand écran absent de base.css');
    for (const nom of ['--taille-mini', '--taille-petite', '--taille-bouton']) {
        const valeur = new RegExp(nom + ': ([\\d.]+)rem').exec(grand[1]);
        assert.ok(valeur && Number(valeur[1]) >= 0.875, nom);
    }
    /* Une taille écrite en dur sous 16 px échapperait à la règle ; celles du téléphone (max-width) restent. */
    for (const nom of fs.readdirSync(DOSSIER).filter(f => f.endsWith('.css'))) {
        const horsTelephone = lire(nom).replace(/@media \(max-width[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
        assert.doesNotMatch(horsTelephone, /font-size: 0\.(75|8125|9375)rem/, nom);
    }
});

test('grand écran : tout le texte agrandi d\'un cran, par la taille de la racine', () => {
    const base = fs.readFileSync(path.join(DOSSIER, 'base.css'), 'utf8');
    assert.match(base, /@media \(min-width: 64rem\) \{\s*:root \{[^}]*\}\s*\/\*[^*]*\*\/\s*html \{ font-size: 112\.5%; \}/);
});
