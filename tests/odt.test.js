/*
 * odt.test.js
 * Tests de public/js/rendu/odt.js : texte, blocs, formules et archive d'un .odt.
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
const etatVide = () => Rendu.etatOdt(new Map());
/* Formule avec le MathML que KaTeX produit, à côté de la source LaTeX. */
const mathml = (tex, ...contenu) => n('SPAN', { class: 'katex' },
    n('SPAN', { class: 'katex-mathml' }, n('math', {}, n('semantics', {}, n('mrow', {}, ...contenu), n('annotation', { encoding: 'application/x-tex' }, tex)))),
    n('SPAN', { class: 'katex-html' }, 'rendu'));
const nombre = (x) => n('mn', {}, x);
/* Argument d'un élément MathML : toujours dans une rangée, pour garder le nombre d'enfants. */
const rang = (x) => '<mrow>' + x + '</mrow>';

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

test('odt.js : aucun caractère invisible dans le source', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/rendu/odt.js'), 'utf8');
    const suspects = [...new Set(source)].filter((c) => {
        const code = c.codePointAt(0);
        return !(code === 10 || (code >= 32 && code <= 126) || (code >= 0xC0 && code <= 0x17F));
    }).map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase());
    assert.deepStrictEqual(suspects, []);
});

test('texteOdt : texte échappé, espaces répétées et tabulations gardées', () => {
    assert.strictEqual(Rendu.texteOdt('a < b & c'), 'a &lt; b &amp; c');
    /* ODF replie les espaces répétées et ignore celle de tête : elles sont écrites. */
    assert.strictEqual(Rendu.texteOdt('a  b'), 'a <text:s text:c="1"/>b');
    assert.strictEqual(Rendu.texteOdt('  b = 2'), '<text:s/><text:s text:c="1"/>b = 2');
    assert.strictEqual(Rendu.texteOdt('a' + String.fromCharCode(9) + 'b'), 'a<text:tab/>b');
});

test('corpsOdt : titres, gras, italique, blancs entre blocs ignorés', () => {
    const etat = etatVide();
    const xml = Rendu.corpsOdt(n('DIV', {},
        n('H1', {}, 'Titre'), ' ',
        n('H4', {}, 'Petit titre'), ' ',
        n('P', {}, 'Du ', n('STRONG', {}, 'gras'), ' et de l\'', n('EM', {}, 'italique'), '.'), ' ',
        n('HR', {})), etat);
    assert.ok(xml.includes('<text:h text:style-name="Heading_20_1" text:outline-level="1">Titre</text:h>'));
    assert.ok(xml.includes('<text:h text:style-name="Heading_20_3" text:outline-level="3">Petit titre</text:h>'));
    assert.ok(xml.includes('<text:p>Du <text:span text:style-name="Tg">gras</text:span>'));
    assert.ok(xml.includes('<text:span text:style-name="Ti">italique</text:span>.</text:p>'));
    assert.strictEqual((xml.match(/<text:(p|h)[ >]/g) || []).length, 3);
    assert.deepStrictEqual([...etat.styles].sort(), ['g', 'i']);
});

test('corpsOdt : réponse vide, le corps garde un paragraphe', () => {
    assert.strictEqual(Rendu.corpsOdt(n('DIV', {}, ' '), etatVide()), '<text:p/>');
});

test('corpsOdt : listes imbriquées, début d\'une liste numérotée gardé', () => {
    const xml = Rendu.corpsOdt(n('DIV', {},
        n('OL', {}, n('LI', {}, 'un', n('UL', {}, n('LI', {}, 'puce'))), n('LI', {}, n('P', {}, 'deux'), n('P', {}, 'suite'))),
        n('OL', { start: '3' }, n('LI', {}, 'trois'))), etatVide());
    assert.ok(xml.includes('<text:list text:style-name="Numeros"><text:list-item><text:p>un</text:p>'
        + '<text:list text:style-name="Puces"><text:list-item><text:p>puce</text:p></text:list-item></text:list></text:list-item>'
        + '<text:list-item><text:p>deux</text:p><text:p>suite</text:p></text:list-item></text:list>'));
    assert.ok(xml.includes('<text:list text:style-name="Numeros"><text:list-item text:start-value="3"><text:p>trois</text:p>'));
});

