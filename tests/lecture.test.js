/*
 * lecture.test.js
 * Tests de public/js/lecture.js : formules parlées, ordinaux, voix, découpage.
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
const Lecture = require('../public/js/lecture.js');

test('formuleParlee : fractions, puissances, racines, chimie', () => {
    assert.strictEqual(Lecture.formuleParlee('\\frac{2}{3} \\times \\frac{4}{5}'), '2 sur 3 fois 4 sur 5');
    assert.strictEqual(Lecture.formuleParlee('x^2 + y^{3} = z^{n}'), 'x au carré + y au cube égale z puissance n');
    assert.strictEqual(Lecture.formuleParlee('\\sqrt{2}'), 'racine carrée de 2');
    assert.strictEqual(Lecture.formuleParlee('x^{23}'), 'x puissance 23');
    assert.strictEqual(Lecture.formuleParlee('\\ce{2H2 + O2 -> 2H2O}'), '2H2 + O2 donne 2H2O');
});

test('formuleParlee : les trois autres tables disent la même formule', () => {
    const formule = '\\frac{2}{3} \\times x^2 + \\sqrt{9} = y^{n}';
    assert.strictEqual(Lecture.formuleParlee(formule, 'en'),
        '2 over 3 times x squared + the square root of 9 equals y to the power of n');
    assert.strictEqual(Lecture.formuleParlee(formule, 'es'),
        '2 entre 3 por x al cuadrado + raíz cuadrada de 9 igual a y elevado a n');
    assert.strictEqual(Lecture.formuleParlee(formule, 'de'),
        '2 durch 3 mal x zum Quadrat + Wurzel aus 9 gleich y hoch n');
});

test('formuleParlee : la chimie et les langues sans table', () => {
    assert.strictEqual(Lecture.formuleParlee('\\ce{2H2 + O2 -> 2H2O}', 'en'), '2H2 + O2 gives 2H2O');
    assert.strictEqual(Lecture.formuleParlee('\\ce{2H2 + O2 -> 2H2O}', 'de'), '2H2 + O2 ergibt 2H2O');
    /* Réponse de Traduire en russe : rien à lire plutôt qu'une formule en vrac. */
    assert.strictEqual(Lecture.formuleParlee('\\frac{1}{2}', 'ru'), '');
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

test('voix : langue demandée, "ru-RU" comme "ru_RU", jamais une voix française pour du russe', () => {
    const francaise = { name: 'Piper fr', lang: 'fr-FR', localService: true };
    const russe = { name: 'Piper ru', lang: 'ru_RU', localService: true };
    global.speechSynthesis = { getVoices: () => [francaise, russe] };
    assert.strictEqual(Lecture.voix('ru'), russe);
    assert.strictEqual(Lecture.voix(), francaise);
    global.speechSynthesis = { getVoices: () => [francaise] };
    assert.strictEqual(Lecture.voix('ru'), null);
    delete global.speechSynthesis;
});

test('voixPretes : attend voiceschanged quand la liste est encore vide (Chrome Android)', async () => {
    let voix = [];
    let ecouteur = null;
    global.speechSynthesis = {
        getVoices: () => voix,
        addEventListener: (nom, f) => { ecouteur = f; },
        removeEventListener: () => { ecouteur = null; }
    };
    const attente = Lecture.voixPretes();
    voix = [{ name: 'Google русский', lang: 'ru-RU', localService: false }];
    ecouteur();
    await attente;
    Lecture.enLigne = true;
    assert.strictEqual(Lecture.voix('ru').name, 'Google русский');
    Lecture.enLigne = false;
    delete global.speechSynthesis;
});

test('disponible : liste vide (Chrome Android), voix du système seulement si les voix en ligne sont permises', () => {
    global.speechSynthesis = { getVoices: () => [] };
    Lecture.enLigne = false;
    assert.strictEqual(Lecture.disponible('ru'), false);
    Lecture.enLigne = true;
    assert.strictEqual(Lecture.disponible('ru'), true);
    Lecture.enLigne = false;
    delete global.speechSynthesis;
});

test('decouper : morceaux bornés, coupés aux phrases', () => {
    const morceaux = Lecture.decouper('Une phrase. Une autre phrase. Encore une.', 20);
    assert.deepStrictEqual(morceaux, ['Une phrase.', 'Une autre phrase.', 'Encore une.']);
    assert.deepStrictEqual(Lecture.decouper('Court.', 250), ['Court.']);
});
