'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const Albert = require('../public/albert.js');

test('messagesAEnvoyer : mémoire active ou non', () => {
    const conv = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' }
    ];
    assert.deepStrictEqual(Albert.messagesAEnvoyer(conv, true), conv);
    assert.deepStrictEqual(Albert.messagesAEnvoyer(conv, false), [{ role: 'user', content: 'c' }]);
});

test('messageErreur : clé refusée', () => {
    assert.match(Albert.messageErreur(401, { detail: 'Not authenticated' }), /Clé refusée/);
});

test('messageErreur : quota', () => {
    assert.match(Albert.messageErreur(429, null), /Quota/);
});

test('messageErreur : détail texte repris, détail objet ignoré', () => {
    assert.strictEqual(Albert.messageErreur(404, { detail: 'Model not found' }), 'Erreur 404 : Model not found');
    assert.strictEqual(Albert.messageErreur(422, { detail: [{ msg: 'x' }] }), 'Erreur 422.');
});
