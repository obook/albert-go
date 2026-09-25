/*
 * i18n.test.js
 * Chaque langue a les clés et les {variables} du français.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const I18n = require('../public/js/i18n.js');

const FR = I18n.TEXTES.fr;
const variables = texte => (texte.match(/\{\w+\}/g) || []).sort();

for (const langue of I18n.LANGUES.filter(l => l !== 'fr')) {
    test(`${langue} : mêmes clés que le français`, () => {
        const textes = I18n.TEXTES[langue];
        assert.deepStrictEqual(Object.keys(FR).filter(c => !(c in textes)), [], 'clés manquantes');
        assert.deepStrictEqual(Object.keys(textes).filter(c => !(c in FR)), [], 'clés en trop');
    });

    test(`${langue} : mêmes {variables} que le français`, () => {
        const textes = I18n.TEXTES[langue];
        for (const cle of Object.keys(FR)) {
            assert.deepStrictEqual(variables(textes[cle] || ''), variables(FR[cle]), cle);
        }
    });
}
