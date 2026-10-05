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
const fs = require('node:fs');
const path = require('node:path');
require('../public/js/i18n.js');
const Albert = require('../public/js/albert.js');

test('messagesAEnvoyer : nombre d\'échanges relus', () => {
    const conv = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((content, i) => ({ role: i % 2 ? 'assistant' : 'user', content }));
    const envoyes = n => Albert.messagesAEnvoyer(conv, n).map(m => m.content).join('');
    assert.strictEqual(envoyes(Albert.ECHANGES_TOUS), 'abcdefg');
    assert.strictEqual(envoyes(0), 'g');
    assert.strictEqual(envoyes(1), 'efg');
    assert.strictEqual(envoyes(2), 'cdefg');
    assert.strictEqual(envoyes(10), 'abcdefg');
    /* Deux questions de suite (réponse en échec) : l'envoi commence quand même par une question. */
    const bancale = [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }, { role: 'user', content: 'd' }];
    assert.strictEqual(Albert.messagesAEnvoyer(bancale, 1)[0].role, 'user');
    assert.strictEqual(Albert.messagesAEnvoyer([{ role: 'assistant', content: 'x' }, ...bancale], 2)[0].role, 'user');
});

test('contexte : le curseur, la valeur conseillée et les phrases', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const [, min, max] = page.match(/id="echanges"\s+min="(\d+)"\s+max="(\d+)"/);
    assert.deepStrictEqual([Number(min), Number(max)], [0, Albert.ECHANGES_TOUS]);
    assert.strictEqual(Albert.CONSEILLES.echanges, Albert.ECHANGES_TOUS);
    assert.strictEqual(Albert.cleAideEchanges(0), 'reglages.aide-echanges-aucun');
    assert.strictEqual(Albert.cleAideEchanges(1), 'reglages.aide-echanges-un');
    assert.strictEqual(Albert.cleAideEchanges(3), 'reglages.aide-echanges');
    assert.strictEqual(Albert.cleAideEchanges(Albert.ECHANGES_TOUS), 'reglages.aide-echanges-tous');
});

