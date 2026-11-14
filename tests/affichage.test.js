/*
 * affichage.test.js
 * Le toast passe devant une boîte modale ; un curseur ne bouge pas au défilement.
 *
 * Une boîte ouverte par showModal() couvre toute la page, fond flou compris :
 * le toast doit rejoindre la couche du dessus à chaque message.
 * Au doigt, Chrome déplace un curseur dès le contact, même si le geste défile.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'affichage.js'), 'utf8');

test('toast : rouvert à chaque message, donc devant la boîte ouverte entre-temps', () => {
    const appels = [];
    const boite = {
        classList: { add() {}, remove() {} },
        togglePopover: (ouvrir) => appels.push(ouvrir),
    };
    const contexte = vm.createContext({ $: () => boite, setTimeout: () => 0, clearTimeout() {} });
    vm.runInContext(SOURCE, contexte);
    contexte.toast('un');
    contexte.toast('deux');
    assert.deepStrictEqual(appels, [false, true, false, true]);
    assert.strictEqual(boite.textContent, 'deux');
});

test("curseur : un contact devenu défilement rend la valeur d'avant et la fait enregistrer", () => {
    const ecouteurs = {};
    const envoyes = [];
    const curseur = {
        value: '0.2',
        addEventListener: (type, f) => { ecouteurs[type] = f; },
        dispatchEvent: (e) => envoyes.push(e.type),
    };
    const contexte = vm.createContext({ Event });
    vm.runInContext(SOURCE, contexte);
    contexte.annulerAuDefilement(curseur);
    ecouteurs.pointerdown();
    curseur.value = '1.9';
    ecouteurs.pointercancel();
    assert.strictEqual(curseur.value, '0.2');
    assert.deepStrictEqual(envoyes, ['input']);
});
