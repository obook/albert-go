/*
 * albert/historique.test.js
 * Tests de public/js/albert/historique.js : conversations enregistrées, messages
 * envoyés au modèle et versions d'un document.
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
require('../../public/js/i18n.js');
const Albert = require('../../public/js/albert.js');

/* Sous Node, pas de serveur.js : les tests supposent un serveur, sauf ceux de la version en ligne. */
Albert.EN_LIGNE = false;

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

test('messagesAEnvoyer : le texte de la bulle ne part pas', () => {
    const conv = [{ role: 'user', content: 'Résume\n\nContenu du fichier', affiche: 'Résume\nFichier joint : a.txt' }];
    assert.deepStrictEqual(Albert.messagesAEnvoyer(conv, Albert.ECHANGES_TOUS), [{ role: 'user', content: 'Résume\n\nContenu du fichier' }]);
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

test('naviguer : bornes de l\'historique', () => {
    const h = ['c', 'b', 'a'];
    assert.strictEqual(Albert.naviguer(h, -1, 'haut'), 0);
    assert.strictEqual(Albert.naviguer(h, 2, 'haut'), 2);
    assert.strictEqual(Albert.naviguer(h, 0, 'bas'), -1);
    assert.strictEqual(Albert.naviguer(h, -1, 'bas'), -1);
    assert.strictEqual(Albert.naviguer([], -1, 'haut'), -1);
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

test('versionsEchange et choisirVersionEchange : les versions du dernier échange de Discussion', () => {
    const debut = [{ role: 'user', content: 'Q1' }, { role: 'assistant', content: 'R1' }];
    /* Pas d'échange complet : rien à refaire. */
    assert.deepStrictEqual(Albert.versionsEchange([]), []);
    assert.deepStrictEqual(Albert.versionsEchange(debut.slice(0, 1)), []);
    /* Un échange jamais refait : une seule version, lui-même. */
    const unique = [...debut, { role: 'user', content: 'Q2' }, { role: 'assistant', content: 'R2' }];
    assert.deepStrictEqual(Albert.versionsEchange(unique), [{ question: unique[2], reponse: unique[3] }]);
    /* Nouvelle réponse : elle s'ajoute aux versions et s'affiche. */
    const refaite = [...debut, { role: 'user', content: 'Q2 modifiée' }, { role: 'assistant', content: 'R2 bis' }];
    const versions = [...Albert.versionsEchange(unique), { question: refaite[2], reponse: refaite[3] }];
    const conv = Albert.choisirVersionEchange(refaite, versions, 1);
    assert.deepStrictEqual(conv.map(m => m.content), ['Q1', 'R1', 'Q2 modifiée', 'R2 bis']);
    assert.strictEqual(conv[3].affichee, 1);
    assert.strictEqual(Albert.versionsEchange(conv).length, 2);
    /* Retour à la première version : sa question revient avec elle, le début ne bouge pas. */
    const premiere = Albert.choisirVersionEchange(conv, Albert.versionsEchange(conv), 0);
    assert.deepStrictEqual(premiere.map(m => m.content), ['Q1', 'R1', 'Q2', 'R2']);
    assert.strictEqual(premiere[3].versions.length, 2);
    /* Les versions gardées ne s'emboîtent pas. */
    assert.ok(premiere[3].versions.every(v => !v.reponse.versions));
    /* Seuls role et content partent chez Albert. */
    assert.deepStrictEqual(Albert.messagesAEnvoyer(premiere, Albert.ECHANGES_TOUS).at(-1), { role: 'assistant', content: 'R2' });
});
