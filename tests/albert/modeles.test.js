/*
 * albert/modeles.test.js
 * Tests de public/js/albert/modeles.js : liste des modèles, liste de secours,
 * logos des éditeurs, top-k et modèle qui lit les images.
 *
 * i18n.js d'abord : albert.js lit ses textes avec t, variable globale.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
require('../../public/js/i18n.js');
const Albert = require('../../public/js/albert.js');

/* Sous Node, pas de serveur.js : les tests supposent un serveur, sauf ceux de la version en ligne. */
Albert.EN_LIGNE = false;

test('conversation : filtre, alias, ordre, nom court', () => {
    /* Extrait au format de /v1/models (annuaire BidouIAge du 1er août 2026). */
    const liste = [
        { id: 'bge-m3', type: 'text-embeddings-inference', aliases: ['openweight-embeddings'] },
        { id: 'deepseek-v4-flash', type: 'text-generation', aliases: ['deepseek-ai/DeepSeek-V4-Flash', 'openweight-code-2'], max_context_length: 393216 },
        { id: 'lightonocr-2-1b', type: 'image-text-to-text', aliases: ['openweight-ocr'] },
        { id: 'openai/gpt-oss-120b', model_type: 'text-generation', type: 'model', aliases: ['openweight-large'], max_context_length: 131072 },
        { id: 'mistral-small-3-2-24b-instruct-2506', type: 'image-text-to-text', aliases: ['openweight-medium'], max_context_length: 128000 },
        { id: 'whisper-large-v3', type: 'automatic-speech-recognition', aliases: ['openweight-audio'] },
        { id: 'modele-sans-alias', type: 'text-generation' }
    ];
    const modeles = Albert.normaliserModeles(liste);
    assert.deepStrictEqual(modeles.map(m => m.id), ['modele-sans-alias', 'openweight-code-2', 'openweight-large', 'openweight-medium']);
    assert.strictEqual(modeles[2].reel, 'openai/gpt-oss-120b');
    assert.strictEqual(modeles[2].contexte, 131072);
    assert.strictEqual(modeles[1].nom, 'Code 2');
    /* Le type est un code : langues/*.js en donne le nom affiché. */
    assert.strictEqual(modeles[3].type, 'texte-images');
    assert.strictEqual(modeles[2].type, 'texte');
});

test('normaliserModeles : format de llm-proxy, id = alias, modèle réel parmi les aliases', () => {
    const liste = [
        { id: 'openweight-large', model_type: 'text-generation', type: 'model',
            aliases: ['openweight-large', 'gpt-oss-120b', 'openai/gpt-oss-120b'] },
        { id: 'deepseek-v4-flash-0731', model_type: 'text-generation', type: 'model',
            aliases: ['deepseek-v4-flash-0731', 'deepseek-ai/DeepSeek-V4-Flash-0731', 'deepseek-v4-flash'] }
    ];
    const modeles = Albert.normaliserModeles(liste);
    assert.deepStrictEqual(modeles.map(m => [m.id, m.reel]), [
        ['deepseek-v4-flash-0731', 'deepseek-ai/DeepSeek-V4-Flash-0731'],
        ['openweight-large', 'openai/gpt-oss-120b']
    ]);
    /* Le logo de l'éditeur se lit sur le modèle réel, pas sur l'alias. */
    assert.strictEqual(Albert.logoEditeur(modeles[1].reel), 'images/editeurs/openai.png');
});

test('normaliserModeles : lecteur d\'images connu même si Albert le dit text-generation', () => {
    /* Albert du 10/11/2026 : plus de type image-text-to-text, Large répondait sans voir la photo. */
    const liste = [
        { id: 'gemma-4-31b-it', type: 'text-generation', aliases: ['google/gemma-4-31B-it'] },
        { id: 'gpt-oss-120b', type: 'text-generation', aliases: ['openweight-large', 'openai/gpt-oss-120b'] }
    ];
    assert.deepStrictEqual(Albert.normaliserModeles(liste).map(m => [m.id, m.type]),
        [['gemma-4-31b-it', 'texte-images'], ['openweight-large', 'texte']]);
});

test('normaliserModeles : input_modalities annoncé par Albert (OpenGateLLM #641)', () => {
    const liste = [
        { id: 'nouveau-vision', type: 'text-generation', input_modalities: ['text', 'image'] },
        { id: 'nouveau-texte', type: 'text-generation', input_modalities: ['text'] }
    ];
    assert.deepStrictEqual(Albert.normaliserModeles(liste).map(m => [m.id, m.type]),
        [['nouveau-texte', 'texte'], ['nouveau-vision', 'texte-images']]);
});

