/*
 * albert/fichiers.test.js
 * Tests de public/js/albert/fichiers.js : son en WAV, transcription par locuteur,
 * formules d'un .odt et d'un .docx.
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
require('../../public/js/i18n.js');
const Albert = require('../../public/js/albert.js');

test('wav : en-tête PCM 16 bits mono et échantillons bornés', () => {
    const wav = new DataView(Albert.wav(new Float32Array([0, 1, -1, 2]), 16000));
    const texte = (debut, n) => String.fromCharCode(...new Uint8Array(wav.buffer, debut, n));
    assert.strictEqual(wav.byteLength, 44 + 4 * 2);
    assert.strictEqual(texte(0, 4) + texte(8, 8) + texte(36, 4), 'RIFFWAVEfmt data');
    assert.strictEqual(wav.getUint32(4, true), 36 + 8);
    assert.strictEqual(wav.getUint16(22, true), 1);
    assert.strictEqual(wav.getUint32(24, true), 16000);
    assert.strictEqual(wav.getUint32(28, true), 32000);
    assert.strictEqual(wav.getUint32(40, true), 8);
    assert.deepStrictEqual([0, 1, 2, 3].map(i => wav.getInt16(44 + i * 2, true)), [0, 32767, -32767, 32767]);
});

test('texteParLocuteur : un tour par ligne, un seul bloc pour une seule voix', () => {
    const segments = [['A', ' Bonjour.'], ['A', 'Ça va ?'], ['B', 'Oui.'], ['A', 'Bien.']].map(([speaker, text]) => ({ speaker, text }));
    assert.strictEqual(Albert.texteParLocuteur(segments), 'Locuteur 1 : Bonjour. Ça va ?\nLocuteur 2 : Oui.\nLocuteur 1 : Bien.');
    assert.strictEqual(Albert.texteParLocuteur(segments.slice(0, 2)), 'Bonjour. Ça va ?');
    assert.strictEqual(Albert.texteParLocuteur([...segments, { speaker: null, text: 'x' }]), 'Bonjour. Ça va ? Oui. Bien. x');
    assert.strictEqual(Albert.texteParLocuteur(undefined), '');
});

test('formuleOdt : la source LaTeX d\'un objet formule, sinon son écriture LibreOffice', () => {
    const objet = (annotations) => '<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mn>1</mn></mrow>' + annotations + '</semantics></math>';
    const frac = String.fromCharCode(92) + 'frac{a}{b}';
    /* Fichier exporté par Albert Go : la source LaTeX y est gardée. */
    assert.strictEqual(Albert.formuleOdt(objet('<annotation encoding="application/x-tex">' + frac + ' &lt; 1</annotation>'
        + '<annotation encoding="StarMath 5.0">{a} over {b} &lt; 1</annotation>')), '$' + frac + ' < 1$');
    /* Fichier écrit dans LibreOffice : seule son écriture StarMath existe. */
    assert.strictEqual(Albert.formuleOdt(objet('<annotation encoding="StarMath 5.0">{a} over {b} &amp; c</annotation>')), '[formule : {a} over {b} & c]');
    assert.strictEqual(Albert.formuleOdt(objet('')), '');
    assert.strictEqual(Albert.formuleOdt(''), '');
});

test('texteOmml : une équation Word reste lisible en texte', () => {
    /* Faux nœuds : la lecture ne regarde que nodeType, localName, childNodes et textContent. */
    const e = (localName, ...enfants) => {
        const childNodes = enfants.map((x) => (typeof x === 'string' ? { nodeType: 3, textContent: x, childNodes: [] } : x));
        return { nodeType: 1, localName, childNodes, get textContent() { return childNodes.map((c) => c.textContent).join(''); } };
    };
    const r = (texte) => e('r', e('rPr', e('nor')), e('t', texte));
    const equation = e('oMath',
        e('f', e('fPr'), e('num', r('48')), e('den', r('60'))), r('='),
        e('sSup', e('e', r('x')), e('sup', r('2'))), r('+'),
        e('sSub', e('e', r('u')), e('sub', r('n'))), r('+'),
        e('rad', e('radPr', e('degHide')), e('deg'), e('e', r('2'))));
    /* Sans cela, 48/60 sortait "4860". */
    assert.strictEqual(Albert.texteOmml(equation), '(48)/(60)=x^(2)+u_(n)+racine(2)');
});
