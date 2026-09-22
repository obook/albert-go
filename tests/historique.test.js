/*
 * historique.test.js
 * Tests de public/js/historique.js : écriture des conversations et quota plein.
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

/* Le module lit le stockage au chargement : il faut ces globales avant. */
let faux = { valeurs: {}, refuser: 0, erreur: 'QuotaExceededError' };
global.lire = () => '[]';
global.stockage = () => ({
    setItem(nom, valeur) {
        if (faux.refuser > 0) {
            faux.refuser -= 1;
            const err = new Error('plein');
            err.name = faux.erreur;
            throw err;
        }
        faux.valeurs[nom] = valeur;
    },
    getItem: (nom) => faux.valeurs[nom] || null,
    removeItem: (nom) => { delete faux.valeurs[nom]; }
});

const { ecrireConversations } = require('../public/js/historique.js');

/** Remet le faux stockage à neuf entre deux tests. */
function neuf(refuser, erreur) {
    faux = { valeurs: {}, refuser: refuser || 0, erreur: erreur || 'QuotaExceededError' };
}

const trois = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];

test('ecrireConversations : tout passe, la liste revient telle quelle', () => {
    neuf(0);
    assert.deepStrictEqual(ecrireConversations(trois), trois);
    assert.deepStrictEqual(JSON.parse(faux.valeurs['albert-go.conversations']), trois);
});

test('ecrireConversations : quota plein, les plus anciennes sont retirées', () => {
    /* Les deux premiers essais échouent : il reste la conversation en cours. */
    neuf(2);
    assert.deepStrictEqual(ecrireConversations(trois), [{ id: 'c' }]);
    assert.deepStrictEqual(JSON.parse(faux.valeurs['albert-go.conversations']), [{ id: 'c' }]);
});

test('ecrireConversations : même seule elle ne tient pas, rien n\'est écrit', () => {
    neuf(3);
    assert.strictEqual(ecrireConversations(trois), null);
    assert.strictEqual(faux.valeurs['albert-go.conversations'], undefined);
});

test('ecrireConversations : une autre erreur remonte telle quelle', () => {
    /* Navigation privée : le stockage refuse tout, ce n'est pas un quota. */
    neuf(1, 'SecurityError');
    assert.throws(() => ecrireConversations(trois), { name: 'SecurityError' });
});
