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

test('docx.js : aucun caractère invisible dans le source', () => {
    /* Une regex écrite avec des caractères spéciaux tels quels se "répare" au premier éditeur venu. */
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/rendu/docx.js'), 'utf8');
    const suspects = [...new Set(source)].filter((c) => {
        const code = c.codePointAt(0);
        return !(code === 10 || (code >= 32 && code <= 126) || (code >= 0xC0 && code <= 0x17F));
    }).map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase());
    assert.deepStrictEqual(suspects, []);
});

test('corpsDocx : espaces insécables gardées, seuls les blancs de HTML sont repliés', () => {
    const insecable = String.fromCharCode(0xA0);
    const fine = String.fromCharCode(0x202F);
    const xml = Rendu.corpsDocx(n('DIV', {}, n('P', {}, 'Durée' + insecable + ': 30' + fine + 'min,\n  10' + insecable + '000')), etatVide());
    assert.ok(xml.includes('Durée' + insecable + ': 30' + fine + 'min, 10' + insecable + '000</w:t>'));
});

test('corpsDocx : exposant et indice gardés', () => {
    const xml = Rendu.corpsDocx(n('DIV', {}, n('P', {}, '10', n('SUP', {}, '3'), ' H', n('SUB', {}, '2'), 'O')), etatVide());
    assert.ok(xml.includes('<w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">3</w:t>'));
    assert.ok(xml.includes('<w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t xml:space="preserve">2</w:t>'));
});

test('listeDocx : début de liste douteux ramené à un entier que Word accepte', () => {
    const debut = (start) => {
        const etat = etatVide();
        Rendu.listeDocx(n('OL', { start }, n('LI', {}, 'a')), etat, { niveau: 0, numId: 0 });
        return etat.listes[0].debut;
    };
    assert.strictEqual(debut('0'), 0);
    assert.strictEqual(debut('2.5'), 2);
    assert.strictEqual(debut('1e999'), 1);
    assert.strictEqual(debut('-3'), 1);
    assert.strictEqual(debut('99999999999999999999'), 1);
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

test('imageDocx : image en hauteur ramenée à 12 cm, la légende reste sur la page', () => {
    const photo = n('IMG', { alt: 'Tour Eiffel' });
    const etat = etatVide();
    etat.images.set(photo, { octets: new Uint8Array([1]), extension: 'jpg', largeur: 500, hauteur: 925 });
    assert.ok(Rendu.imageDocx(photo, etat)[0].includes('<wp:extent cx="2335135" cy="4320000"/>'));
});

test('imagesDocx : miniature de thumb.wikimedia.org demandée à upload.wikimedia.org', async (t) => {
    /* La CSP n'ouvre fetch que vers upload.wikimedia.org. */
    const demandees = [];
    t.mock.method(globalThis, 'fetch', async (adresse) => {
        demandees.push(adresse);
        return { ok: true, blob: async () => new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }) };
    });
    const img = {
        tagName: 'IMG', src: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a8/T.jpg/500px-T.jpg',
        naturalWidth: 500, naturalHeight: 925, getBoundingClientRect: () => ({})
    };
    const images = await Rendu.imagesDocx({ querySelectorAll: () => [img] });
    assert.deepStrictEqual(demandees, ['https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/T.jpg/500px-T.jpg']);
    assert.deepStrictEqual({ ...images.get(img), octets: null }, { octets: null, extension: 'jpg', largeur: 500, hauteur: 925 });
});

test('numerotationDocx : une numérotation par liste, avec son début', () => {
    const xml = Rendu.numerotationDocx({ listes: [{ debut: 1, niveau: 0 }, { debut: 3, niveau: 1 }] });
    /* Word exige tous les abstractNum avant le premier num. */
    assert.ok(xml.indexOf('<w:num ') > xml.lastIndexOf('</w:abstractNum>'));
    assert.ok(xml.includes('<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'));
    assert.ok(xml.includes('<w:num w:numId="3"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="1"><w:startOverride w:val="3"/></w:lvlOverride></w:num>'));
});

test('relsDocx : adresse échappée, lien marqué externe', () => {
    const TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    const xml = Rendu.relsDocx({ rels: [{ type: 'image', cible: 'media/image1.png' }, { type: 'hyperlink', cible: 'https://exemple.fr/?a=1&b=2' }] });
    assert.ok(xml.includes('<Relationship Id="rId3" Type="' + TYPE + 'image" Target="media/image1.png"/>'));
    assert.ok(xml.includes('<Relationship Id="rId4" Type="' + TYPE + 'hyperlink" Target="https://exemple.fr/?a=1&amp;b=2" TargetMode="External"/>'));
});

test('docx : archive complète, texte et image à leur place', async (t) => {
    const figure = n('svg', {});
    const reponse = n('DIV', {},
        n('H1', {}, 'Évaluation'),
        n('P', {}, 'Durée : ', n('STRONG', {}, '30 minutes'), '. Formule : ', katex('a^2 + b^2 = c^2')),
        n('OL', {}, n('LI', {}, 'Énoncer le théorème.'), n('LI', {}, 'Calculer ', n('CODE', {}, 'BC'), '.', n('UL', {}, n('LI', {}, 'poser le calcul')))),
        n('TABLE', {}, n('TR', {}, n('TH', {}, 'Question'), n('TH', {}, 'Points')), n('TR', {}, n('TD', {}, '1'), n('TD', {}, '4'))),
        n('DIV', { class: 'diagramme' }, figure),
        n('P', {}, n('A', { href: 'https://fr.wikipedia.org/wiki/Pythagore' }, 'Source')));
    /* PNG d'un pixel : préparer une vraie figure demande un navigateur. */
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
    t.mock.method(Rendu, 'imagesDocx', async () => new Map([[figure, { octets: png, extension: 'png', largeur: 800, hauteur: 400 }]]));
    const fichier = await Rendu.docx(reponse);
    assert.strictEqual(fichier.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const archive = new Uint8Array(await fichier.arrayBuffer());
    const lire = (nom) => new TextDecoder().decode(dansZip(archive, nom));
    /* [Content_Types].xml en premier : Word le cherche là. */
    assert.strictEqual(new TextDecoder().decode(archive.subarray(30, 49)), '[Content_Types].xml');
    assert.ok(lire('word/document.xml').startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'));
    assert.ok(lire('word/document.xml').includes('<w:t xml:space="preserve">Évaluation</w:t>'));
    assert.ok(lire('word/document.xml').endsWith('</w:sectPr></w:body></w:document>'));
    assert.ok(lire('word/_rels/document.xml.rels').includes('Target="media/image1.png"'));
    assert.ok(lire('word/numbering.xml').includes('<w:num w:numId="2">'));
    assert.ok(lire('word/styles.xml').includes('w:styleId="Heading3"'));
    assert.ok(lire('_rels/.rels').includes('Target="word/document.xml"'));
    assert.deepStrictEqual(dansZip(archive, 'word/media/image1.png'), png);
    /* DOCX_SORTIE=chemin : garde le fichier, pour l'ouvrir dans LibreOffice. */
    if (process.env.DOCX_SORTIE) {
        require('node:fs').writeFileSync(process.env.DOCX_SORTIE, archive);
    }
});