test('MODELES : chaque modèle de secours figure dans /v1/models', () => {
    /* Modèles de conversation relevés sur Albert le 2 octobre 2026. */
    const liste = [
        { id: 'openweight-large', model_type: 'text-generation', aliases: ['openweight-large', 'openai/gpt-oss-120b'], max_context_length: 131072 },
        { id: 'openweight-code', model_type: 'text-generation', aliases: ['openweight-code', 'Qwen/Qwen3-Coder-30B-A3B-Instruct'], max_context_length: 262144 },
        { id: 'openweight-small', model_type: 'image-text-to-text', aliases: ['openweight-small', 'mistralai/Ministral-3-8B-Instruct-2512'], max_context_length: 262144 },
        { id: 'openweight-medium', model_type: 'image-text-to-text', aliases: ['openweight-medium', 'mistralai/Mistral-Small-3.2-24B-Instruct-2506'], max_context_length: 128000 },
        { id: 'deepseek-v4-flash-0731', model_type: 'text-generation', aliases: ['deepseek-ai/DeepSeek-V4-Flash-0731', 'deepseek-v4-flash'], max_context_length: 131072 },
        { id: 'gemma-4-31b-it', model_type: 'image-text-to-text', aliases: ['google/gemma-4-31B-it'], max_context_length: 262144 }
    ];
    const reels = Albert.normaliserModeles(liste).map(m => [m.id, m.type, m.contexte]);
    for (const m of Albert.MODELES) assert.deepStrictEqual(reels.find(r => r[0] === m.id), [m.id, m.type, m.contexte]);
});

test('modeleImages : le modèle choisi s\'il lit les images, sinon le préféré, sinon aucun', () => {
    const large = { id: 'openweight-large', type: 'texte' };
    const small = { id: 'openweight-small', type: 'texte-images' };
    const medium = { id: 'openweight-medium', type: 'texte-images' };
    const gemma = { id: 'gemma-4-31b-it', type: 'texte-images' };
    assert.strictEqual(Albert.modeleImages([large, small, medium, gemma], small), small);
    assert.strictEqual(Albert.modeleImages([large, small, medium, gemma], large), gemma);
    assert.strictEqual(Albert.modeleImages([large, small, medium], large), medium);
    assert.strictEqual(Albert.modeleImages([large, small], large), small);
    assert.strictEqual(Albert.modeleImages([large], large), null);
});

test('logoEditeur : éditeur reconnu au nom du modèle, sinon logo neutre', () => {
    assert.strictEqual(Albert.logoEditeur('openai/gpt-oss-120b'), 'images/editeurs/openai.png');
    assert.strictEqual(Albert.logoEditeur('deepseek-v4-flash-0731'), 'images/editeurs/deepseek.png');
    assert.strictEqual(Albert.logoEditeur('ministral-3-8b-instruct-2512'), 'images/editeurs/mistral.png');
    assert.strictEqual(Albert.logoEditeur('lightonai/LightOnOCR-2-1B'), 'images/editeurs/lighton.jpg');
    assert.strictEqual(Albert.logoEditeur('llama-4'), 'images/editeurs/inconnu.svg');
    for (const m of Albert.MODELES) assert.notStrictEqual(Albert.logoEditeur(m.reel), 'images/editeurs/inconnu.svg');
});

test('topK : envoyé seulement sous la position "sans limite" du curseur', () => {
    assert.deepStrictEqual(Albert.topK(5), { top_k: 5 });
    assert.deepStrictEqual(Albert.topK(1), { top_k: 1 });
    assert.deepStrictEqual(Albert.topK(Albert.TOP_K_SANS_LIMITE), {});
    assert.deepStrictEqual(Albert.topK(Albert.CONSEILLES.topK), { top_k: 40 });
    assert.strictEqual(Albert.cleAideTopK(1), 'reglages.aide-top-k-un');
    assert.strictEqual(Albert.cleAideTopK(40), 'reglages.aide-top-k');
    assert.strictEqual(Albert.cleAideTopK(Albert.TOP_K_SANS_LIMITE), 'reglages.aide-top-k-tous');
    const page = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
    const [, min, max] = page.match(/id="top-k"\s+min="(\d+)"\s+max="(\d+)"/);
    assert.deepStrictEqual([Number(min), Number(max)], [1, Albert.TOP_K_SANS_LIMITE]);
});
