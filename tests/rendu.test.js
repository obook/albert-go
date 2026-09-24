/*
 * rendu.test.js
 * Tests de public/js/rendu.js : formules protégées, adresses dangereuses,
 * réparation des diagrammes Mermaid.
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

test('attributInterdit : gestionnaires, styles et adresses exécutables', () => {
    assert.ok(Rendu.attributInterdit('onclick', 'alert(1)'));
    assert.ok(Rendu.attributInterdit('onerror', ''));
    /* style sert aux fonds et aux positions absolues : il ne vient pas du modèle. */
    assert.ok(Rendu.attributInterdit('style', 'position:fixed'));
    assert.ok(Rendu.attributInterdit('href', 'javascript:alert(1)'));
    assert.ok(Rendu.attributInterdit('src', 'data:text/html,<b>'));
    assert.ok(!Rendu.attributInterdit('href', 'https://eduscol.education.fr'));
    assert.ok(!Rendu.attributInterdit('class', 'important'));
    assert.ok(!Rendu.attributInterdit('title', 'onclick'));
});

test('BALISES_INTERDITES : les balises qui chargent ou exécutent', () => {
    const interdites = Rendu.BALISES_INTERDITES.split(', ');
    for (const balise of ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'svg', 'style']) {
        assert.ok(interdites.includes(balise), balise + ' devrait être retirée');
    }
    /* Le texte et ses liens restent : sans eux il n'y a plus de réponse. */
    for (const balise of ['a', 'p', 'code', 'pre', 'table', 'img']) {
        assert.ok(!interdites.includes(balise), balise + ' ne doit pas être retirée');
    }
});

test('BALISES_INTERDITES_SVG : le HTML embarqué, pas le style', () => {
    const interdites = Rendu.BALISES_INTERDITES_SVG.split(', ');
    /* foreignObject rouvre la porte au HTML au milieu du SVG. */
    assert.ok(interdites.includes('foreignObject'));
    assert.ok(interdites.includes('script'));
    /* Mermaid dessine avec ses propres styles. */
    assert.ok(!interdites.includes('style'));
});

test('BALISES_INTERDITES_SVG_MODELE : ni style global ni animation', () => {
    const interdites = Rendu.BALISES_INTERDITES_SVG_MODELE.split(', ');
    /* <style> du modèle restylerait toute la page ; <set> et <animate> réécrivent un href. */
    for (const balise of ['script', 'foreignObject', 'style', 'animate', 'set']) {
        assert.ok(interdites.includes(balise), balise + ' devrait être retirée');
    }
});

test('assainir : sans DOM, le HTML repart tel quel', () => {
    /* Sous Node le nettoyage est sauté : c'est le navigateur qui le fait. */
    assert.strictEqual(typeof document, 'undefined');
    assert.strictEqual(Rendu.assainir('<p>Texte</p>'), '<p>Texte</p>');
});

test('reparerMermaid : guillemets autour des étiquettes à parenthèses', () => {
    const code = 'graph TD\n A[Début (x)] --> B{Moyenne (sur 20) ?}\n B -->|si (vrai)| C[(Base)]\n C --> D["Déjà (ok)"]';
    assert.strictEqual(Rendu.reparerMermaid(code),
        'graph TD\n A["Début (x)"] --> B{"Moyenne (sur 20) ?"}\n B -->|"si (vrai)"| C[(Base)]\n C --> D["Déjà (ok)"]');
});

test('reparerMermaid : fautes reprises d\'albert-board', () => {
    assert.strictEqual(Rendu.reparerMermaid('graph TD\n A[\\"X\\"] → B'), 'graph TD\n A["X"] --> B');
    assert.strictEqual(Rendu.reparerMermaid('graph TD\n J["Triglycéride"} --> K'), 'graph TD\n J["Triglycéride"] --> K');
    assert.strictEqual(Rendu.reparerMermaid('flowchart TD\n subgraph L[""]\n A -->|""| B\n end'),
        'flowchart TD\n subgraph L\n A --> B\n end');
});

test('reparerMermaid : flèche Unicode gardée dans une étiquette', () => {
    assert.strictEqual(Rendu.reparerMermaid('graph TD\n A["x → y"] → B'), 'graph TD\n A["x → y"] --> B');
});

test('reparerMermaid : plage d\'axe xychart seule sur sa ligne', () => {
    assert.strictEqual(Rendu.reparerMermaid('xychart-beta\n y-axis "k€"\n 0 --> 100\n bar [30, 45.5]'),
        'xychart-beta\n y-axis "k€" 0 --> 100\n bar [30, 45.5]');
});

test('reparerMermaid : ligne title avant le type de diagramme', () => {
    assert.strictEqual(Rendu.reparerMermaid('title "Relatifs"\ngraph TD\n A --> B'),
        '---\ntitle: Relatifs\n---\ngraph TD\n A --> B');
});

test('chimieMermaid : \\ce{} écrit en texte, indices et charges en Unicode', () => {
    assert.strictEqual(Rendu.chimieMermaid('A["Glycérol, \\ce{C3H8O3}"] --> B["\\ce{SO4^{2-}}"]'),
        'A["Glycérol, C₃H₈O₃"] --> B["SO₄²⁻"]');
    assert.strictEqual(Rendu.chimieMermaid('A["\\ce{I = \\frac{V}{R}}"]'), 'A["I = (V)/(R)"]');
    assert.strictEqual(Rendu.chimieMermaid('A["\\ce{C3H8"]'), 'A["\\ce{C3H8"]');
    assert.strictEqual(Rendu.chimieMermaid('A["Texte { avec } accolades"]'), 'A["Texte { avec } accolades"]');
});
