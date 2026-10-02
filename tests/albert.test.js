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

test('messageErreur : relais hors service', () => {
    assert.match(Albert.messageErreur(503, null), /indisponible/);
});

test('repondre : relais bloqué, la sonde /stats arrête la requête', async () => {
    const fetchOrigine = globalThis.fetch;
    const sondeOrigine = Albert.SONDE_MS;
    Albert.SONDE_MS = 10;
    globalThis.fetch = (url, options) => url.endsWith('/stats')
        ? Promise.reject(new TypeError('bloqué'))
        : new Promise((_, rejeter) => options.signal.addEventListener('abort', () => rejeter(options.signal.reason)));
    try {
        await assert.rejects(Albert.repondre('cle', {}, new AbortController().signal), /indisponible/);
    } finally {
        globalThis.fetch = fetchOrigine;
        Albert.SONDE_MS = sondeOrigine;
    }
});

test('messageErreur : détail texte repris, détail objet ignoré', () => {
    assert.strictEqual(Albert.messageErreur(404, { detail: 'Model not found' }), 'Erreur 404 : Model not found');
    assert.strictEqual(Albert.messageErreur(422, { detail: [{ msg: 'x' }] }), 'Erreur 422.');
});

test('construireDemande : Rédiger', () => {
    assert.strictEqual(Albert.construireDemande('rediger', 'Notes', 'auto', 'en'),
        'Rédige un courrier à partir de ces notes :\n\nNotes');
});

test('doitEnvoyer : longueur minimale et texte changé', () => {
    const dix = 'a'.repeat(10);
    assert.strictEqual(Albert.doitEnvoyer('a'.repeat(9), ''), false);
    assert.strictEqual(Albert.doitEnvoyer('   ' + 'a'.repeat(9) + '\n', ''), false);
    assert.strictEqual(Albert.doitEnvoyer(dix, ''), true);
    assert.strictEqual(Albert.doitEnvoyer('absent 3 jours', ''), true);
    assert.strictEqual(Albert.doitEnvoyer(dix, dix), false);
    assert.strictEqual(Albert.doitEnvoyer(dix + '\n ', dix), false);
    assert.strictEqual(Albert.doitEnvoyer(dix + 'b', dix), true);
});

test('sansMarkdown : gras, italique et titres retirés, lignes gardées', () => {
    assert.strictEqual(Albert.sansMarkdown('**Madame,**\n\nJe vous __écris__.'), 'Madame,\n\nJe vous écris.');
    assert.strictEqual(Albert.sansMarkdown('## Objet : absence\nTexte'), 'Objet : absence\nTexte');
    assert.strictEqual(Albert.sansMarkdown('Un *mot* important'), 'Un mot important');
    assert.strictEqual(Albert.sansMarkdown('3 * 4 = 12\n- liste gardée'), '3 * 4 = 12\n- liste gardée');
});

test('separerRevue : courrier puis anomalies après %%%', () => {
    assert.deepStrictEqual(Albert.separerRevue('**Madame,**\n\nTexte.\n%%%\n- Lundi 30 septembre est un mercredi.\n\n* Heure absente.'),
        { texte: 'Madame,\n\nTexte.', anomalies: ['Lundi 30 septembre est un mercredi.', 'Heure absente.'] });
    assert.deepStrictEqual(Albert.separerRevue('Madame,\n\nTexte.\n'), { texte: 'Madame,\n\nTexte.', anomalies: [] });
    assert.deepStrictEqual(Albert.separerRevue('Madame,\n\nTexte.\n\n%%%%%\n- Heure absente.'),
        { texte: 'Madame,\n\nTexte.', anomalies: ['Heure absente.'] });
    assert.deepStrictEqual(Albert.separerRevue('Madame,\n\nTexte.\n%%% - Heure absente.\n%%%'),
        { texte: 'Madame,\n\nTexte.', anomalies: ['Heure absente.'] });
});

test('calendrier : un jour par ligne, dans la langue demandée', () => {
    const jours = Albert.calendrier(new Date(2026, 8, 22), 9, 'fr');
    assert.strictEqual(jours.length, 9);
    assert.strictEqual(jours[0], 'mardi 22 septembre 2026');
    assert.strictEqual(jours[8], 'mercredi 30 septembre 2026');
});

test('logoEditeur : éditeur reconnu au nom du modèle, sinon logo neutre', () => {
    assert.strictEqual(Albert.logoEditeur('openai/gpt-oss-120b'), 'images/editeurs/openai.png');
    assert.strictEqual(Albert.logoEditeur('deepseek-v4-flash-0731'), 'images/editeurs/deepseek.png');
    assert.strictEqual(Albert.logoEditeur('ministral-3-8b-instruct-2512'), 'images/editeurs/mistral.png');
    assert.strictEqual(Albert.logoEditeur('lightonai/LightOnOCR-2-1B'), 'images/editeurs/lighton.jpg');
    assert.strictEqual(Albert.logoEditeur('llama-4'), 'images/editeurs/inconnu.svg');
    for (const m of Albert.MODELES) assert.notStrictEqual(Albert.logoEditeur(m.reel), 'images/editeurs/inconnu.svg');
});

