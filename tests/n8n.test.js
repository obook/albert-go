/*
 * n8n.test.js
 * Tests des nœuds Code du workflow n8n/albert-proxy.json.
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
const workflow = require('../n8n/albert-proxy.json');

function noeud(nom, stats) {
    const code = workflow.nodes.find(n => n.name === nom).parameters.jsCode;
    return (headers, statusCode = 200) => new Function('$input', '$', '$getWorkflowStaticData', code)(
        { first: () => ({ json: { statusCode } }), all: () => [{ json: { statusCode } }] },
        () => ({ first: () => ({ json: { headers } }) }),
        () => stats);
}

test('Compteur : appels et utilisateurs distincts, sans la clé', () => {
    const stats = {};
    const compter = noeud('Compteur', stats);
    const item = compter({ authorization: 'Bearer cle-secrete-1', origin: 'https://a.fr' });
    compter({ authorization: 'Bearer cle-secrete-1', origin: 'https://a.fr' });
    compter({ authorization: 'Bearer cle-secrete-2' });
    compter({ authorization: 'Bearer cle-refusee' }, 401);

    assert.deepStrictEqual(item, [{ json: { statusCode: 200 } }]);
    assert.ok(!JSON.stringify(stats).includes('cle-secrete'));
    const [jours] = noeud('Lire stats', stats)();
    assert.deepStrictEqual(Object.values(jours.json),
        [{ appels: 3, utilisateurs: 2 }]);
});

test('Compteur : garde 90 jours', () => {
    const stats = {};
    for (let i = 0; i < 100; i++) stats[`2000-01-${String(i).padStart(3, '0')}`] = {};
    noeud('Compteur', stats)({ authorization: 'Bearer x' });
    assert.strictEqual(Object.keys(stats).length, 90);
    assert.ok(stats[new Date().toISOString().slice(0, 10)]);
});
