/*
 * albert.test.js
 * Tests de public/js/albert.js, le noyau : réglages, demandes, appels à Albert, erreurs.
 * Les morceaux de public/js/albert/ ont leurs tests dans tests/albert/.
 *
 * i18n.js d'abord : albert.js lit ses textes avec t, variable globale.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
/* Retiré le 21/11/2026 : la page se lit par page-complete.js.
const fs = require('node:fs');
const path = require('node:path');
*/
require('../public/js/socle/i18n.js');
const Albert = require('../public/js/albert.js');
const { lirePageComplete } = require('./page-complete.js');

/* Sous Node, pas de serveur.js : les tests supposent un serveur, sauf ceux de la version en ligne. */
Albert.EN_LIGNE = false;

test('contexte : le curseur, la valeur conseillée et les phrases', () => {
    const page = lirePageComplete();
    const [, min, max] = page.match(/id="echanges"\s+min="(\d+)"\s+max="(\d+)"/);
    assert.deepStrictEqual([Number(min), Number(max)], [0, Albert.ECHANGES_TOUS]);
    assert.strictEqual(Albert.CONSEILLES.echanges, Albert.ECHANGES_TOUS);
    assert.strictEqual(Albert.cleAideEchanges(0), 'reglages.aide-echanges-aucun');
    assert.strictEqual(Albert.cleAideEchanges(1), 'reglages.aide-echanges-un');
    assert.strictEqual(Albert.cleAideEchanges(3), 'reglages.aide-echanges');
    assert.strictEqual(Albert.cleAideEchanges(Albert.ECHANGES_TOUS), 'reglages.aide-echanges-tous');
});

test('joindre : question seule, fichier seul, les deux', () => {
    const piece = { nom: 'notes.txt', texte: 'Ligne 1' };
    assert.strictEqual(Albert.joindre('Résume', null), 'Résume');
    assert.strictEqual(Albert.joindre('', piece), 'Contenu du fichier "notes.txt" :\n\nLigne 1');
    assert.strictEqual(Albert.joindre('Résume', piece), 'Résume\n\nContenu du fichier "notes.txt" :\n\nLigne 1');
});

test('avecImage :la dernière question porte l\'image, le reste ne change pas', () => {
    const messages = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'transcription' }];
    const image = { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA' } };
    assert.deepStrictEqual(Albert.avecImage(messages, 'Décris', image.image_url.url),
        [messages[0], messages[1], { role: 'user', content: [{ type: 'text', text: 'Décris' }, image] }]);
    assert.deepStrictEqual(Albert.avecImage(messages, '', image.image_url.url).at(-1).content, [image]);
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

test('messageErreur : clé refusée', () => {
    assert.match(Albert.messageErreur(401, { detail: 'Not authenticated' }), /Clé du serveur refusée/);
});

test('messageErreur : autre poste refusé par le serveur hors kiosque', () => {
    assert.match(Albert.messageErreur(403, { detail: 'x', reseau: 'refuse' }), /session kiosque/);
});

test('messageErreur : quota', () => {
    assert.match(Albert.messageErreur(429, null), /Quota/);
});

test('messageErreur : Albert injoignable derrière le serveur', () => {
    assert.match(Albert.messageErreur(502, null), /Albert ne répond pas/);
});

test('messageErreur : détail texte repris, détail objet ignoré', () => {
    assert.strictEqual(Albert.messageErreur(404, { detail: 'Model not found' }), 'Erreur 404 : Model not found');
    assert.strictEqual(Albert.messageErreur(422, { detail: [{ msg: 'x' }] }), 'Erreur 422.');
});

test('construireDemande : Rédiger', () => {
    assert.strictEqual(Albert.construireDemande('rediger', 'Notes', 'auto', 'en'),
        'Rédige un courrier à partir de ces notes :\n\nNotes');
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

test('OUTILS : Discussion et Projet sont à fil et ont des sources, Projet seul a des documents', () => {
    assert.deepStrictEqual(Albert.OUTILS.discuter, { consigne: 'discuter.txt', fil: true, sources: true });
    assert.deepStrictEqual(Albert.OUTILS.projet, { consigne: 'discuter.txt', complement: 'projet.txt', fil: true, sources: true, documents: true });
    assert.ok(!Albert.OUTILS.corriger.fil);
    assert.ok(!Albert.OUTILS.corriger.sources);
});

test('nomLibre : un nom déjà pris est numéroté', () => {
    assert.strictEqual(Albert.nomLibre('image.png', ['cours.pdf']), 'image.png');
    assert.strictEqual(Albert.nomLibre('image.png', ['image.png']), 'image (2).png');
    assert.strictEqual(Albert.nomLibre('image.png', ['image.png', 'image (2).png']), 'image (3).png');
    assert.strictEqual(Albert.nomLibre('image collée', ['image collée']), 'image collée (2)');
});

test('température : le curseur s\'arrête à la borne d\'Albert pour la conversation', () => {
    const page = lirePageComplete();
    const [, min, max] = page.match(/id="temperature"\s+min="([\d.]+)"\s+max="([\d.]+)"/);
    assert.deepStrictEqual([Number(min), Number(max)], [0, Albert.TEMPERATURE_MAX]);
    assert.strictEqual(Albert.TEMPERATURE_MAX, 2);
});

/* Plafond retiré le 15 novembre 2026, voir JETONS_EXPERIENCE dans albert.js. */
/*
test('plafonnee : réponse écourtée seulement au-delà de 1', () => {
    assert.strictEqual(Albert.plafonnee({ temperature: 1 }).max_tokens, undefined);
    assert.strictEqual(Albert.plafonnee({ temperature: 1.1 }).max_tokens, Albert.JETONS_EXPERIENCE);
    assert.strictEqual(Albert.plafonnee({ temperature: 2, max_tokens: 50 }).max_tokens, 50);
    assert.strictEqual(Albert.plafonnee({}).max_tokens, undefined);
});
*/

test('repondre : la requête part telle quelle, sans plafond de jetons', async () => {
    const avant = globalThis.fetch;
    let envoye = null;
    globalThis.fetch = async (url, options) => {
        if (options && options.body) {
            envoye = JSON.parse(options.body);
        }
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    };
    try {
        await Albert.repondre({ model: 'm', temperature: 1.5, messages: [] }, new AbortController().signal);
        /* assert.strictEqual(envoye.max_tokens, Albert.JETONS_EXPERIENCE); */
        assert.strictEqual(envoye.max_tokens, undefined);
    } finally {
        globalThis.fetch = avant;
    }
});

test('repondre : une réponse coupée par la longueur est signalée', async () => {
    const avant = globalThis.fetch;
    let fin = 'length';
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: fin }] }) });
    try {
        assert.strictEqual((await Albert.repondre({ model: 'm', messages: [] }, new AbortController().signal)).coupee, true);
        fin = 'stop';
        assert.strictEqual((await Albert.repondre({ model: 'm', messages: [] }, new AbortController().signal)).coupee, false);
    } finally {
        globalThis.fetch = avant;
    }
});

