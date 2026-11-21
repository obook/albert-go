/*
 * n8n.test.js
 * Tests des nœuds Code du workflow n8n/albert-proxy.json.
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

test('Compteur : le jour seul, pour les appels acceptés', () => {
    assert.deepStrictEqual(noeud('Compteur')({}), [{ json: { jour: new Date().toISOString().slice(0, 10) } }]);
    assert.deepStrictEqual(noeud('Compteur')({}, 401), []);
});

test('Noter l\'appel : une ligne par jour, incrémentée', () => {
    const { filters, columns } = trouver('Noter l\'appel').parameters;
    const evaluer = (expr, json) => new Function('$json', '$', 'return ' + expr.slice(3, -2))(
        json, n => ({ first: () => ({ json: { jour: n === 'Compteur' ? '2026-10-02' : null } }) }));
    assert.strictEqual(evaluer(filters.conditions[0].keyValue, {}), '2026-10-02');
    assert.strictEqual(evaluer(columns.value.jour, {}), '2026-10-02');
    /* Premier appel du jour : "Lire le jour" sort un élément vide. */
    assert.strictEqual(trouver('Lire le jour').alwaysOutputData, true);
    assert.strictEqual(evaluer(columns.value.appels, {}), 1);
    assert.strictEqual(evaluer(columns.value.appels, { jour: '2026-10-02', appels: 4 }), 5);
});

test('Lire stats : appels par jour, table vide', () => {
    const lignes = [{ json: { id: 1, jour: '2026-09-26', appels: 1000 } }, { json: { id: 2, jour: '2026-10-02', appels: 3 } }];
    assert.deepStrictEqual(noeud('Lire stats')(lignes), [{ json: { '2026-09-26': { appels: 1000 }, '2026-10-02': { appels: 3 } } }]);
    assert.strictEqual(trouver('Lire appels').alwaysOutputData, true);
    assert.deepStrictEqual(noeud('Lire stats')([{ json: {} }]), [{ json: {} }]);
});

test('Câblage : la réponse part avant le compte, rien sur la clé', () => {
    const texte = JSON.stringify(workflow);
    assert.ok(!texte.includes('getWorkflowStaticData') && !texte.includes('empreinte'));
    for (const [albert, reponse] of [['Albert modèles', 'Réponse modèles'], ['Albert chat', 'Réponse chat']]) {
        assert.deepStrictEqual(suivants(albert).sort(), ['Compteur', reponse].sort());
        /* executionOrder v1 : la branche la plus haute passe en premier. */
        assert.ok(trouver(reponse).position[1] < trouver('Compteur').position[1]);
    }
    assert.deepStrictEqual(suivants('Compteur'), ['Lire le jour']);
    assert.deepStrictEqual(suivants('Lire le jour'), ['Noter l\'appel']);
    assert.deepStrictEqual(suivants('Webhook stats'), ['Lire appels', 'Purger']);
    assert.deepStrictEqual(suivants('Lire appels'), ['Lire stats']);
    for (const n of workflow.nodes.filter(n => n.type.endsWith('dataTable'))) {
        assert.strictEqual(n.parameters.dataTableId.value, 'albert-go-compteur');
    }
});

test('Purger : lignes de plus de 90 jours', () => {
    const [condition] = trouver('Purger').parameters.filters.conditions;
    assert.strictEqual(condition.keyName, 'jour');
    assert.strictEqual(condition.condition, 'lt');
    const limite = new Function('return ' + condition.keyValue.slice(3, -2))();
    assert.strictEqual(limite, new Date(Date.now() - 89 * 864e5).toISOString().slice(0, 10));
});

test('Albert audio : le format de réponse suit la demande, json par défaut', () => {
    const { value } = trouver('Albert audio').parameters.bodyParameters.parameters.find(p => p.name === 'response_format');
    const evaluer = body => new Function('$json', 'return ' + value.slice(3, -2))({ body });
    assert.strictEqual(evaluer({ response_format: 'diarized_json' }), 'diarized_json');
    assert.strictEqual(evaluer({}), 'json');
});

test('Nœuds Albert : réponse lue telle quelle, une page d\'erreur HTML repart avec son code', () => {
    /* En json, une page 502 de nginx fait échouer le workflow : n8n répond 500 "Workflow execution failed". */
    for (const nom of ['Albert chat', 'Albert modèles', 'Albert audio', 'Albert vecteurs']) {
        assert.deepStrictEqual(trouver(nom).parameters.options.response.response,
            { fullResponse: true, neverError: true, responseFormat: 'autodetect' }, nom);
    }
});
