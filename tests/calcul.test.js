/*
 * calcul.test.js
 * Tests de public/js/calcul.js.
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
require('../public/js/i18n.js');
const Calcul = require('../public/js/calcul.js');

test('evaluer : priorités, parenthèses, puissance, virgule', () => {
    assert.strictEqual(Calcul.evaluer('2 + 3 * 4'), 14);
    assert.strictEqual(Calcul.evaluer('(12,5 + 3) * 2^3'), 124);
    assert.strictEqual(Calcul.evaluer('2^3^2'), 512);
    assert.strictEqual(Calcul.evaluer('-2^2'), -4);
    assert.strictEqual(Calcul.evaluer('0.1 + 0.2'), 0.3);
    assert.strictEqual(Calcul.evaluer('sqrt(16) + pi * 0'), 4);
});

test('evaluer : refuse le code et les expressions fausses', () => {
    for (const faux of ['alert(1)', '2 +', '(1', '1 / 0', '1 2', '']) {
        assert.throws(() => Calcul.evaluer(faux), faux);
    }
});
