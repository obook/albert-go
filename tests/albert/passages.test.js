/*
 * albert/passages.test.js
 * Tests de public/js/albert/passages.js : sources en passages numérotés, mots rares,
 * choix des passages, vecteurs et citations.
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
require('../../public/js/socle/i18n.js');
const Albert = require('../../public/js/albert.js');

test('decouper : un passage par titre, chemin de titres, page comptée aux \\f', () => {
    const texte = '# Espace\n## Quatrième\n#### Triangles\nConnaitre le théorème de Pythagore, sa réciproque, sa contraposée.\n'
        + '\f\n## Troisième\n#### Triangles\nÉcrire l\'égalité de Pythagore dans un triangle rectangle.';
    assert.deepStrictEqual(Albert.decouper(texte), [
        { page: 1, chemin: 'Espace > Quatrième > Triangles', texte: 'Connaitre le théorème de Pythagore, sa réciproque, sa contraposée.' },
        { page: 2, chemin: 'Espace > Troisième > Triangles', texte: 'Écrire l\'égalité de Pythagore dans un triangle rectangle.' }
    ]);
});

test('decouper : une table des matières, avec ou sans pages, ne fait pas de passage', () => {
    const texte = '# Sommaire\nNombres\nEspace ........ 12\n# Nombres\nLes nombres relatifs.\n# Espace\nLes triangles.';
    assert.deepStrictEqual(Albert.decouper(texte).map(p => p.texte), ['Les nombres relatifs.', 'Les triangles.']);
});

test('decouper : sans titre, coupe aux lignes vides ; un fragment court rejoint le précédent', () => {
    const long = 'Une phrase assez longue pour faire un passage à elle seule, sans aucun doute possible.';
    assert.deepStrictEqual(Albert.decouper(long + '\n\n2\n\n' + long).map(p => p.texte), [long + '\n2', long]);
    const ligne = 'x'.repeat(600);
    assert.strictEqual(Albert.decouper(ligne + '\n' + ligne).length, 2);
    /* Des lignes courtes se regroupent, mais jamais au-delà de PASSAGE_MAX. */
    assert.ok(Albert.decouper('court\n\n'.repeat(400)).every(p => p.texte.length <= Albert.PASSAGE_MAX));
});

test('joindrePassages : consigne de citation, passages numérotés à la suite d\'une source à l\'autre', () => {
    const passages = Albert.passagesSources([{ nom: 'a.pdf', texte: '# Titre\nPremier.\n\f\nSecond.' }, { nom: 'b.txt', texte: 'Troisième.' }]);
    assert.deepStrictEqual(passages.map(p => [p.n, p.nom, p.page, p.pages]), [[1, 'a.pdf', 1, true], [2, 'b.txt', 1, false]]);
    assert.strictEqual(Albert.joindrePassages(passages), t('demande.citer')
        + '\n\nContenu du fichier "a.pdf" :\n\n[P1, p. 1] Titre\nPremier.\nSecond.'
        + '\n\nContenu du fichier "b.txt" :\n\n[P2]\nTroisième.');
});

test('motsRares : passages qui contiennent un mot rare de la question, accents ignorés', () => {
    /* Un titre par passage : sans lui, des paragraphes courts se regrouperaient. */
    const paragraphes = ['Théorème de Pythagore.', 'Égalité de pythagore.', ...Array(6).fill('Le triangle.')];
    const passages = Albert.passagesSources([{ nom: 's', texte: paragraphes.map((p, i) => '# ' + i + '\n' + p).join('\n') }]);
    assert.strictEqual(Albert.motsRares('Où est Pythagore dans le triangle ?', passages), 'Passages contenant "Pythagore" : P1 (0), P2 (1).');
    assert.strictEqual(Albert.motsRares('Thales ?', passages), '');
});