test('corpsOdt : tableau, en-tête en gras, ligne incomplète complétée', () => {
    const xml = Rendu.corpsOdt(n('DIV', {}, n('TABLE', {},
        n('THEAD', {}, n('TR', {}, n('TH', {}, 'Question'), n('TH', {}, 'Points'))),
        n('TBODY', {}, n('TR', {}, n('TD', {}, '1'))))), etatVide());
    assert.ok(xml.includes('<table:table table:name="Tableau1" table:style-name="Tableau"><table:table-column table:number-columns-repeated="2"/>'));
    assert.strictEqual((xml.match(/<table:table-cell /g) || []).length, 4);
    assert.ok(xml.includes('<text:p><text:span text:style-name="Tg">Question</text:span></text:p>'));
    assert.ok(xml.includes('office:value-type="string"><text:p/></table:table-cell></table:table-row>'));
});

test('corpsOdt : lien cliquable, adresse douteuse laissée en texte', () => {
    const xml = Rendu.corpsOdt(n('DIV', {}, n('P', {},
        n('A', { href: 'https://exemple.fr/?a=1&b="2"' }, 'bon'),
        n('A', { href: 'javascript:alert(1)' }, 'douteux'))), etatVide());
    assert.ok(xml.includes('<text:a xlink:type="simple" xlink:href="https://exemple.fr/?a=1&amp;b=%222%22">bon</text:a>douteux'));
});

test('corpsOdt : bloc de code en chasse fixe, espaces de tête gardées, citation en retrait', () => {
    const xml = Rendu.corpsOdt(n('DIV', {},
        n('DIV', { class: 'bloc-code' }, n('PRE', {}, n('CODE', {}, 'a = 1' + String.fromCharCode(10) + '  b = 2' + String.fromCharCode(10))), n('BUTTON', {}, 'Copier')),
        n('BLOCKQUOTE', {}, n('P', {}, 'cité'))), etatVide());
    assert.ok(xml.includes('<text:p text:style-name="Code">a = 1</text:p><text:p text:style-name="Code"><text:s/><text:s text:c="1"/>b = 2</text:p>'));
    assert.ok(!xml.includes('Copier'));
    assert.ok(xml.includes('<text:p text:style-name="Citation">cité</text:p>'));
});

test('mathmlOdt : MathML repris, arguments rangés, source LaTeX ignorée', () => {
    assert.strictEqual(Rendu.mathmlOdt(n('mfrac', {}, nombre('48'), nombre('60'))),
        '<mfrac>' + rang('<mn>48</mn>') + rang('<mn>60</mn>') + '</mfrac>');
    assert.strictEqual(Rendu.mathmlOdt(n('semantics', {}, n('mrow', {}, n('msup', {}, n('mi', {}, 'x'), nombre('2'))), n('annotation', {}, 'source'))),
        '<mrow><msup>' + rang('<mi>x</mi>') + rang('<mn>2</mn>') + '</msup></mrow>');
    assert.strictEqual(Rendu.mathmlOdt(n('msqrt', {}, nombre('2'))), '<msqrt><mn>2</mn></msqrt>');
});

test('mathmlOdt : ce que LibreOffice lit mal est réécrit', () => {
    /* "lim" en opérateur : LibreOffice n'en garde que la première lettre. */
    assert.strictEqual(Rendu.mathmlOdt(n('mo', {}, 'lim')), '<mtext>lim</mtext>');
    assert.strictEqual(Rendu.mathmlOdt(n('mi', {}, 'sin')), '<mtext>sin</mtext>');
    /* Chimie (mhchem) : l'indice sans base s'accroche à la lettre qui le précède. */
    const lettre = (x) => n('mi', { mathvariant: 'normal' }, x);
    const fantome = () => n('mrow', {}, n('mpadded', {}, n('mphantom', {}, n('mi', {}, 'X'))));
    assert.strictEqual(Rendu.mathmlOdt(n('mrow', {}, lettre('H'), n('msub', {}, fantome(), nombre('2')), lettre('O'))),
        '<mrow><msub>' + rang('<mtext>H</mtext>') + rang('<mn>2</mn>') + '</msub><mtext>O</mtext></mrow>');
    /* Flèche de réaction : rien au-dessus. */
    const fleche = String.fromCharCode(0x2192);
    assert.strictEqual(Rendu.mathmlOdt(n('mover', {}, n('mo', {}, fleche), n('mpadded', {}, n('mspace', {})))), '<mo>' + fleche + '</mo>');
    /* Ensemble des réels : la lettre ajourée. */
    assert.strictEqual(Rendu.mathmlOdt(n('mi', { mathvariant: 'double-struck' }, 'R')), '<mi mathvariant="normal">' + String.fromCharCode(0x211D) + '</mi>');
    /* Parenthèses extensibles de KaTeX. */
    const clos = (signe) => n('mo', { fence: 'true' }, signe);
    assert.strictEqual(Rendu.mathmlOdt(n('mrow', {}, clos('('), nombre('1'), clos(')'))), '<mfenced open="(" close=")"><mrow><mn>1</mn></mrow></mfenced>');
});

