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

test('conversation : filtre, alias, ordre, nom court', () => {
    // Extrait au format de /v1/models (annuaire BidouIAge du 1er août 2026).
    const liste = [
        { id: 'bge-m3', type: 'text-embeddings-inference', aliases: ['openweight-embeddings'] },
        { id: 'deepseek-v4-flash', type: 'text-generation', aliases: ['deepseek-ai/DeepSeek-V4-Flash', 'openweight-code-2'], max_context_length: 393216 },
        { id: 'lightonocr-2-1b', type: 'image-text-to-text', aliases: ['openweight-ocr'] },
        { id: 'openai/gpt-oss-120b', model_type: 'text-generation', type: 'model', aliases: ['openweight-large'], max_context_length: 131072 },
        { id: 'mistral-small-3-2-24b-instruct-2506', type: 'image-text-to-text', aliases: ['openweight-medium'], max_context_length: 128000 },
        { id: 'whisper-large-v3', type: 'automatic-speech-recognition', aliases: ['openweight-audio'] },
        { id: 'modele-sans-alias', type: 'text-generation' }
    ];
    const modeles = Albert.conversation(liste);
    assert.deepStrictEqual(modeles.map(m => m.id), ['openweight-medium', 'openweight-large', 'openweight-code-2', 'modele-sans-alias']);
    assert.strictEqual(modeles[1].reel, 'openai/gpt-oss-120b');
    assert.strictEqual(modeles[1].contexte, 131072);
    assert.strictEqual(modeles[2].nom, 'Code 2');
    assert.strictEqual(modeles[3].description, 'Modèle de conversation.');
});

test('joindre : question seule, fichier seul, les deux', () => {
    const piece = { nom: 'notes.txt', texte: 'Ligne 1' };
    assert.strictEqual(Albert.joindre('Résume', null), 'Résume');
    assert.strictEqual(Albert.joindre('', piece), 'Contenu du fichier "notes.txt" :\n\nLigne 1');
    assert.strictEqual(Albert.joindre('Résume', piece), 'Résume\n\nContenu du fichier "notes.txt" :\n\nLigne 1');
});

test('naviguer : bornes de l\'historique', () => {
    const h = ['c', 'b', 'a'];
    assert.strictEqual(Albert.naviguer(h, -1, 'haut'), 0);
    assert.strictEqual(Albert.naviguer(h, 2, 'haut'), 2);
    assert.strictEqual(Albert.naviguer(h, 0, 'bas'), -1);
    assert.strictEqual(Albert.naviguer(h, -1, 'bas'), -1);
    assert.strictEqual(Albert.naviguer([], -1, 'haut'), -1);
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
