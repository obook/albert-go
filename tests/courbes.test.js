/*
 * courbes.test.js
 * Tests de public/js/rendu/courbes.js : lecture du bloc, points, tracé.
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
globalThis.math = require('../public/vendor/mathjs/math.js');
require('../public/js/i18n.js');
globalThis.Calcul = require('../public/js/tools/calcul.js').Calcul;
global.marked = require('../public/vendor/marked/marked.umd.js');
const Rendu = require('../public/js/rendu.js');

/* Sous-chemins et points d'un attribut d du SVG. */
const trace = (svg) => {
    const d = /<path class="courbe"[^>]* d="([^"]*)"/.exec(svg)[1];
    return { morceaux: (d.match(/M/g) || []).length, points: (d.match(/[ML]/g) || []).length };
};

test('lireCourbe : fonctions, puis intervalle, dans les écritures courantes', () => {
    assert.deepStrictEqual(Rendu.lireCourbe('y = x^2\nx = -3 .. 3'),
        { fonctions: [{ nom: 'y = x^2', expression: 'x^2' }], intervalle: ['-3', '3'] });
    const deux = Rendu.lireCourbe('f(x) = sin(x)\ng(x)=cos(x)\nx : [-pi ; pi]');
    assert.deepStrictEqual(deux.fonctions.map(f => f.expression), ['sin(x)', 'cos(x)']);
    assert.deepStrictEqual(deux.intervalle, ['-pi', 'pi']);
    assert.strictEqual(Rendu.lireCourbe('y = x² − 1\nx = 0 .. 2').fonctions[0].expression, 'x^2 - 1');
    assert.throws(() => Rendu.lireCourbe('y = x^2'));
});

test('svgCourbe : la parabole passe par des centaines de points, d\'un seul trait', () => {
    const svg = Rendu.svgCourbe('y = x^2\nx = -3 .. 3');
    const { morceaux, points } = trace(svg);
    assert.strictEqual(morceaux, 1);
    assert.ok(points > 300, points + ' points');
    assert.doesNotMatch(svg, /NaN|Infinity/);
    assert.match(svg, /viewBox="0 0 /);
});

test('svgCourbe : 1/x est coupée en 0, la racine s\'arrête avant les négatifs', () => {
    assert.strictEqual(trace(Rendu.svgCourbe('y = 1/x\nx = -3 .. 3')).morceaux, 2);
    const racine = trace(Rendu.svgCourbe('y = sqrt(x)\nx = -2 .. 4'));
    assert.strictEqual(racine.morceaux, 1);
    assert.ok(racine.points < 300);
});

test('pointsCourbe : sinus en radians, pas en degrés comme la calculatrice', () => {
    const f = Rendu.fonctionCourbe('sin(x)');
    assert.ok(Math.abs(f(Math.PI / 2) - 1) < 1e-12);
    assert.strictEqual(Calcul.evaluer('sin(90)'), 1);
});

test('bornesCourbe : une asymptote n\'écrase pas la courbe', () => {
    const ys = Rendu.pointsCourbe(Rendu.fonctionCourbe('1/x'), -3, 3).map(p => p[1]);
    const [bas, haut] = Rendu.bornesCourbe(ys);
    assert.ok(haut < 30 && bas > -30, bas + ' ' + haut);
    const [min, max] = Rendu.bornesCourbe(Rendu.pointsCourbe(Rendu.fonctionCourbe('x^2'), -3, 3).map(p => p[1]));
    assert.ok(min <= 0 && max >= 9);
});

test('legendeCourbe : écriture mathématique, pas la syntaxe de math.js', () => {
    assert.strictEqual(Rendu.legendeCourbe('y = x^2'), 'y = x²');
    assert.strictEqual(Rendu.legendeCourbe('f(x) = 2*x^3 - 0.5*x'), 'f(x) = 2x³ - 0,5x');
    assert.strictEqual(Rendu.legendeCourbe('y = 2x + 1'), 'y = 2x + 1');
    assert.strictEqual(Rendu.legendeCourbe('y = sqrt(x)'), 'y = √x');
    assert.strictEqual(Rendu.legendeCourbe('y = sqrt(x + 1)'), 'y = √(x + 1)');
    assert.strictEqual(Rendu.legendeCourbe('y = e^(-x)'), 'y = e⁻ˣ');
    assert.strictEqual(Rendu.legendeCourbe('y = sin(pi*x)'), 'y = sin(πx)');
    assert.strictEqual(Rendu.legendeCourbe('y = -x^2 + 2*3'), 'y = -x² + 2 × 3');
    assert.strictEqual(Rendu.legendeCourbe('y = x^(1/2)'), 'y = x^(1 / 2)');
});

test('svgCourbe : légende en italique pour les lettres, comme une formule', () => {
    const svg = Rendu.svgCourbe('y = x^2\nx = -3 .. 3');
    assert.match(svg, /<tspan font-style="italic">y<\/tspan> = <tspan font-style="italic">x<\/tspan>²/);
    assert.doesNotMatch(svg, /x\^2</);
});

test('svgCourbe : légende échappée, code refusé comme dans la calculatrice', () => {
    assert.match(Rendu.svgCourbe('y = x & 1 > 0 ? 1 : 0\nx = -1 .. 1'), /&amp; 1 &gt; 0/);
    assert.throws(() => Rendu.svgCourbe('y = evaluate("1")\nx = 0 .. 1'));
});

test('graduations : pas rond, une dizaine de valeurs au plus', () => {
    assert.deepStrictEqual(Rendu.graduations(-3, 3), [-3, -2, -1, 0, 1, 2, 3]);
    assert.deepStrictEqual(Rendu.graduations(-0.45, 9.45), [0, 2, 4, 6, 8]);
});
