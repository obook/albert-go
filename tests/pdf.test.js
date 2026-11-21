/*
 * pdf.test.js
 * Texte d'un PDF lu sans parcourir un flux par for await : WebKit ne le sait
 * pas, et tous les navigateurs de l'iPad en dépendent.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const PUBLIC = path.join(__dirname, '..', 'public');
const SOURCE = fs.readFileSync(path.join(PUBLIC, 'js', 'piece-jointe.js'), 'utf8');

/* Une page qui écrit "Bonjour", sans table xref : pdf.js la reconstruit. */
const PDF = '%PDF-1.4\n'
    + '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
    + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
    + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n'
    + '4 0 obj<</Length 38>>stream\nBT /F1 12 Tf 20 100 Td (Bonjour) Tj ET\nendstream endobj\n'
    + '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n'
    + 'trailer<</Root 1 0 R>>\n%%EOF';

/* Fonctions de mise en ligne : elles ne lisent que des éléments, pdf.js n'est pas chargé. */
const page = vm.createContext({ $: () => ({ addEventListener() {} }), document: { addEventListener() {} }, URL });
vm.runInContext(SOURCE, page);

/* Élément de getTextContent ; positions relevées dans le programme de cycle 4 (2026). */
function el(str, x, y, largeur, hauteur, eol = false) {
    return { str, transform: [hauteur, 0, 0, hauteur, x, y], width: largeur, height: hauteur, hasEOL: eol };
}

/* Texte d'une page : ses lignes mises bout à bout. */
function texteDePage(elements) {
    return page.lignesDePage(elements).map(l => l.texte).join('\n');
}

test('lignesDePage : fractions sur deux lignes remises en a/b', () => {
    const elements = [
        el('fractions simples comme', 53, 570.8, 242.1, 8.5), el(' ', 295.2, 570.8, 2.7, 0),
        el('1', 297.9, 575.9, 2.8, 6, true), el('2', 297.5, 566.5, 3.6, 6), el(' ', 301.1, 566.5, 2.3, 0),
        el(';', 303.4, 570.8, 2.3, 8.5), el(' ', 305.7, 570.8, 2.6, 0),
        el('100', 373.8, 575.9, 10, 6, true), el('100', 373.8, 566.5, 10, 6), el(' ', 383.7, 566.5, 2.3, 0),
        el(';', 386, 570.8, 2.3, 8.5), el(' ', 388.3, 570.8, 2.3, 0),
        el('7', 390.6, 575.9, 3.6, 6, true), el('1', 390.9, 566.5, 2.8, 6), el(' ', 393.7, 566.5, 2.7, 0),
        el('.', 396.4, 570.8, 2.3, 8.5)
    ];
    assert.strictEqual(texteDePage(elements), 'fractions simples comme 1/2 ; 100/100 ; 7/1 .');
});

test('lignesDePage : une colonne de nombres reste sur deux lignes', () => {
    const elements = [el('A', 20, 100, 5, 8.5), el('12', 60, 100, 10, 8.5, true), el('15', 60, 88.3, 10, 8.5), el('B', 80, 88.3, 5, 8.5)];
    assert.strictEqual(texteDePage(elements), 'A12\n15B');
});

test('lignesDePage : exposants remis en a^n, ² Unicode inchangé', () => {
    const puissances = [
        el('Puissances simples : 2² = 4 ; 2', 53, 58.3, 118.4, 8.5), el('3', 171.5, 61.3, 3, 5), el(' ', 174.5, 61.3, 2.1, 0),
        el('= 8 ; 10', 176.7, 58.3, 30, 8.5), el('3', 206.8, 61.3, 3, 5), el(' ', 209.8, 61.3, 2.3, 0),
        el('= 1 000.', 212.1, 58.3, 31.2, 8.5)
    ];
    assert.strictEqual(texteDePage(puissances), 'Puissances simples : 2² = 4 ; 2^3 = 8 ; 10^3 = 1 000.');
    const identite = [
        el('a', 40.6, 231.5, 4.8, 8.5), el(' ', 45.3, 231.5, 1.1, 0), el('2', 46.4, 234.5, 3, 5), el(' ', 49.5, 234.5, 2.3, 0),
        el('+ 2ab + b', 51.7, 231.5, 38.4, 8.5), el(' ', 90.1, 231.5, 1.1, 0), el('2', 91.2, 234.5, 3, 5), el(' ', 94.2, 234.5, 2.3, 0),
        el('= (a + b)', 96.5, 231.5, 33, 8.5), el(' ', 129.5, 231.5, 1.1, 0), el('2', 130.6, 234.5, 3, 5)
    ];
    assert.strictEqual(texteDePage(identite), 'a^2 + 2ab + b^2 = (a + b)^2');
});