test('repondre : appelle /v1 du serveur, sans clé', async () => {
    const avant = globalThis.fetch;
    let appel = null;
    globalThis.fetch = async (url, options) => {
        appel = { url, options };
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    };
    try {
        await Albert.repondre({ model: 'm', messages: [] }, new AbortController().signal);
        assert.strictEqual(appel.url, '/v1/chat/completions');
        assert.strictEqual(appel.options.headers.Authorization, undefined);
    } finally {
        globalThis.fetch = avant;
    }
});

test('version en ligne : relais n8n et clé de l\'utilisateur', async () => {
    const avant = globalThis.fetch;
    const appels = [];
    globalThis.fetch = async (url, options) => {
        appels.push({ url, options });
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }], data: [] }) };
    };
    Albert.EN_LIGNE = true;
    Albert.cle = 'sk-test';
    try {
        assert.strictEqual(Albert.pret(), true);
        await Albert.repondre({ model: 'm', messages: [] }, new AbortController().signal);
        await Albert.modeles('sk-autre');
        assert.strictEqual(appels[0].url, Albert.RELAIS + '/chat/completions');
        assert.strictEqual(appels[0].options.headers.Authorization, 'Bearer sk-test');
        assert.strictEqual(appels[1].options.headers.Authorization, 'Bearer sk-autre');
        assert.match(Albert.messageErreur(401, null), /^Clé refusée/);
        Albert.cle = null;
        assert.strictEqual(Albert.pret(), false);
    } finally {
        globalThis.fetch = avant;
        Albert.EN_LIGNE = false;
        Albert.cle = null;
    }
});

test('messageErreur : session terminée, retour à la connexion', () => {
    globalThis.location = { href: '/' };
    try {
        Albert.messageErreur(401, { detail: 'Not authenticated' });
        assert.strictEqual(location.href, '/');
        assert.match(Albert.messageErreur(401, { detail: 'x', kiosque: 'terminee' }), /La session est terminée/);
        assert.strictEqual(location.href, '/kiosque?erreur=terminee');
        /* L'invité lit un message seul, sans le formulaire du prof. */
        globalThis.SERVEUR = { kiosque: { role: 'eleve' } };
        Albert.messageErreur(401, { detail: 'x', kiosque: 'terminee' });
        assert.strictEqual(location.href, '/kiosque?terminee');
    } finally {
        delete globalThis.location;
        delete globalThis.SERVEUR;
    }
});
