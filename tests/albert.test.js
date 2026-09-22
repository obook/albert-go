/*
 * albert.test.js
 * Tests de public/js/albert.js : modèles, contexte, historique, erreurs.
 *
 * i18n.js d'abord : albert.js lit ses textes avec t, variable globale.
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
require('../public/js/i18n.js');
const Albert = require('../public/js/albert.js');

test('messagesAEnvoyer : mémoire active ou non', () => {
    const conv = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' }
    ];
    assert.deepStrictEqual(Albert.messagesAEnvoyer(conv, true), conv);
    assert.deepStrictEqual(Albert.messagesAEnvoyer(conv, false), [{ role: 'user', content: 'c' }]);
});

test('messagesAEnvoyer : le texte de la bulle ne part pas', () => {
    const conv = [{ role: 'user', content: 'Résume\n\nContenu du fichier', affiche: 'Résume\nFichier joint : a.txt' }];
    assert.deepStrictEqual(Albert.messagesAEnvoyer(conv, true), [{ role: 'user', content: 'Résume\n\nContenu du fichier' }]);
});

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
    assert.deepStrictEqual(modeles.map(m => m.id), ['openweight-medium', 'openweight-large', 'openweight-code-2', 'modele-sans-alias']);
    assert.strictEqual(modeles[1].reel, 'openai/gpt-oss-120b');
    assert.strictEqual(modeles[1].contexte, 131072);
    assert.strictEqual(modeles[2].nom, 'Code 2');
    /* Le type est un code : i18n.js en donne le nom affiché. */
    assert.strictEqual(modeles[0].type, 'texte-images');
    assert.strictEqual(modeles[1].type, 'texte');
});

test('occupation : pourcentage du contexte, borné, inconnu', () => {
    assert.strictEqual(Albert.occupation({ total_tokens: 12800 }, 128000), 10);
    assert.strictEqual(Albert.occupation({ prompt_tokens: 100000, completion_tokens: 40000 }, 128000), 100);
    assert.strictEqual(Albert.occupation(null, 128000), null);
    assert.strictEqual(Albert.occupation({ total_tokens: 10 }, null), null);
});

test('joindre : question seule, fichier seul, les deux', () => {
    const piece = { nom: 'notes.txt', texte: 'Ligne 1' };
    assert.strictEqual(Albert.joindre('Résume', null), 'Résume');
    assert.strictEqual(Albert.joindre('', piece), 'Contenu du fichier "notes.txt" :\n\nLigne 1');
    assert.strictEqual(Albert.joindre('Résume', piece), 'Résume\n\nContenu du fichier "notes.txt" :\n\nLigne 1');
});

test('libelleConversation : l\'outil devant le titre, sauf Discuter', () => {
    assert.strictEqual(Albert.libelleConversation({ titre: 'Bonjour', outil: 'discuter' }), 'Bonjour');
    assert.strictEqual(Albert.libelleConversation({ titre: 'Bonjour', outil: 'traduire' }), 'Traduire : Bonjour');
    /* Conversations enregistrées avant que l'outil ne soit noté. */
    assert.strictEqual(Albert.libelleConversation({ titre: 'Bonjour' }), 'Bonjour');
});

test('entreeConversation : titre pris sur la première question affichée', () => {
    const messages = [
        { role: 'user', content: 'Corrige ce texte :\n\nBonjour', affiche: 'Bonjour' },
        { role: 'assistant', content: 'Bonjour.' }
    ];
    const entree = Albert.entreeConversation('abc', 'corriger', messages);
    assert.strictEqual(entree.id, 'abc');
    assert.strictEqual(entree.outil, 'corriger');
    assert.strictEqual(entree.titre, 'Bonjour');
    assert.strictEqual(typeof entree.date, 'number');
    /* Copie : la conversation en cours continue de changer. */
    messages.push({ role: 'user', content: 'Encore' });
    assert.strictEqual(entree.messages.length, 2);
});

test('entreeConversation : sans question posée, rien à enregistrer', () => {
    assert.strictEqual(Albert.entreeConversation('abc', 'discuter', []), null);
    /* Le titre retombe sur le contenu quand rien n'est affiché à part. */
    const entree = Albert.entreeConversation('abc', 'discuter', [{ role: 'user', content: 'Salut' }]);
    assert.strictEqual(entree.titre, 'Salut');
});

test('texteAffiche : la pièce jointe s\'annonce sous la question', () => {
    const piece = { nom: 'notes.txt' };
    assert.strictEqual(Albert.texteAffiche('Bonjour', null), 'Bonjour');
    assert.strictEqual(Albert.texteAffiche('Bonjour', piece), 'Bonjour\nFichier joint : notes.txt');
    /* Un fichier peut partir sans question. */
    assert.strictEqual(Albert.texteAffiche('', piece), 'Fichier joint : notes.txt');
    assert.strictEqual(Albert.texteAffiche('', null), '');
});

test('contientLien : les adresses qu\'Albert ne peut pas ouvrir', () => {
    assert.ok(Albert.contientLien('Résume https://exemple.fr/page'));
    assert.ok(Albert.contientLien('Va voir www.exemple.fr'));
    assert.ok(Albert.contientLien('HTTP://EXEMPLE.FR'));
    assert.ok(!Albert.contientLien('Parle-moi du web.'));
    assert.ok(!Albert.contientLien(''));
});

test('construireDemande : instruction selon l\'outil', () => {
    assert.strictEqual(Albert.construireDemande('discuter', 'Bonjour', 'auto', 'en'), 'Bonjour');
    assert.strictEqual(Albert.construireDemande('reformuler', 'Texte', 'auto', 'en'), 'Reformule ce texte :\n\nTexte');
    assert.strictEqual(Albert.construireDemande('corriger', 'Texte', 'auto', 'en'), 'Corrige ce texte :\n\nTexte');
    /* Les codes de langue deviennent leur nom dans la langue de l'interface. */
    assert.strictEqual(Albert.construireDemande('traduire', 'Texte', 'auto', 'en'), 'Traduis ce texte en Anglais :\n\nTexte');
    assert.strictEqual(Albert.construireDemande('traduire', 'Text', 'en', 'fr'), 'Traduis ce texte en Français (langue source : Anglais) :\n\nText');
});

test('decouperVariantes : trois variantes, ou null si le format manque', () => {
    const reponse = '### Plus courte\nCourt.\n\n### Même longueur\nMoyen, plus fluide.\n\n### Plus soutenue\nTexte soutenu.\n\nSecond paragraphe.';
    assert.deepStrictEqual(Albert.decouperVariantes(reponse), [
        { titre: 'Plus courte', texte: 'Court.' },
        { titre: 'Même longueur', texte: 'Moyen, plus fluide.' },
        { titre: 'Plus soutenue', texte: 'Texte soutenu.\n\nSecond paragraphe.' }
    ]);
    assert.strictEqual(Albert.decouperVariantes('Une seule reformulation.'), null);
    assert.strictEqual(Albert.decouperVariantes('### Seule\nUne variante.'), null);
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
