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

/* Faux nœuds : le parcours ne lit que nodeType, tagName, childNodes, data, textContent et getAttribute. */
const n = (balise, attributs = {}, ...enfants) => {
    const childNodes = enfants.map((e) => (typeof e === 'string' ? { nodeType: 3, data: e, textContent: e, childNodes: [] } : e));
    return {
        nodeType: 1,
        tagName: balise,
        childNodes,
        getAttribute: (nom) => (nom in attributs ? attributs[nom] : null),
        get textContent() {
            return childNodes.map((c) => c.textContent).join('');
        }
    };
};
const etatVide = () => ({ images: new Map(), medias: [], rels: [], listes: [] });
/* Formule telle que KaTeX la laisse : la source LaTeX est dans <annotation>. */
const katex = (tex) => n('SPAN', { class: 'katex' },
    n('SPAN', { class: 'katex-mathml' }, n('math', {}, n('annotation', { encoding: 'application/x-tex' }, tex))),
    n('SPAN', { class: 'katex-html' }, 'rendu'));

test('echapperXml : caractères réservés échappés, caractères interdits retirés', () => {
    assert.strictEqual(Rendu.echapperXml('a < b & "c" > d'), 'a &lt; b &amp; &quot;c&quot; &gt; d');
    /* Contrôle U+0001 et demi-paire isolée retirés ; tabulation, accent et emoji gardés. */
    assert.strictEqual(Rendu.echapperXml('a\u0001b\uD83Dc\té\u{1F600}'), 'abc\té\u{1F600}');
});

test('corpsDocx : titres, gras, italique, blancs entre blocs ignorés', () => {
    const xml = Rendu.corpsDocx(n('DIV', {},
        n('H1', {}, 'Titre'), '\n',
        n('H4', {}, 'Petit titre'), '\n',
        n('P', {}, 'Du ', n('STRONG', {}, 'gras'), ' et de l\'', n('EM', {}, 'italique'), '.'), '\n',
        n('HR', {})), etatVide());
    assert.strictEqual((xml.match(/<w:p>/g) || []).length, 3);
    assert.ok(xml.includes('<w:pStyle w:val="Heading1"/>'));
    assert.ok(xml.includes('<w:pStyle w:val="Heading3"/>'));
    assert.ok(xml.includes('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">gras</w:t></w:r>'));
    assert.ok(xml.includes('<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">italique</w:t></w:r>'));
});

test('corpsDocx : réponse vide, le corps garde un paragraphe', () => {
    assert.strictEqual(Rendu.corpsDocx(n('DIV', {}, '\n'), etatVide()), '<w:p/>');
});

test('corpsDocx : listes imbriquées, chaque liste numérotée a sa numérotation', () => {
    const etat = etatVide();
    const xml = Rendu.corpsDocx(n('DIV', {},
        n('OL', {}, n('LI', {}, 'un', n('UL', {}, n('LI', {}, 'puce'))), n('LI', {}, n('P', {}, 'deux'), n('P', {}, 'suite'))),
        n('OL', { start: '3' }, n('LI', {}, 'trois'))), etat);
    assert.ok(xml.includes('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">un</w:t>'));
    assert.ok(xml.includes('<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">puce</w:t>'));
    /* Deuxième paragraphe d'un élément : en retrait, sans numéro. */
    assert.ok(xml.includes('<w:p><w:pPr><w:ind w:left="720"/></w:pPr><w:r><w:t xml:space="preserve">suite</w:t>'));
    assert.ok(xml.includes('<w:numId w:val="3"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">trois</w:t>'));
    assert.deepStrictEqual(etat.listes, [{ debut: 1, niveau: 0 }, { debut: 3, niveau: 0 }]);
});

test('listeDocx : au-delà de neuf niveaux, le niveau reste à 8', () => {
    const xml = Rendu.listeDocx(n('UL', {}, n('LI', {}, 'fond')), etatVide(), { niveau: 12, numId: 1 });
    assert.ok(xml.includes('<w:ilvl w:val="8"/>'));
});

test('corpsDocx : tableau, en-tête en gras, ligne incomplète complétée', () => {
    const xml = Rendu.corpsDocx(n('DIV', {}, n('TABLE', {},
        n('THEAD', {}, n('TR', {}, n('TH', {}, 'Question'), n('TH', {}, 'Points'))),
        n('TBODY', {}, n('TR', {}, n('TD', {}, '1'))))), etatVide());
    assert.strictEqual((xml.match(/<w:gridCol /g) || []).length, 2);
    assert.strictEqual((xml.match(/<w:tc>/g) || []).length, 4);
    assert.ok(xml.includes('<w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Question</w:t>'));
    /* Case absente : paragraphe vide, Word refuse une case sans paragraphe. */
    assert.ok(xml.includes('</w:tcPr><w:p/></w:tc></w:tr>'));
});