test('messagesAEnvoyer : le texte de la bulle ne part pas', () => {
    const conv = [{ role: 'user', content: 'Résume\n\nContenu du fichier', affiche: 'Résume\nFichier joint : a.txt' }];
    assert.deepStrictEqual(Albert.messagesAEnvoyer(conv, Albert.ECHANGES_TOUS), [{ role: 'user', content: 'Résume\n\nContenu du fichier' }]);
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
        return { ok: true, json: async () => ({ '2026-09-25': { appels: 4 }, '2026-09-26': { appels: 3 } }) };
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

test('OUTILS : Discussion et Projet sont à fil, Projet seul a des documents', () => {
    assert.strictEqual(Albert.OUTILS.discuter.fil, true);
    assert.deepStrictEqual(Albert.OUTILS.projet, { consigne: 'discuter.txt', complement: 'projet.txt', fil: true, documents: true });
    assert.ok(!Albert.OUTILS.corriger.fil);
    assert.ok(!Albert.OUTILS.discuter.documents);
});

test('joindreDocuments : un bloc par document, rien sans document', () => {
    assert.strictEqual(Albert.joindreDocuments([]), '');
    assert.strictEqual(Albert.joindreDocuments([{ nom: 'cours.pdf', texte: 'A' }, { nom: 'sujet.odt', texte: 'B' }]),
        'Contenu du fichier "cours.pdf" :\n\nA\n\nContenu du fichier "sujet.odt" :\n\nB');
});

test('plafondDocuments : 60 % du contexte, à trois caractères par jeton', () => {
    assert.strictEqual(Albert.plafondDocuments(131072), 235929);
    assert.strictEqual(Albert.plafondDocuments(null), 200000);
});

test('partDocuments : pourcentage du contexte, non plafonné', () => {
    assert.strictEqual(Albert.partDocuments([{ nom: 'a', texte: 'x'.repeat(600) }], 1000), 20);
    /* Modèle changé pour un contexte plus petit : la part dépasse 100. */
    assert.strictEqual(Albert.partDocuments([{ nom: 'a', texte: 'x'.repeat(600) }], 100), 200);
    assert.strictEqual(Albert.partDocuments([], 1000), 0);
    assert.strictEqual(Albert.partDocuments([{ nom: 'a', texte: 'x' }], null), null);
});

test('avecDocument : même nom remplacé, plafond dépassé refusé', () => {
    const cours = { nom: 'cours.pdf', texte: 'x'.repeat(100) };
    assert.deepStrictEqual(Albert.avecDocument([cours], { nom: 'sujet.odt', texte: 'y' }, 1000),
        [cours, { nom: 'sujet.odt', texte: 'y' }]);
    assert.deepStrictEqual(Albert.avecDocument([cours], { nom: 'cours.pdf', texte: 'z' }, 1000),
        [{ nom: 'cours.pdf', texte: 'z' }]);
    /* Contexte de 1000 jetons : 1800 caractères au plus. */
    assert.strictEqual(Albert.avecDocument([cours], { nom: 'gros.pdf', texte: 'x'.repeat(1701) }, 1000), null);
    assert.ok(Albert.avecDocument([cours], { nom: 'gros.pdf', texte: 'x'.repeat(1700) }, 1000));
});

test('entreeConversation : projet sans question, titré par son premier document', () => {
    const documents = [{ nom: 'cours.pdf', texte: 'A' }];
    const entree = Albert.entreeConversation('p1', 'projet', [], documents);
    assert.strictEqual(entree.titre, 'cours.pdf');
    /* Les fichiers sont dans la bibliothèque : le document ne garde que leurs noms. */
    assert.deepStrictEqual(entree.sources, ['cours.pdf']);
    assert.ok(!('documents' in entree));
    /* Avec une question : le titre habituel. Sans source : pas de champ sources. */
    assert.strictEqual(Albert.entreeConversation('p1', 'projet', [{ role: 'user', content: 'Fais un devoir' }], documents).titre, 'Fais un devoir');
    assert.ok(!('sources' in Albert.entreeConversation('d1', 'discuter', [{ role: 'user', content: 'Bonjour' }])));
    assert.strictEqual(Albert.entreeConversation('d1', 'discuter', []), null);
});

test('entreeConversation : nom du projet gardé, coupé à 40 caractères', () => {
    const documents = [{ nom: 'cours.pdf', texte: 'A' }];
    assert.strictEqual(Albert.entreeConversation('p1', 'projet', [], documents, '  3e - Pythagore  ').nom, '3e - Pythagore');
    assert.strictEqual(Albert.entreeConversation('p1', 'projet', [], documents, 'x'.repeat(60)).nom.length, 40);
    assert.ok(!('nom' in Albert.entreeConversation('p1', 'projet', [], documents, '   ')));
    /* Un nom seul ne fait pas un projet : il faut un document ou une question. */
    assert.strictEqual(Albert.entreeConversation('p1', 'projet', [], [], '3e - Pythagore'), null);
});

test('libelleConversation : un projet porte son nom, sinon son titre', () => {
    assert.strictEqual(Albert.libelleConversation({ outil: 'projet', titre: 'cours.pdf' }), 'cours.pdf');
    assert.strictEqual(Albert.libelleConversation({ outil: 'projet', titre: 'cours.pdf', nom: '3e - Pythagore' }), '3e - Pythagore');
});

test('limiterConversations : projets et discussions comptés à part', () => {
    const liste = [];
    for (let i = 0; i < 12; i++) {
        liste.push({ id: 'd' + i, outil: 'discuter' }, { id: 'p' + i, outil: 'projet' });
    }
    const gardees = Albert.limiterConversations(liste);
    assert.strictEqual(gardees.filter(c => c.outil === 'projet').length, 10);
    assert.strictEqual(gardees.filter(c => c.outil !== 'projet').length, 10);
    /* Les plus récentes d'abord, dans l'ordre d'origine. */
    assert.deepStrictEqual(gardees.slice(0, 3).map(c => c.id), ['d0', 'p0', 'd1']);
    assert.ok(!gardees.some(c => c.id === 'p10' || c.id === 'd11'));
    /* Dix discussions ne font pas sortir un projet. */
    const dix = Array.from({ length: 10 }, (_, i) => ({ id: 'd' + i, outil: 'discuter' }));
    assert.ok(Albert.limiterConversations([...dix, { id: 'p', outil: 'projet' }]).some(c => c.id === 'p'));
});

test('messagesProjet : la demande, précédée de la version en cours du document', () => {
    const conv = [
        { role: 'user', content: 'Fais une évaluation', affiche: 'Fais une évaluation' },
        { role: 'assistant', content: 'Version 1', langue: 'fr' },
        { role: 'user', content: 'Ajoute un exercice' },
        { role: 'assistant', content: 'Version 2' },
        { role: 'user', content: 'Barème sur 10' }
    ];
    /* Les versions plus anciennes ne partent pas : chacune est un document entier. */
    assert.deepStrictEqual(Albert.messagesProjet(conv), [
        { role: 'user', content: 'Ajoute un exercice' },
        { role: 'assistant', content: 'Version 2' },
        /* Le rappel suit la demande : sans lui, le modèle rend parfois la seule partie modifiée. */
        { role: 'user', content: 'Barème sur 10\n\n' + I18n.t('demande.document-entier') }
    ]);
    /* Une phrase, pas la clé rendue faute de texte. */
    assert.match(I18n.t('demande.document-entier'), / /);
    /* Première demande : aucun document à rendre entier, et la conversation gardée reste sans rappel. */
    assert.deepStrictEqual(Albert.messagesProjet(conv.slice(0, 1)), [{ role: 'user', content: 'Fais une évaluation' }]);
    assert.strictEqual(conv[4].content, 'Barème sur 10');
});

/* Trois versions d'un document, chacune avec sa demande. */
const TROIS_VERSIONS = [
    { role: 'user', content: 'Consigne : Fais une évaluation', affiche: 'Fais une évaluation' },
    { role: 'assistant', content: 'Version 1' },
    { role: 'user', content: 'Ajoute un exercice' },
    { role: 'assistant', content: 'Version 2' },
    { role: 'user', content: 'Barème sur 10' },
    { role: 'assistant', content: 'Version 3' }
];

test('numeroterVersions : un numéro par version, à partir de 0, qui la suit quand elle est reprise', () => {
    const numerotee = Albert.numeroterVersions(TROIS_VERSIONS);
    assert.deepStrictEqual(Albert.versionsProjet(numerotee).map(v => v.numero), [0, 1, 2]);
    /* Reprise, la version 0 passe en dernier mais garde son numéro. */
    const reprise = Albert.reprendreVersion(numerotee, 1);
    assert.deepStrictEqual(Albert.versionsProjet(reprise).map(v => v.numero), [1, 2, 0]);
    /* La version suivante prend la suite du plus grand numéro, même si une autre est sortie. */
    const suite = Albert.numeroterVersions([...reprise.slice(2), { role: 'user', content: 'Suite' }, { role: 'assistant', content: 'Version 4' }]);
    assert.deepStrictEqual(Albert.versionsProjet(suite).map(v => v.numero), [2, 0, 3]);
    assert.strictEqual(TROIS_VERSIONS[1].version, undefined);
});

test('versionsProjet : passé le plafond, les numéros continuent de monter', () => {
    let conv = [];
    for (let i = 0; i < Albert.VERSIONS_MAX + 3; i += 1) {
        conv = Albert.limiterVersions(Albert.numeroterVersions([...conv, { role: 'user', content: 'Demande ' + i }, { role: 'assistant', content: 'Version ' + i }]));
    }
    assert.deepStrictEqual(Albert.versionsProjet(conv).map(v => v.numero), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('versionsProjet : une version par réponse, nommée par sa demande affichée', () => {
    assert.deepStrictEqual(Albert.versionsProjet(Albert.numeroterVersions(TROIS_VERSIONS)), [
        { rang: 1, demande: 'Fais une évaluation', numero: 0, date: undefined },
        { rang: 3, demande: 'Ajoute un exercice', numero: 1, date: undefined },
        { rang: 5, demande: 'Barème sur 10', numero: 2, date: undefined }
    ]);
    /* L'heure de la version, notée à sa réception. */
    assert.strictEqual(Albert.versionsProjet([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b', date: 5 }])[0].date, 5);
    /* Une demande en attente n'est pas une version. */
    assert.strictEqual(Albert.versionsProjet(TROIS_VERSIONS.slice(0, 5)).length, 2);
});

test('reprendreVersion : la version reprise passe en dernier avec sa demande, rien ne sort', () => {
    const reprise = Albert.reprendreVersion(TROIS_VERSIONS, 1);
    assert.deepStrictEqual(reprise.map(m => m.content),
        ['Ajoute un exercice', 'Version 2', 'Barème sur 10', 'Version 3', 'Consigne : Fais une évaluation', 'Version 1']);
    /* C'est elle qui part avec la demande suivante. */
    assert.strictEqual(Albert.messagesProjet([...reprise, { role: 'user', content: 'Suite' }])[1].content, 'Version 1');
    assert.strictEqual(TROIS_VERSIONS[1].content, 'Version 1');
});

test('limiterVersions : au-delà du plafond, les plus anciennes sortent avec leur demande', () => {
    const conv = Array.from({ length: Albert.VERSIONS_MAX + 2 }, (_, i) => [
        { role: 'user', content: 'Demande ' + i },
        { role: 'assistant', content: 'Version ' + i }
    ]).flat();
    const gardees = Albert.limiterVersions(conv);
    assert.strictEqual(gardees.length, 2 * Albert.VERSIONS_MAX);
    assert.strictEqual(gardees[0].content, 'Demande 2');
    assert.strictEqual(gardees.at(-1).content, 'Version ' + (Albert.VERSIONS_MAX + 1));
    /* Sous le plafond, rien ne change. */
    assert.strictEqual(Albert.limiterVersions(TROIS_VERSIONS), TROIS_VERSIONS);
});

test('entreeConversation : le titre d\'un document ne suit pas ses versions', () => {
    const avant = Albert.entreeConversation('p', 'projet', TROIS_VERSIONS);
    const apres = Albert.entreeConversation('p', 'projet', Albert.reprendreVersion(TROIS_VERSIONS, 1).slice(2), [], '', avant);
    assert.strictEqual(apres.titre, 'Fais une évaluation');
    /* Document qui n'avait que des sources : le titre devient sa première demande. */
    const sources = Albert.entreeConversation('p', 'projet', [], [{ nom: 'cours.pdf', texte: 'a' }]);
    assert.strictEqual(Albert.entreeConversation('p', 'projet', TROIS_VERSIONS, [], '', sources).titre, 'Fais une évaluation');
});

test('formuleOdt : la source LaTeX d\'un objet formule, sinon son écriture LibreOffice', () => {
    const objet = (annotations) => '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mn>1</mn></mrow>' + annotations + '</semantics></math>';
    const frac = String.fromCharCode(92) + 'frac{a}{b}';
    /* Fichier exporté par Albert Go : la source LaTeX y est gardée. */
    assert.strictEqual(Albert.formuleOdt(objet('<annotation encoding="application/x-tex">' + frac + ' &lt; 1</annotation>'
        + '<annotation encoding="StarMath 5.0">{a} over {b} &lt; 1</annotation>')), '$' + frac + ' < 1$');
    /* Fichier écrit dans LibreOffice : seule son écriture StarMath existe. */
    assert.strictEqual(Albert.formuleOdt(objet('<annotation encoding="StarMath 5.0">{a} over {b} &amp; c</annotation>')), '[formule : {a} over {b} & c]');
    assert.strictEqual(Albert.formuleOdt(objet('')), '');
    assert.strictEqual(Albert.formuleOdt(''), '');
});

test('texteOmml : une équation Word reste lisible en texte', () => {
    /* Faux nœuds : la lecture ne regarde que nodeType, localName, childNodes et textContent. */
    const e = (localName, ...enfants) => {
        const childNodes = enfants.map((x) => (typeof x === 'string' ? { nodeType: 3, textContent: x, childNodes: [] } : x));
        return { nodeType: 1, localName, childNodes, get textContent() { return childNodes.map((c) => c.textContent).join(''); } };
    };
    const r = (texte) => e('r', e('rPr', e('nor')), e('t', texte));
    const equation = e('oMath',
        e('f', e('fPr'), e('num', r('48')), e('den', r('60'))), r('='),
        e('sSup', e('e', r('x')), e('sup', r('2'))), r('+'),
        e('sSub', e('e', r('u')), e('sub', r('n'))), r('+'),
        e('rad', e('radPr', e('degHide')), e('deg'), e('e', r('2'))));
    /* Sans cela, 48/60 sortait "4860". */
    assert.strictEqual(Albert.texteOmml(equation), '(48)/(60)=x^(2)+u_(n)+racine(2)');
});

test('nomLibre : un nom déjà pris est numéroté', () => {
    assert.strictEqual(Albert.nomLibre('image.png', ['cours.pdf']), 'image.png');
    assert.strictEqual(Albert.nomLibre('image.png', ['image.png']), 'image (2).png');
    assert.strictEqual(Albert.nomLibre('image.png', ['image.png', 'image (2).png']), 'image (3).png');
    assert.strictEqual(Albert.nomLibre('image collée', ['image collée']), 'image collée (2)');
});

test('température : le curseur s\'arrête à la borne d\'Albert pour la conversation', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const [, min, max] = page.match(/id="temperature"\s+min="([\d.]+)"\s+max="([\d.]+)"/);
    assert.deepStrictEqual([Number(min), Number(max)], [0, Albert.TEMPERATURE_MAX]);
    assert.strictEqual(Albert.TEMPERATURE_MAX, 2);
});

test('plafonnee : réponse écourtée seulement au-delà de 1', () => {
    assert.strictEqual(Albert.plafonnee({ temperature: 1 }).max_tokens, undefined);
    assert.strictEqual(Albert.plafonnee({ temperature: 1.1 }).max_tokens, Albert.JETONS_EXPERIENCE);
    assert.strictEqual(Albert.plafonnee({ temperature: 2, max_tokens: 50 }).max_tokens, 50);
    assert.strictEqual(Albert.plafonnee({}).max_tokens, undefined);
});

test('repondre : le plafond part bien dans la requête', async () => {
    const avant = globalThis.fetch;
    let envoye = null;
    globalThis.fetch = async (url, options) => {
        if (options && options.body) {
            envoye = JSON.parse(options.body);
        }
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    };
    try {
        await Albert.repondre('cle', { model: 'm', temperature: 1.5, messages: [] }, new AbortController().signal);
        assert.strictEqual(envoye.max_tokens, Albert.JETONS_EXPERIENCE);
    } finally {
        globalThis.fetch = avant;
    }
});

test('topK : envoyé seulement sous la position "sans limite" du curseur', () => {
    assert.deepStrictEqual(Albert.topK(5), { top_k: 5 });
    assert.deepStrictEqual(Albert.topK(1), { top_k: 1 });
    assert.deepStrictEqual(Albert.topK(Albert.TOP_K_SANS_LIMITE), {});
    assert.deepStrictEqual(Albert.topK(Albert.CONSEILLES.topK), { top_k: 40 });
    assert.strictEqual(Albert.cleAideTopK(1), 'reglages.aide-top-k-un');
    assert.strictEqual(Albert.cleAideTopK(40), 'reglages.aide-top-k');
    assert.strictEqual(Albert.cleAideTopK(Albert.TOP_K_SANS_LIMITE), 'reglages.aide-top-k-tous');
    const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const [, min, max] = page.match(/id="top-k"\s+min="(\d+)"\s+max="(\d+)"/);
    assert.deepStrictEqual([Number(min), Number(max)], [1, Albert.TOP_K_SANS_LIMITE]);
});

test('sourcesCochees : les fichiers de la bibliothèque cochés pour ce document, dans son ordre', () => {
    const fichiers = [{ nom: 'a.pdf', texte: 'A' }, { nom: 'b.pdf', texte: 'B' }, { nom: 'c.pdf', texte: 'C' }];
    assert.deepStrictEqual(Albert.sourcesCochees(fichiers, ['c.pdf', 'a.pdf', 'absent.pdf']).map(d => d.nom), ['a.pdf', 'c.pdf']);
    assert.deepStrictEqual(Albert.sourcesCochees(fichiers, []), []);
});

test('versBibliotheque : les sources gardées avec chaque document passent dans la bibliothèque', () => {
    const anciennes = [
        { id: 'p1', outil: 'projet', messages: [], documents: [{ nom: 'cours.pdf', texte: 'A' }, { nom: 'carte.png', texte: 'B' }] },
        { id: 'p2', outil: 'projet', messages: [], documents: [{ nom: 'cours.pdf', texte: 'A' }, { nom: 'carte.png', texte: 'autre' }] },
        { id: 'd1', outil: 'discuter', messages: [] }
    ];
    const reprise = Albert.versBibliotheque(anciennes, [{ nom: 'deja.txt', texte: 'D' }]);
    assert.strictEqual(reprise.change, true);
    /* Même nom et même texte : un seul fichier. Même nom, autre texte : renommé. */
    assert.deepStrictEqual(reprise.bibliotheque.map(d => d.nom), ['deja.txt', 'cours.pdf', 'carte.png', 'carte (2).png']);
    assert.deepStrictEqual(reprise.conversations[0].sources, ['cours.pdf', 'carte.png']);
    assert.deepStrictEqual(reprise.conversations[1].sources, ['cours.pdf', 'carte (2).png']);
    assert.ok(reprise.conversations.every(c => !('documents' in c)));
    assert.ok(!('sources' in reprise.conversations[2]));
    /* Déjà reprises : rien ne change. Les entrées d'origine ne sont pas modifiées. */
    assert.strictEqual(Albert.versBibliotheque(reprise.conversations, reprise.bibliotheque).change, false);
    assert.ok('documents' in anciennes[0]);
});

test('sansSource : un fichier supprimé de la bibliothèque quitte tous les documents', () => {
    const liste = [{ id: 'p1', sources: ['a.pdf', 'b.pdf'] }, { id: 'p2', sources: ['b.pdf'] }, { id: 'd1' }];
    assert.deepStrictEqual(Albert.sansSource(liste, 'b.pdf').map(c => c.sources), [['a.pdf'], [], undefined]);
    assert.deepStrictEqual(liste[0].sources, ['a.pdf', 'b.pdf']);
});

test('nomTexte : le texte d\'un fichier se télécharge en .txt, sauf s\'il est déjà du texte', () => {
    assert.strictEqual(Albert.nomTexte('cours.pdf'), 'cours.pdf.txt');
    assert.strictEqual(Albert.nomTexte('photo.PNG'), 'photo.PNG.txt');
    assert.strictEqual(Albert.nomTexte('notes.txt'), 'notes.txt');
    assert.strictEqual(Albert.nomTexte('liste.CSV'), 'liste.CSV');
    assert.strictEqual(Albert.nomTexte('sujet.tex'), 'sujet.tex');
    assert.strictEqual(Albert.nomTexte('sans extension'), 'sans extension.txt');
    /* Une page ou un script déposé revient en texte, pas sous une extension qui s'exécute. */
    assert.strictEqual(Albert.nomTexte('page.html'), 'page.html.txt');
    assert.strictEqual(Albert.nomTexte('script.js'), 'script.js.txt');
});

test('sansGras : dans Imprimerie, un document ne garde aucun gras, sauf dans le code', () => {
    const document = [
        '**ÉVALUATION : Pythagore**',
        '### **Exercice 1 : calculs (6 points)**',
        '**Durée** : 1 h, **Points** : 8',
        '| **Total** |  | **20** |',
        '**1.** Calculer __BC__.',
        'Le code `a**b` et `__init__` reste tel quel, **pas ceci**.',
        '```python',
        '# **commentaire** de code',
        'x = 2**3',
        '```',
        'Un astérisque seul * et une *italique* restent.'
    ].join('\n');
    assert.strictEqual(Albert.sansGras(document), [
        'ÉVALUATION : Pythagore',
        '### Exercice 1 : calculs (6 points)',
        'Durée : 1 h, Points : 8',
        '| Total |  | 20 |',
        '1. Calculer BC.',
        'Le code `a**b` et `__init__` reste tel quel, pas ceci.',
        '```python',
        '# **commentaire** de code',
        'x = 2**3',
        '```',
        'Un astérisque seul * et une *italique* restent.'
    ].join('\n'));
    assert.strictEqual(Albert.sansGras('Sans gras'), 'Sans gras');
});
