/*
 * kiosque.test.js
 * Réglages du prof recopiés chez les élèves (public/js/kiosque.js).
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Licence : GPL-3.0-or-later
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { reglagesProf, reglagesAppliques, valeurStockee, adresseDeSortie } = require('../public/js/kiosque.js');

test('reglagesProf : seulement les réglages partagés', () => {
    const r = { modele: 'm', temperature: 0.2, topK: 40, echanges: 11, recherche: true, calcul: true,
        tirage: false, calendrier: true, compteur: true, fournisseurs: ['wikipedia'], voixEnLigne: true, cleRecherche: 'x' };
    assert.deepStrictEqual(Object.keys(reglagesProf(r)).sort(),
        ['calcul', 'calendrier', 'compteur', 'echanges', 'fournisseurs', 'modele', 'recherche', 'temperature', 'tirage', 'topK']);
});

test('reglagesAppliques : moteurs inconnus retirés, réglages absents ignorés', () => {
    assert.deepStrictEqual(reglagesAppliques({ temperature: 0.7, fournisseurs: ['wikipedia', 'inconnu'], session: 12 }, ['wikipedia', 'hal']),
        [['temperature', 0.7], ['fournisseurs', ['wikipedia']]]);
});

test('valeurStockee : comme stockage.js les écrit', () => {
    assert.strictEqual(valeurStockee(true), 'oui');
    assert.strictEqual(valeurStockee(false), 'non');
    assert.strictEqual(valeurStockee(['a', 'b']), 'a,b');
    assert.strictEqual(valeurStockee(0.2), '0.2');
});

/* L'invité qui quittait la session tombait sur le formulaire du prof (16/10/2026). */
test('adresseDeSortie : l\'invité lit un message, le prof retrouve son formulaire', () => {
    assert.strictEqual(adresseDeSortie({ role: 'eleve' }), '/kiosque?quittee');
    assert.strictEqual(adresseDeSortie({ role: 'enseignant' }), '/kiosque');
    assert.strictEqual(adresseDeSortie({ role: 'eleve' }, true), '/kiosque?terminee');
    assert.strictEqual(adresseDeSortie({ role: 'enseignant' }, true), '/kiosque?erreur=terminee');
});