test('corpsDocx : lien cliquable, adresse douteuse laissée en texte', () => {
    const etat = etatVide();
    const xml = Rendu.corpsDocx(n('DIV', {}, n('P', {},
        n('A', { href: 'https://exemple.fr/?a=1&b="2"' }, 'bon'),
        n('A', { href: 'javascript:alert(1)' }, 'douteux'))), etat);
    assert.ok(xml.includes('<w:hyperlink r:id="rId3"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">bon</w:t></w:r></w:hyperlink>'));
    assert.ok(xml.includes('<w:r><w:t xml:space="preserve">douteux</w:t></w:r>'));
    assert.deepStrictEqual(etat.rels, [{ type: 'hyperlink', cible: 'https://exemple.fr/?a=1&b=%222%22' }]);
});

test('corpsDocx : formule en LaTeX brut, formule centrée sur sa ligne', () => {
    const xml = Rendu.corpsDocx(n('DIV', {},
        n('P', {}, 'Aire : ', katex('\\pi r^2'), n('SPAN', { class: 'katex-display' }, katex('a^2 + b^2')), 'fin')), etatVide());
    assert.ok(xml.includes('<w:t xml:space="preserve">\\pi r^2</w:t>'));
    assert.ok(xml.includes('<w:r><w:br/></w:r><w:r><w:t xml:space="preserve">a^2 + b^2</w:t></w:r><w:r><w:br/></w:r>'));
    assert.ok(!xml.includes('rendu'));
    /* Seule dans son paragraphe : pas de ligne vide autour. */
    const seule = Rendu.corpsDocx(n('DIV', {}, n('P', {}, n('SPAN', { class: 'katex-display' }, katex('x')))), etatVide());
    assert.ok(!seule.includes('<w:br/>'));
});

test('corpsDocx : bloc de code, un paragraphe par ligne, bouton ignoré', () => {
    const xml = Rendu.corpsDocx(n('DIV', {}, n('DIV', { class: 'bloc-code' },
        n('PRE', {}, n('CODE', {}, 'a = 1\n  b = 2\n')), n('BUTTON', {}, 'Copier'))), etatVide());
    assert.strictEqual((xml.match(/<w:p>/g) || []).length, 2);
    assert.ok(xml.includes('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/></w:rPr><w:t xml:space="preserve">  b = 2</w:t>'));
    assert.ok(!xml.includes('Copier'));
});

test('corpsDocx : citation en retrait', () => {
    const xml = Rendu.corpsDocx(n('DIV', {}, n('BLOCKQUOTE', {}, n('P', {}, 'cité'))), etatVide());
    assert.ok(xml.includes('<w:p><w:pPr><w:ind w:left="720"/></w:pPr><w:r><w:t xml:space="preserve">cité</w:t>'));
});

test('corpsDocx : figure insérée et ramenée à 16 cm, image non préparée omise', () => {
    const figure = n('svg', {});
    const perdue = n('IMG', { alt: 'Tour Eiffel' });
    const etat = etatVide();
    etat.images.set(figure, { octets: new Uint8Array([1]), extension: 'png', largeur: 800, hauteur: 400 });
    const xml = Rendu.corpsDocx(n('DIV', {},
        n('DIV', { class: 'diagramme' }, n('DIV', { class: 'boutons-figure' }, n('BUTTON', {}, n('svg', {}))), figure),
        n('FIGURE', { class: 'image-commons' }, n('DIV', { class: 'cadre-image' }, perdue),
            n('FIGCAPTION', {}, n('Q', {}, n('I', {}, 'La tour')),
                n('A', { href: 'https://commons.wikimedia.org/wiki/File:T.jpg' }, 'Auteur, CC BY-SA 4.0')))), etat);
    assert.strictEqual((xml.match(/<w:drawing>/g) || []).length, 1);
    assert.ok(xml.includes('<wp:extent cx="5760000" cy="2880000"/>'));
    assert.ok(xml.includes('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>'));
    assert.ok(xml.includes('<a:blip r:embed="rId3"/>'));
    assert.deepStrictEqual(etat.rels[0], { type: 'image', cible: 'media/image1.png' });
    assert.strictEqual(etat.medias.length, 1);
    /* Légende gardée même sans image. */
    assert.ok(xml.includes('La tour'));
    assert.ok(xml.includes('Auteur, CC BY-SA 4.0'));
});