test('starmathOdt : fraction, puissance, racine, vecteur et barre dans la langue de LibreOffice', () => {
    assert.strictEqual(Rendu.starmathOdt(n('mfrac', {}, nombre('48'), nombre('60'))), '{48} over {60}');
    assert.strictEqual(Rendu.starmathOdt(n('msup', {}, n('mi', {}, 'x'), nombre('2'))), '{x}^{2}');
    assert.strictEqual(Rendu.starmathOdt(n('msqrt', {}, nombre('2'))), 'sqrt{2}');
    /* LibreOffice ne lit pas les accents du MathML : sans cela, un vecteur perdrait sa flèche. */
    const fleche = n('mo', {}, String.fromCharCode(0x20D7));
    const ab = () => n('mrow', {}, n('mi', {}, 'A'), n('mi', {}, 'B'));
    assert.strictEqual(Rendu.starmathOdt(n('mover', {}, n('mi', {}, 'u'), fleche)), 'vec{u}');
    assert.strictEqual(Rendu.starmathOdt(n('mover', {}, ab(), fleche)), 'widevec{A B}');
    assert.strictEqual(Rendu.starmathOdt(n('mover', {}, ab(), n('mo', {}, String.fromCharCode(0x203E)))), 'overline{A B}');
});

test('starmathOdt : mots entre guillemets, signe isolé protégé, délimiteurs extensibles, grands opérateurs', () => {
    assert.strictEqual(Rendu.starmathOdt(n('mo', {}, 'lim')), '"lim"');
    assert.strictEqual(Rendu.starmathOdt(n('mrow', {}, nombre('1'), n('mo', {}, '+'), nombre('2'))), '{1 + 2}');
    /* Un "=" sans rien à sa gauche : LibreOffice afficherait un point d'interrogation renversé. */
    assert.strictEqual(Rendu.starmathOdt(n('mrow', {}, n('mo', {}, '='), nombre('4'))), '{"=" 4}');
    const clos = (signe) => n('mo', { fence: 'true' }, signe);
    assert.strictEqual(Rendu.starmathOdt(n('mrow', {}, clos('('), nombre('1'), clos(')'))), 'left( 1 right)');
    assert.strictEqual(Rendu.starmathOdt(n('mrow', {}, clos('{'), nombre('1'))), 'left lbrace 1 right none');
    const somme = n('mo', {}, String.fromCharCode(0x2211));
    assert.strictEqual(Rendu.starmathOdt(n('munderover', {}, somme, n('mrow', {}, n('mi', {}, 'k'), n('mo', {}, '='), nombre('1')), n('mi', {}, 'n'))),
        'sum from{k = 1} to{n}');
    /* Chimie (mhchem) : l'indice sans base s'accroche à la lettre qui le précède. */
    const fantome = () => n('mrow', {}, n('mpadded', {}, n('mphantom', {}, n('mi', {}, 'X'))));
    assert.strictEqual(Rendu.starmathOdt(n('mrow', {}, n('mi', { mathvariant: 'normal' }, 'H'), n('msub', {}, fantome(), nombre('2')), n('mi', { mathvariant: 'normal' }, 'O'))),
        '{{"H"}_{2} "O"}');
});

test('corpsOdt : formule en objet dans le texte, formule centrée dans son paragraphe', () => {
    const demi = () => n('mfrac', {}, nombre('1'), nombre('2'));
    const etat = etatVide();
    const xml = Rendu.corpsOdt(n('DIV', {},
        n('P', {}, 'Calcul : ', mathml('a', demi()), ' puis ',
            n('SPAN', { class: 'katex-display' }, mathml('b', demi())), ' Le réservoir est plein.')), etat);
    const cadre = (i) => '<draw:frame draw:style-name="Formule" draw:name="Formule' + i + '" text:anchor-type="as-char">'
        + '<draw:object xlink:href="./Object ' + i + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>';
    assert.ok(xml.includes('<text:p>Calcul : ' + cadre(1) + '<text:s/>puis </text:p>'));
    assert.ok(xml.includes('<text:p text:style-name="Centre">' + cadre(2) + '</text:p><text:p>Le réservoir est plein.</text:p>'));
    assert.strictEqual(etat.objets.length, 2);
    assert.ok(etat.objets[0].includes('<mfrac>' + rang('<mn>1</mn>') + rang('<mn>2</mn>') + '</mfrac>'));
    assert.ok(etat.objets[0].endsWith('<annotation encoding="application/x-tex">a</annotation><annotation encoding="StarMath 5.0">{{1} over {2}}</annotation>'));
    assert.ok(!xml.includes('rendu'));
});