test('choisirPassages : mots rares d\'abord, puis les plus proches, sous le plafond, dans l\'ordre des numéros', () => {
    const passages = [1, 2, 3, 4].map(n => ({ n, chemin: '', texte: 'x'.repeat(10) }));
    assert.deepStrictEqual(Albert.choisirPassages(passages, [0.9, 0.1, 0.8, 0.5], new Set([2]), 30).map(p => p.n), [1, 2, 3]);
    assert.deepStrictEqual(Albert.choisirPassages(passages, [0.9, 0.1, 0.8, 0.5], new Set(), 20).map(p => p.n), [1, 3]);
});

test('cosinus et empreinte', () => {
    assert.strictEqual(Albert.cosinus(Float32Array.of(1, 0), Float32Array.of(2, 0)), 1);
    assert.strictEqual(Albert.cosinus(Float32Array.of(1, 0), Float32Array.of(0, 3)), 0);
    assert.strictEqual(Albert.empreinteTexte('abc'), Albert.empreinteTexte('abc'));
    assert.notStrictEqual(Albert.empreinteTexte('abc'), Albert.empreinteTexte('abd'));
    /* Le cumul énergie et carbone garde son nom : la boîte Empreinte le lit (menu.js). */
    assert.strictEqual(typeof Albert.empreinte, 'object');
});

test('CITATION : numéros cités, avec ou sans page, crochets pleine chasse et espaces invisibles', () => {
    const cites = (texte) => [...texte.matchAll(Albert.CITATION)].flatMap(m => Albert.numerosCites(m[1]));
    const invisible = String.fromCharCode(0x200B);
    assert.deepStrictEqual(cites('Vrai [P107]. Aussi [P39, P40] et 【P38】, [' + invisible + 'P113' + invisible + '], [P12, p. 4].'), [[107], [39], [40], [38], [113], [12]]);
    assert.deepStrictEqual(cites('Note [1] et [Pythagore].'), []);
});

test('CITATION : plages au tiret, au tiret long et avec "à"', () => {
    const cites = (texte) => [...texte.matchAll(Albert.CITATION)].flatMap(m => Albert.numerosCites(m[1]));
    assert.deepStrictEqual(cites('[P34-P37]'), [[34, 35, 36, 37]]);
    const [moyen, long] = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];
    assert.deepStrictEqual(cites('[P34 ' + moyen + ' P36] [P5' + long + 'P6] [P8 à P9]'), [[34, 35, 36], [5, 6], [8, 9]]);
    assert.deepStrictEqual(cites('[P12, P20-22]'), [[12], [20, 21, 22]]);
    assert.deepStrictEqual(cites('[P9-P7]'), [[7, 8, 9]]);
    assert.strictEqual(cites('[P1-P99999999]')[0].length, 1000);
});

test('morceauxCitations : crochets, parenthèses et numéros seuls ; PDF ou P2x ne comptent pas', () => {
    assert.deepStrictEqual(Albert.morceauxCitations('Vrai [P1], (P2), voir P3. Un PDF, P4a et le point P.'), [
        'Vrai ', { plages: [[1]], crochets: true }, ', ', { plages: [[2]], crochets: true }, ', voir ',
        { plages: [[3]], crochets: false }, '. Un PDF, P4a et le point P.'
    ]);
    assert.deepStrictEqual(Albert.morceauxCitations('(voir P2)'), ['(voir ', { plages: [[2]], crochets: false }, ')']);
    assert.deepStrictEqual(Albert.morceauxCitations('P5'), [{ plages: [[5]], crochets: false }]);
});

test('morceauxCitations : crochets collés en une citation, plage entière', () => {
    assert.deepStrictEqual(Albert.morceauxCitations('Vu [P13][P28] et [P2] [P3], puis [P4], [P5].'), [
        'Vu ', { plages: [[13], [28]], crochets: true }, ' et ', { plages: [[2], [3]], crochets: true }, ', puis ',
        { plages: [[4]], crochets: true }, ', ', { plages: [[5]], crochets: true }, '.'
    ]);
    assert.deepStrictEqual(Albert.morceauxCitations('Fin [P34 à P36].'), ['Fin ', { plages: [[34, 35, 36]], crochets: true }, '.']);
});