test('demandeCorrectionMermaid : code et erreur envoyés, température 0', () => {
    const demande = Albert.demandeCorrectionMermaid('large', 'A + B --> C', 'Parse error on line 1');
    assert.strictEqual(demande.model, 'large');
    assert.strictEqual(demande.temperature, 0);
    assert.strictEqual(demande.messages[0].role, 'system');
    assert.match(demande.messages[1].content, /A \+ B --> C[\s\S]*Parse error on line 1/);
});

test('codeMermaid : bloc ```mermaid retiré s\'il y en a un', () => {
    assert.strictEqual(Albert.codeMermaid('Voici :\n```mermaid\nflowchart LR\n A --> B\n```\nFin.'), 'flowchart LR\n A --> B');
    assert.strictEqual(Albert.codeMermaid('```\ngraph TD\n A --> B\n```'), 'graph TD\n A --> B');
    assert.strictEqual(Albert.codeMermaid('  graph TD\n A --> B\n'), 'graph TD\n A --> B');
});

test('appels : somme des jours et moyenne horaire depuis le premier jour', async () => {
    const avant = global.fetch;
    const maintenant = Date.now;
    global.fetch = async url => {
        assert.ok(url.endsWith('/webhook/albert-go/stats'));
        return { ok: true, json: async () => ({ '2026-09-25': { appels: 4, utilisateurs: 2 }, '2026-09-26': { appels: 3, utilisateurs: 1 } }) };
    };
    try {
        Date.now = () => Date.parse('2026-09-26T10:00:00Z');
        assert.deepStrictEqual(await Albert.appels(), { total: 7, parHeure: 7 / 34 });
    } finally {
        global.fetch = avant;
        Date.now = maintenant;
    }
});

test('langueDuTexte : traductions faites dans Chat', () => {
    assert.strictEqual(Albert.langueDuTexte('Hola, quisiera pedir cita para la semana que viene.', 'fr'), 'es');
    assert.strictEqual(Albert.langueDuTexte('Hello, I would like to make an appointment next week.', 'fr'), 'en');
    assert.strictEqual(Albert.langueDuTexte('Hallo, ich möchte nächste Woche einen Termin vereinbaren.', 'fr'), 'de');
    assert.strictEqual(Albert.langueDuTexte('Ciao, vorrei prendere un appuntamento per la settimana prossima.', 'fr'), 'it');
    assert.strictEqual(Albert.langueDuTexte('Olá, gostaria de marcar uma consulta para a próxima semana.', 'fr'), 'pt');
    assert.strictEqual(Albert.langueDuTexte('Hallo, ik wil graag een afspraak maken voor volgende week.', 'fr'), 'nl');
    assert.strictEqual(Albert.langueDuTexte('Здравствуйте, я хотел бы записаться на следующую неделю.', 'fr'), 'ru');
    assert.strictEqual(Albert.langueDuTexte('您好，我想预约下周的时间。', 'fr'), 'zh');
    assert.strictEqual(Albert.langueDuTexte('こんにちは、来週の予約をしたいです。', 'fr'), 'ja');
    assert.strictEqual(Albert.langueDuTexte('مرحبا، أود حجز موعد الأسبوع المقبل.', 'fr'), 'ar');
});

test('langueDuTexte : dans le doute, la langue de l\'interface', () => {
    const francais = 'Il suffit de doubler les quantités : 500 g de farine, 8 œufs et 1 litre de lait.';
    assert.strictEqual(Albert.langueDuTexte(francais, 'fr'), 'fr');
    /* Le code en anglais ne compte pas. */
    assert.strictEqual(Albert.langueDuTexte('Voici la boucle :\n```js\nfor (const item of the list) { if (it is not done) return; }\n```\nElle est simple.', 'fr'), 'fr');
    assert.strictEqual(Albert.langueDuTexte('OK', 'fr'), 'fr');
    assert.strictEqual(Albert.langueDuTexte('142,8571429', 'es'), 'es');
});

test('wav : en-tête PCM 16 bits mono et échantillons bornés', () => {
    const wav = new DataView(Albert.wav(new Float32Array([0, 1, -1, 2]), 16000));
    const texte = (debut, n) => String.fromCharCode(...new Uint8Array(wav.buffer, debut, n));
    assert.strictEqual(wav.byteLength, 44 + 4 * 2);
    assert.strictEqual(texte(0, 4) + texte(8, 8) + texte(36, 4), 'RIFFWAVEfmt data');
    assert.strictEqual(wav.getUint32(4, true), 36 + 8);
    assert.strictEqual(wav.getUint16(22, true), 1);
    assert.strictEqual(wav.getUint32(24, true), 16000);
    assert.strictEqual(wav.getUint32(28, true), 32000);
    assert.strictEqual(wav.getUint32(40, true), 8);
    assert.deepStrictEqual([0, 1, 2, 3].map(i => wav.getInt16(44 + i * 2, true)), [0, 32767, -32767, 32767]);
});

test('variantes : blocs séparés par une ligne vide, jamais deux fois de suite la même', () => {
    const liste = Albert.variantes('Madame,\r\nligne 2\r\n\r\n  \nDeuxième\n\n\nTroisième\n');
    assert.deepStrictEqual(liste, ['Madame,\nligne 2', 'Deuxième', 'Troisième']);
    for (let i = 0; i < 50; i++) {
        assert.notStrictEqual(Albert.autreVariante(liste, 'Deuxième'), 'Deuxième');
    }
    assert.strictEqual(Albert.autreVariante(['seule'], 'seule'), 'seule');
    assert.deepStrictEqual(Albert.variantes(''), []);
});
