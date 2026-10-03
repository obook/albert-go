/*
 * docx.test.js
 * Tests de public/js/rendu/docx.js : archive zip, XML Word, assemblage du .docx.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
globalThis.math = require('../public/vendor/mathjs/math.js');
require('../public/js/i18n.js');
globalThis.Calcul = require('../public/js/tools/calcul.js').Calcul;
global.marked = require('../public/vendor/marked/marked.umd.js');
const Rendu = require('../public/js/rendu.js');

/* Fichier d'une archive, lu comme le fait lireDansZip de piece-jointe.js. */
const dansZip = (archive, nom) => {
    const vue = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const fin = archive.length - 22;
    let entree = vue.getUint32(fin + 16, true);
    for (let i = vue.getUint16(fin + 10, true); i > 0; i--) {
        const longueurNom = vue.getUint16(entree + 28, true);
        if (new TextDecoder().decode(archive.subarray(entree + 46, entree + 46 + longueurNom)) === nom) {
            const local = vue.getUint32(entree + 42, true);
            const debut = local + 30 + vue.getUint16(local + 26, true) + vue.getUint16(local + 28, true);
            return archive.subarray(debut, debut + vue.getUint32(entree + 20, true));
        }
        entree += 46 + longueurNom + vue.getUint16(entree + 30, true) + vue.getUint16(entree + 32, true);
    }
    return null;
};

test('crc32 : vecteur de référence', () => {
    assert.strictEqual(Rendu.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('zip : chaque fichier se retrouve à son adresse, avec sa somme de contrôle', () => {
    const octets = (texte) => new TextEncoder().encode(texte);
    const archive = Rendu.zip([{ nom: 'a.txt', octets: octets('bonjour') }, { nom: 'dossier/b.xml', octets: octets('<é/>') }]);
    const vue = new DataView(archive.buffer);
    const fin = archive.length - 22;
    assert.strictEqual(vue.getUint32(0, true), 0x04034b50);
    assert.strictEqual(vue.getUint32(fin, true), 0x06054b50);
    assert.strictEqual(vue.getUint16(fin + 10, true), 2);
    assert.strictEqual(new TextDecoder().decode(dansZip(archive, 'a.txt')), 'bonjour');
    assert.strictEqual(new TextDecoder().decode(dansZip(archive, 'dossier/b.xml')), '<é/>');
    assert.strictEqual(dansZip(archive, 'absent.txt'), null);
    /* Somme de contrôle de la première entrée du répertoire. */
    assert.strictEqual(vue.getUint32(vue.getUint32(fin + 16, true) + 16, true), Rendu.crc32(octets('bonjour')));
});
