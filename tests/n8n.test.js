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

const trouver = nom => workflow.nodes.find(n => n.name === nom);
const suivants = nom => workflow.connections[nom].main[0].map(c => c.node);

function noeud(nom, webhook = 'Webhook modèles') {
    const code = trouver(nom).parameters.jsCode;
    return (entree, statusCode = 200) => new Function('$input', '$', code)(
        { first: () => ({ json: { statusCode } }), all: () => entree },
        n => {
            assert.strictEqual(n, webhook);
            return { first: () => ({ json: { headers: entree } }) };
        });
}

test('Compteur : jour et empreinte, sans la clé', () => {
    const compter = noeud('Compteur');
    const [a] = compter({ authorization: 'Bearer cle-secrete-1' });
    const [b] = compter({ authorization: 'Bearer cle-secrete-1' });
    const [c] = compter({ authorization: 'Bearer cle-secrete-2' });

    assert.strictEqual(a.json.jour, new Date().toISOString().slice(0, 10));
    assert.strictEqual(a.json.empreinte, b.json.empreinte);
    assert.notStrictEqual(a.json.empreinte, c.json.empreinte);
    assert.ok(!JSON.stringify([a, c]).includes('cle-secrete'));
    assert.deepStrictEqual(compter({ authorization: 'Bearer cle-refusee' }, 401), []);
    assert.deepStrictEqual(noeud('Compteur chat', 'Webhook chat')({ authorization: 'Bearer cle-secrete-1' }), [a]);
});

test('Lire stats : appels et utilisateurs par jour, table vide', () => {
    const lignes = [['2026-10-01', 'a'], ['2026-10-01', 'a'], ['2026-10-01', 'b'], ['2026-10-02', 'a']]
        .map(([jour, empreinte]) => ({ json: { id: 1, jour, empreinte } }));
    assert.deepStrictEqual(noeud('Lire stats')(lignes), [{ json: {
        '2026-10-01': { appels: 3, utilisateurs: 2 },
        '2026-10-02': { appels: 1, utilisateurs: 1 }
    } }]);
    /* Table vide : "Lire appels" sort un élément vide, sinon la réponse ne part pas. */
    assert.strictEqual(trouver('Lire appels').alwaysOutputData, true);
    assert.deepStrictEqual(noeud('Lire stats')([{ json: {} }]), [{ json: {} }]);
});

test('Câblage : la réponse part avant le compte, plus de données statiques', () => {
    assert.ok(!JSON.stringify(workflow).includes('getWorkflowStaticData'));
    for (const [albert, reponse, compteur] of [['Albert modèles', 'Réponse modèles', 'Compteur'], ['Albert chat', 'Réponse chat', 'Compteur chat']]) {
        assert.deepStrictEqual(suivants(albert).sort(), [compteur, reponse].sort());
        /* executionOrder v1 : la branche la plus haute passe en premier. */
        assert.ok(trouver(reponse).position[1] < trouver(compteur).position[1]);
        assert.deepStrictEqual(suivants(compteur), ['Noter l\'appel']);
    }
    assert.deepStrictEqual(suivants('Webhook stats'), ['Lire appels', 'Purger']);
    assert.deepStrictEqual(suivants('Lire appels'), ['Lire stats']);
});

test('Purger : lignes de plus de 90 jours', () => {
    const [condition] = trouver('Purger').parameters.filters.conditions;
    assert.strictEqual(condition.keyName, 'jour');
    assert.strictEqual(condition.condition, 'lt');
    const limite = new Function('return ' + condition.keyValue.slice(3, -2))();
    assert.strictEqual(limite, new Date(Date.now() - 89 * 864e5).toISOString().slice(0, 10));
});
