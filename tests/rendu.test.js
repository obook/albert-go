/*
 * rendu.test.js
 * Tests de public/js/rendu.js : formules protégées, adresses dangereuses.
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
global.marked = require('../public/vendor/marked/marked.umd.js');
const Rendu = require('../public/js/rendu.js');

test('versHtml : les formules traversent Marked intactes', () => {
    const html = Rendu.versHtml('Soit $\\frac{a}{b}$ et\n\n\\[x_1 = \\sqrt{2}\\]\n\n**gras**');
    assert.ok(html.includes('$\\frac{a}{b}$'));
    assert.ok(html.includes('\\[x_1 = \\sqrt{2}\\]'));
    assert.ok(html.includes('<strong>gras</strong>'));
});

test('urlDangereuse : schémas exécutables refusés', () => {
    assert.ok(Rendu.urlDangereuse('href', 'java\tscript:alert(1)'));
    assert.ok(Rendu.urlDangereuse('src', 'data:image/svg+xml;base64,AAAA'));
    assert.ok(Rendu.urlDangereuse('href', 'data:text/html,<b>'));
    assert.ok(!Rendu.urlDangereuse('href', 'https://albert.api.etalab.gouv.fr'));
    assert.ok(!Rendu.urlDangereuse('src', 'data:image/png;base64,AAAA'));
    assert.ok(!Rendu.urlDangereuse('title', 'javascript:x'));
});