test('lignesDePage : un appel de note après un mot n\'est pas un exposant', () => {
    const elements = [el('le programme', 53, 100, 50, 8.5), el('1', 103, 103, 3, 5), el(' fixe', 106, 100, 20, 8.5)];
    assert.strictEqual(texteDePage(elements), 'le programme1 fixe');
});

test('texteDesLignes : niveaux de titres par rareté, rubriques au niveau le plus profond, pages séparées par \\f', () => {
    /* Comme le programme de cycle 4 : la classe (12) est plus grande que le domaine (11) qui la contient. */
    const corps = 'Texte. '.repeat(20);
    const lignes = [];
    for (const [page, domaine] of [[1, 'Nombres'], [2, 'Espace']]) {
        lignes.push({ texte: domaine, style: '11|f3', page });
        for (const classe of ['Cinquième', 'Quatrième']) {
            lignes.push({ texte: classe, style: '12|f2', page });
            for (const section of ['Opérations', 'Triangles', 'Angles']) {
                lignes.push({ texte: section, style: '10|f3', page }, { texte: 'Automatismes', style: '9|f3', page }, { texte: corps, style: '8.5|f2', page });
            }
        }
    }
    const texte = page.texteDesLignes(lignes);
    assert.ok(texte.startsWith('# Nombres\n## Cinquième\n### Opérations\n#### Automatismes\n' + corps), texte.slice(0, 80));
    assert.ok(texte.includes('\n\f\n# Espace\n## Cinquième\n'));
});

test('texteDesLignes : des lignes courtes dont la phrase continue ne sont pas des titres', () => {
    /* Repères de cycle 4 : colonnes étroites, une police par classe, en alternance. */
    const corps = { texte: 'texte '.repeat(20), style: '10|f6', page: 1 };
    const lignes = [corps, corps, { texte: 'Le travail mené au cycle 3', style: '10|f8', page: 1 }, { texte: 'est poursuivi.', style: '10|f6', page: 1 },
        { texte: 'La notion d\'opposé', style: '10|f8', page: 1 }, { texte: 'est introduite.', style: '10|f6', page: 1 }];
    assert.doesNotMatch(page.texteDesLignes(lignes), /^#/m);
});

test('sansBordsDePage : en-têtes et pieds de page répétés retirés, le reste gardé', () => {
    const contenus = [['Automatismes', 'Les nombres.'], ['Les fractions.', 'Les puissances.'], ['Les triangles.', 'Les angles.'], ['Les solides.', 'Les aires.']];
    const lignes = contenus.flatMap(([a, b], i) => [
        { texte: '© Ministère de l\'Éducation nationale', page: i + 1 },
        { texte: a, page: i + 1 },
        { texte: b, page: i + 1 },
        { texte: 'page ' + (i + 1) + ' sur 4', page: i + 1 }
    ]);
    assert.deepStrictEqual(page.sansBordsDePage(lignes).map(l => l.texte), contenus.flat());
});

test("lirePdf : le texte sort même sans for await sur un flux, comme sur iPad", async () => {
    /* Worker de pdf.js dans le même fil, Node n'a pas de Worker. */
    globalThis.pdfjsWorker = await import(pathToFileURL(path.join(PUBLIC, 'vendor', 'pdfjs', 'pdf.worker.min.mjs')).href);
    const iterateur = Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator);
    delete ReadableStream.prototype[Symbol.asyncIterator];
    try {
        const element = { addEventListener() {} };
        const contexte = vm.createContext({
            $: () => element,
            document: { baseURI: pathToFileURL(PUBLIC + '/').href, addEventListener() {} },
            URL
        });
        vm.runInContext(SOURCE, contexte, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
        const fichier = { arrayBuffer: async () => new TextEncoder().encode(PDF).buffer };
        assert.match(await contexte.lirePdf(fichier), /Bonjour/);
    } finally {
        Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, iterateur);
    }
});
