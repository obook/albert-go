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
