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

test('accorde : singulier ou pluriel selon le nombre et la langue', () => {
    const avant = I18n.langue;
    try {
        I18n.langue = 'fr';
        /* En français, 0 et 1 sont au singulier. */
        assert.strictEqual(I18n.accorde('contexte.echanges', 0, { n: 0 }), 'Contexte : 0 échange');
        assert.strictEqual(I18n.accorde('contexte.echanges', 1, { n: 1 }), 'Contexte : 1 échange');
        assert.strictEqual(I18n.accorde('contexte.echanges', 2, { n: 2 }), 'Contexte : 2 échanges');
        I18n.langue = 'en';
        assert.strictEqual(I18n.accorde('contexte.echanges', 0, { n: 0 }), 'Context: 0 exchanges');
        assert.strictEqual(I18n.accorde('contexte.echanges', 1, { n: 1 }), 'Context: 1 exchange');
    } finally {
        I18n.langue = avant;
    }
});

test('aucun pluriel entre parenthèses, et un singulier pour chaque texte accordé', () => {
    for (const langue of I18n.LANGUES) {
        const textes = I18n.TEXTES[langue];
        /* calcul.* décrit la syntaxe math.js au modèle : ses parenthèses sont des fonctions. */
        const fautifs = Object.keys(textes).filter(c => !c.startsWith('calcul.') && /\((s|es|e|n|en)\)/.test(textes[c]));
        assert.deepStrictEqual(fautifs, [], langue);
    }
    for (const cle of ['contexte.echanges', 'toast.memoire-pleine', 'calendrier.ecart', 'calendrier.decale',
        'calendrier.ecart-ouvres', 'calendrier.decale-ouvres', 'calendrier.decale-heures', 'compteur.mots', 'compteur.caracteres']) {
        assert.ok(FR[cle + '-un'], cle);
    }
});
