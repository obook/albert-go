/*
 * recherche.test.js
 * Tests de public/js/recherche.js : mise en forme et clé refusée.
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
const Recherche = require('../public/js/recherche.js');

test('formater : les deux jeux de champs, Mojeek et Google', () => {
    const bloc = Recherche.formater([
        { title: 'Eduscol', url: 'https://eduscol.education.fr', desc: 'Portail' },
        { title: 'Data', link: 'https://data.gouv.fr', snippet: 'Données' }
    ]);
    assert.ok(bloc.includes('- Eduscol (https://eduscol.education.fr) : Portail'));
    assert.ok(bloc.includes('- Data (https://data.gouv.fr) : Données'));
    assert.strictEqual(Recherche.formater([]), '');
});

test('formater : une ligne par résultat, rien sans résultat', () => {
    const bloc = Recherche.formater([
        { title: 'Eduscol', url: 'https://eduscol.education.fr', desc: 'Portail' },
        { url: 'https://data.gouv.fr' }
    ]);
    assert.strictEqual(bloc.split('\n').length, 2);
    assert.ok(bloc.includes('- Eduscol (https://eduscol.education.fr) : Portail'));
    assert.ok(bloc.includes('- https://data.gouv.fr (https://data.gouv.fr) : '));
    assert.strictEqual(Recherche.formater([]), '');
});

test('OUTIL : format attendu par le champ tools de l\'API', () => {
    assert.strictEqual(Recherche.OUTIL.type, 'function');
    assert.strictEqual(Recherche.OUTIL.function.name, 'recherche_web');
    assert.deepStrictEqual(Recherche.OUTIL.function.parameters.required, ['q']);
});

test('chercher : clé refusée, le message de Mojeek remonte', async () => {
    global.fetch = async () => ({
        ok: true,
        json: async () => ({ response: { status: 'Access Denied: invalid key/password', results: [] } })
    });
    await assert.rejects(Recherche.chercher('mojeek', 'fausse', 'test'), /invalid key/);
});

test('chercher : clé refusée, le message de Google remonte', async () => {
    global.fetch = async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 403, message: 'API key not valid' } })
    });
    await assert.rejects(Recherche.chercher('google', 'fausse', 'test'), /API key not valid/);
});

test('chercher : la clé et la question sont encodées dans l\'adresse', async () => {
    let vue = '';
    global.fetch = async (adresse) => {
        vue = adresse;
        return { ok: true, json: async () => ({ response: { results: [{ url: 'https://x' }] } }) };
    };
    const resultats = await Recherche.chercher('mojeek', 'clé/1', 'chat de l\'État');
    assert.ok(vue.includes('api_key=cl%C3%A9%2F1'));
    assert.ok(vue.includes('q=chat%20de%20l\'%C3%89tat') || vue.includes('q=chat%20de%20l%27%C3%89tat'));
    assert.strictEqual(resultats.length, 1);
});

test('chercher : Google renvoie items, avec le moteur cx dans l\'adresse', async () => {
    let vue = '';
    global.fetch = async (adresse) => {
        vue = adresse;
        return { ok: true, json: async () => ({ items: [{ title: 'A', link: 'https://a', snippet: 'b' }] }) };
    };
    const resultats = await Recherche.chercher('google', 'cle', 'test');
    assert.ok(vue.startsWith(Recherche.GOOGLE + '?'));
    assert.ok(vue.includes('cx=' + Recherche.CX));
    assert.strictEqual(resultats[0].link, 'https://a');
});

test('passages : le résumé, puis la section qui répond', () => {
    const article = 'Résumé de l\'article.\n'
        + '== Géographie ==\nLa commune borde l\'océan.\n'
        + '== Toponymie ==\nLe nom est attesté sous la forme Cap Bertou en 1170.';
    const garde = Recherche.passages(article, 'Quelle est l\'origine du nom, sa toponymie ?');
    assert.ok(garde.startsWith('Résumé de l\'article.'));
    assert.ok(garde.includes('Cap Bertou'));
    assert.ok(!garde.includes('borde l\'océan'));
});

test('passages : aucune section ne répond, le résumé seul', () => {
    const article = 'Résumé.\n== Géographie ==\nLa commune borde l\'océan.';
    assert.strictEqual(Recherche.passages(article, 'toponymie étymologie'), 'Résumé.');
});

test('chercherWikipedia : sans clé, articles dans l\'ordre de la recherche', async () => {
    let vue = '';
    global.fetch = async (adresse) => {
        vue = adresse;
        return { ok: true, json: async () => ({ query: { pages: {
            '2': { index: 2, title: 'Second', fullurl: 'https://fr.wikipedia.org/wiki/Second', extract: 'B.' },
            '1': { index: 1, title: 'Premier', fullurl: 'https://fr.wikipedia.org/wiki/Premier', extract: 'A.' }
        } } }) };
    };
    const resultats = await Recherche.chercherWikipedia('chat de l\'État');
    assert.ok(vue.startsWith(Recherche.WIKIPEDIA + '?'));
    assert.ok(vue.includes('origin=*'));
    assert.ok(!vue.includes('key='));
    assert.deepStrictEqual(resultats.map(r => r.title), ['Premier', 'Second']);
    assert.strictEqual(resultats[0].desc, 'A.');
});

test('chercherWikipedia : une erreur de l\'API remonte', async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ error: { info: 'paramètre inconnu' } }) });
    await assert.rejects(Recherche.chercherWikipedia('test'), /paramètre inconnu/);
});
