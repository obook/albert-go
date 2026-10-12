/*
 * affichage.test.js
 * Le toast passe devant une boîte modale.
 *
 * Une boîte ouverte par showModal() couvre toute la page, fond flou compris :
 * le toast doit rejoindre la couche du dessus à chaque message.
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
const vm = require('node:vm');

test('toast : rouvert à chaque message, donc devant la boîte ouverte entre-temps', () => {
    const appels = [];
    const boite = {
        classList: { add() {}, remove() {} },
        togglePopover: (ouvrir) => appels.push(ouvrir),
    };
    const contexte = vm.createContext({ $: () => boite, setTimeout: () => 0, clearTimeout() {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'affichage.js'), 'utf8'), contexte);
    contexte.toast('un');
    contexte.toast('deux');
    assert.deepStrictEqual(appels, [false, true, false, true]);
    assert.strictEqual(boite.textContent, 'deux');
});
