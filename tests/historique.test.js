/*
 * historique.test.js
 * Tests de public/js/historique.js : écriture, quota plein et recherche.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
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

const { ecrireConversations, filtrerConversations } = require('../public/js/historique.js');

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

test('ecrireConversations : liste vide, le stockage est effacé', () => {
    /* Sinon la dernière conversation supprimée, ou un projet vidé, resterait dans le stockage. */
    neuf(0);
    ecrireConversations(trois);
    assert.deepStrictEqual(ecrireConversations([]), []);
    assert.strictEqual(faux.valeurs['albert-go.conversations'], undefined);
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

const archives = [
    { id: 'a', titre: 'Recette de crêpes', messages: [{ role: 'user', content: 'Recette de crêpes' }] },
    { id: 'b', titre: 'Pièce jointe', messages: [{ role: 'user', content: '...', affiche: 'Résume ce PDF' }, { role: 'assistant', content: 'Le rapport parle d\'Élysée.' }] }
];

test('filtrerConversations : sans texte, tout revient', () => {
    assert.deepStrictEqual(filtrerConversations(archives, '  '), archives);
});

test('filtrerConversations : ni majuscules ni accents ne comptent', () => {
    assert.deepStrictEqual(filtrerConversations(archives, 'CREPES').map(c => c.id), ['a']);
});

test('filtrerConversations : cherche aussi dans les messages', () => {
    assert.deepStrictEqual(filtrerConversations(archives, 'elysee').map(c => c.id), ['b']);
    assert.deepStrictEqual(filtrerConversations(archives, 'résume').map(c => c.id), ['b']);
});
