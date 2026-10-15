/*
 * sw.test.js
 * Tests de public/sw.js : ce que le service worker garde, et ce qu'il laisse passer.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { strategie } = require('../public/sw.js');

const ORIGINE = 'https://exemple.test';
const requete = (url, options = {}) => ({ method: 'GET', mode: 'no-cors', cache: 'default', url: ORIGINE + url, ...options });

test('strategie : la page, les fichiers datés, les consignes et le reste', () => {
    assert.strictEqual(strategie(requete('/albert-go/', { mode: 'navigate' }), ORIGINE), 'page');
    assert.strictEqual(strategie(requete('/albert-go/js/app.js?v=abc123'), ORIGINE), 'version');
    assert.strictEqual(strategie(requete('/albert-go/prompts/fr/projet.txt'), ORIGINE), 'texte');
    assert.strictEqual(strategie(requete('/albert-go/vendor/mermaid/mermaid.min.js'), ORIGINE), 'fichier');
    assert.strictEqual(strategie(requete('/albert-go/images/favicon.svg'), ORIGINE), 'fichier');
});

test('strategie : Albert, le relais et la vérification de version ne sont jamais gardés', () => {
    assert.strictEqual(strategie({ method: 'GET', mode: 'cors', cache: 'default', url: 'https://n8n.incubateur.education.gouv.fr/webhook/albert-go/v1/models' }, ORIGINE), null);
    assert.strictEqual(strategie(requete('/albert-go/x', { method: 'POST' }), ORIGINE), null);
    assert.strictEqual(strategie(requete('/albert-go/js/version.js', { cache: 'no-store' }), ORIGINE), null);
});