test('corpsOdt : figure insérée, ramenée à 16 cm sur 12, image non préparée omise', () => {
    const figure = n('svg', {});
    const perdue = n('IMG', { alt: 'Tour Eiffel' });
    const etat = etatVide();
    etat.images.set(figure, { octets: new Uint8Array([1]), extension: 'png', largeur: 800, hauteur: 400 });
    const xml = Rendu.corpsOdt(n('DIV', {},
        n('DIV', { class: 'diagramme' }, n('DIV', { class: 'boutons-figure' }, n('BUTTON', {}, n('svg', {}))), figure),
        n('FIGURE', { class: 'image-commons' }, n('DIV', { class: 'cadre-image' }, perdue),
            n('FIGCAPTION', {}, n('Q', {}, n('I', {}, 'La tour'))))), etat);
    assert.ok(xml.includes('<text:p text:style-name="Centre"><draw:frame draw:style-name="Image" draw:name="Image1" text:anchor-type="as-char" svg:width="16.000cm" svg:height="8.000cm">'
        + '<draw:image xlink:href="Pictures/image1.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>'));
    assert.strictEqual(etat.medias.length, 1);
    /* Légende gardée même sans image. */
    assert.ok(xml.includes('La tour'));
});

test('odt : archive complète, mimetype en tête, formule et image déclarées', async (t) => {
    const figure = n('svg', {});
    const reponse = n('DIV', {},
        n('H1', {}, 'Évaluation'),
        n('P', {}, 'Durée : ', n('STRONG', {}, '30 minutes'), '. Formule : ', mathml('a', n('mfrac', {}, nombre('48'), nombre('60'))),
            n('SPAN', { class: 'katex-display' }, mathml('b', n('msup', {}, n('mi', {}, 'x'), nombre('2')), n('mo', {}, '='), n('msqrt', {}, nombre('2')))), 'Suite.'),
        n('OL', {}, n('LI', {}, 'Énoncer le théorème.'), n('LI', {}, 'Calculer ', n('CODE', {}, 'BC'), '.', n('UL', {}, n('LI', {}, 'poser le calcul')))),
        n('TABLE', {}, n('TR', {}, n('TH', {}, 'Question'), n('TH', {}, 'Points')), n('TR', {}, n('TD', {}, '1'), n('TD', {}, '4'))),
        n('DIV', { class: 'diagramme' }, figure),
        n('P', {}, n('A', { href: 'https://fr.wikipedia.org/wiki/Pythagore' }, 'Source')));
    /* PNG d'un pixel : préparer une vraie figure demande un navigateur. */
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
    t.mock.method(Rendu, 'imagesExport', async () => new Map([[figure, { octets: png, extension: 'png', largeur: 800, hauteur: 400 }]]));
    const fichier = await Rendu.odt(reponse);
    assert.strictEqual(fichier.type, 'application/vnd.oasis.opendocument.text');
    const archive = new Uint8Array(await fichier.arrayBuffer());
    const lire = (nom) => new TextDecoder().decode(dansZip(archive, nom));
    /* mimetype en premier et sans compression : c'est à cela qu'on reconnaît un .odt. */
    assert.strictEqual(new TextDecoder().decode(archive.subarray(30, 38)), 'mimetype');
    assert.strictEqual(new TextDecoder().decode(archive.subarray(38, 77)), 'application/vnd.oasis.opendocument.text');
    assert.ok(lire('content.xml').includes('>Évaluation</text:h>'));
    assert.ok(lire('content.xml').includes('<style:style style:name="Tg" style:family="text">'));
    assert.ok(lire('content.xml').endsWith('</office:text></office:body></office:document-content>'));
    assert.ok(lire('Object 1/content.xml').startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(lire('Object 2/content.xml').includes('<msqrt><mn>2</mn></msqrt>'));
    assert.ok(lire('META-INF/manifest.xml').includes('manifest:full-path="Object 2/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.formula"'));
    assert.ok(lire('META-INF/manifest.xml').includes('manifest:full-path="Pictures/image1.png" manifest:media-type="image/png"'));
    assert.ok(lire('styles.xml').includes('style:name="Heading_20_3"'));
    assert.deepStrictEqual(dansZip(archive, 'Pictures/image1.png'), png);
    /* ODT_SORTIE=chemin : garde le fichier, pour l'ouvrir dans LibreOffice. */
    if (process.env.ODT_SORTIE) {
        require('node:fs').writeFileSync(process.env.ODT_SORTIE, archive);
    }
});
