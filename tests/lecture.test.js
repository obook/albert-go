'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const Lecture = require('../public/lecture.js');

test('formuleParlee : fractions, puissances, racines, chimie', () => {
    assert.strictEqual(Lecture.formuleParlee('\\frac{2}{3} \\times \\frac{4}{5}'), '2 sur 3 fois 4 sur 5');
    assert.strictEqual(Lecture.formuleParlee('x^2 + y^{3} = z^{n}'), 'x au carré + y au cube égale z puissance n');
    assert.strictEqual(Lecture.formuleParlee('\\sqrt{2}'), 'racine carrée de 2');
    assert.strictEqual(Lecture.formuleParlee('x^{23}'), 'x puissance 23');
    assert.strictEqual(Lecture.formuleParlee('\\ce{2H2 + O2 -> 2H2O}'), '2H2 + O2 donne 2H2O');
});

test('ordinaux : suffixe collé seulement', () => {
    assert.strictEqual(Lecture.ordinaux('En 1re et en 2de, puis en 3e et 4ème.'), 'En premier et en seconde, puis en 3ième et 4ième.');
    assert.strictEqual(Lecture.ordinaux('2 de ces exemples'), '2 de ces exemples');
});

test('voix : locale d\'abord, en ligne seulement si autorisée', () => {
    const google = { name: 'Google français', lang: 'fr-FR', localService: false };
    const piper = { name: 'Piper', lang: 'fr-FR', localService: true };
    global.speechSynthesis = { getVoices: () => [google] };
    Lecture.enLigne = false;
    assert.strictEqual(Lecture.voix(), null);
    Lecture.enLigne = true;
    assert.strictEqual(Lecture.voix(), google);
    global.speechSynthesis = { getVoices: () => [google, piper] };
    assert.strictEqual(Lecture.voix(), piper);
    Lecture.enLigne = false;
    delete global.speechSynthesis;
});

test('decouper : morceaux bornés, coupés aux phrases', () => {
    const morceaux = Lecture.decouper('Une phrase. Une autre phrase. Encore une.', 20);
    assert.deepStrictEqual(morceaux, ['Une phrase.', 'Une autre phrase.', 'Encore une.']);
    assert.deepStrictEqual(Lecture.decouper('Court.', 250), ['Court.']);
});
