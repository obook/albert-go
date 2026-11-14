/*
 * rendu/odt.js
 * Écriture OpenDocument (.odt) d'une réponse affichée, sans bibliothèque.
 *
 * Le parcours de la réponse et le zip sont dans export.js, chargé avant.
 * Complète l'objet Rendu de rendu.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Rendu, {
    /* Espaces de noms des fichiers XML d'un .odt. */
    NS_ODT: 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"'
        + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"'
        + ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"'
        + ' xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"'
        + ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
        + ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"'
        + ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"'
        + ' xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"'
        + ' xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.3"',

    /* Marque d'une formule centrée, qui prendra son propre paragraphe. */
    BLOC_ODT: '<!--bloc-->',

    /**
     * Texte d'un .odt. ODF replie les espaces répétées et ignore celle de
     * tête : elles sont écrites, comme les tabulations.
     *
     * @param {string} texte - Texte brut.
     * @returns {string} Texte échappé.
     */
    texteOdt(texte) {
        return this.echapperXml(texte)
            .replace(/ {2,}/g, (suite) => ' <text:s text:c="' + (suite.length - 1) + '"/>')
            .replace(/^ /, '<text:s/>')
            .replace(/\t/g, '<text:tab/>');
    },

    /**
     * Morceau de texte avec sa mise en forme. Le style est retenu dans
     * etat.styles, pour être déclaré dans content.xml.
     *
     * @param {string} texte - Texte brut.
     * @param {Object} style - { gras, italique, barre, code, position }.
     * @param {Object} etat - Voir etatOdt().
     * @returns {string} Texte nu, ou text:span.
     */
    morceauOdt(texte, style, etat) {
        const nom = (style.gras ? 'g' : '') + (style.italique ? 'i' : '') + (style.barre ? 'b' : '') + (style.code ? 'c' : '')
            + (style.position === 'superscript' ? 'e' : '') + (style.position === 'subscript' ? 'n' : '');
        if (!nom) {
            return this.texteOdt(texte);
        }
        etat.styles.add(nom);
        return '<text:span text:style-name="T' + nom + '">' + this.texteOdt(texte) + '</text:span>';
    },

    /**
     * Un paragraphe ou un titre. Sauts de ligne retirés en tête et en queue ;
     * une image ou une formule centrée seule est centrée.
     *
     * @param {string[]} runs - Morceaux du paragraphe.
     * @param {string} [genre] - "p ..." ou "h ..." avec ses attributs, '' pour un paragraphe ordinaire.
     * @returns {string} XML, ou '' s'il n'a que des blancs.
     */
    paragrapheOdt(runs, genre = '') {
        const saut = '<text:line-break/>';
        const contenu = [...runs];
        while (contenu[0] === saut) {
            contenu.shift();
        }
        while (contenu.at(-1) === saut) {
            contenu.pop();
        }
        /* Après une formule centrée, le texte repart sans l'espace laissée par le retour à la ligne. */
        const corps = contenu.join('').replace(this.BLOC_ODT, '').replace(/^<text:s\/>/, '');
        if (!corps.includes('<draw:frame') && !corps.replace(/<[^>]+>/g, '').trim()) {
            return '';
        }
        const seule = contenu.every((run) => run.startsWith(this.BLOC_ODT) || run.includes('draw:style-name="Image"'));
        const attributs = genre || (seule ? 'p text:style-name="Centre"' : 'p');
        return '<text:' + attributs + '>' + corps + '</text:' + attributs.split(' ')[0] + '>';
    },

    /**
     * Image insérée dans le texte, si elle a pu être préparée.
     *
     * @param {Element} noeud - <svg> ou <img> de la réponse.
     * @param {Object} etat - Voir etatOdt().
     * @returns {string[]} Un cadre avec l'image, ou rien.
     */
    imageOdt(noeud, etat) {
        const image = etat.images.get(noeud);
        if (!image || !image.largeur || !image.hauteur) {
            return [];
        }
        etat.medias.push(image);
        const numero = etat.medias.length;
        /* 96 pixels par pouce, ramené à 16 cm de large et 12 cm de haut. */
        const cm = 2.54 / 96;
        const echelle = Math.min(1, 16 / (image.largeur * cm), 12 / (image.hauteur * cm));
        return ['<draw:frame draw:style-name="Image" draw:name="Image' + numero + '" text:anchor-type="as-char"'
            + ' svg:width="' + (image.largeur * cm * echelle).toFixed(3) + 'cm" svg:height="' + (image.hauteur * cm * echelle).toFixed(3) + 'cm">'
            + '<draw:image xlink:href="Pictures/image' + numero + '.' + image.extension + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>'
            + '<svg:title>' + this.echapperXml(noeud.getAttribute('alt') || '') + '</svg:title></draw:frame>'];
    },

    /**
     * Texte visible d'un élément MathML, hors lettres fantômes et source LaTeX.
     *
     * @param {Element} noeud - Élément MathML.
     * @returns {string} Texte, '' si l'élément ne montre rien.
     */
    texteMathml(noeud) {
        const fils = [...noeud.childNodes].filter((enfant) => enfant.nodeType === 1);
        if (['mphantom', 'annotation'].includes(noeud.tagName.toLowerCase())) {
            return '';
        }
        return fils.length ? fils.map((enfant) => this.texteMathml(enfant)).join('')
            : noeud.textContent.replace(this.INVISIBLES_MATHML, '').trim();
    },

    /**
     * MathML d'un élément de KaTeX, réécrit pour LibreOffice.
     *
     * Chaque argument (numérateur, exposant...) est mis dans une rangée :
     * MathML compte les enfants, et un argument peut en produire plusieurs.
     *
     * @param {Element} noeud - Élément MathML.
     * @param {string} [baseHeritee] - Base d'un indice qui n'en a pas : ce qui le précède.
     * @returns {string} MathML, sans l'enveloppe math.
     */
    mathmlOdt(noeud, baseHeritee = '') {
        const elements = (parent) => [...parent.childNodes].filter((enfant) => enfant.nodeType === 1);
        const fils = elements(noeud);
        const suite = (liste) => {
            const morceaux = [];
            for (const enfant of liste) {
                /* Chimie (mhchem) : un indice sans base s'accroche à ce qui le précède. */
                const base = elements(enfant)[0];
                const orphelin = this.INDICES_MATHML.includes(enfant.tagName.toLowerCase()) && base && !this.texteMathml(base);
                morceaux.push(this.mathmlOdt(enfant, orphelin ? morceaux.pop() : ''));
            }
            return morceaux.join('');
        };
        const tous = () => suite(fils);
        const rang = (i) => '<mrow>' + (fils[i] ? this.mathmlOdt(fils[i]) : '') + '</mrow>';
        const base = () => (fils[0] && this.texteMathml(fils[0]) ? rang(0) : '<mrow>' + baseHeritee + '</mrow>');
        const brut = this.flechesTexte(noeud.textContent.replace(this.INVISIBLES_MATHML, ''));
        const feuille = (balise, attributs = '') => (brut ? '<' + balise + attributs + '>' + this.echapperXml(brut) + '</' + balise + '>' : '');
        /* Mot (lim, sin, cm) ou lettre droite (chimie) : en texte, car LibreOffice tronque un opérateur de plusieurs lettres. */
        const mot = /^[A-Za-z]+$/.test(brut);
        const normale = noeud.getAttribute('mathvariant') === 'normal';
        const formes = {
            annotation: () => '',
            /* Lettre fantôme de mhchem, qui ne sert qu'à caler la hauteur. */
            mphantom: () => '',
            mn: () => feuille('mn'),
            mtext: () => feuille('mtext'),
            mspace: () => '<mtext> </mtext>',
            mo: () => feuille(mot && brut.length > 1 ? 'mtext' : 'mo'),
            mi: () => {
                const ensemble = noeud.getAttribute('mathvariant') === 'double-struck' && this.ENSEMBLES_MATHML[brut];
                if (ensemble) {
                    return '<mi mathvariant="normal">' + String.fromCodePoint(ensemble) + '</mi>';
                }
                if (mot && (brut.length > 1 || normale)) {
                    return feuille('mtext');
                }
                return feuille('mi', normale ? ' mathvariant="normal"' : '');
            },
            mrow: () => {
                /* Parenthèse ou accolade extensible de KaTeX : mfenced, que LibreOffice fait grandir avec son contenu. */
                const clos = (enfant) => enfant.tagName.toLowerCase() === 'mo' && enfant.getAttribute('fence') === 'true';
                if (fils.length < 2 || !clos(fils[0])) {
                    return '<mrow>' + tous() + '</mrow>';
                }
                const fin = clos(fils.at(-1)) ? fils.at(-1) : null;
                return '<mfenced open="' + this.echapperXml(fils[0].textContent) + '" close="' + this.echapperXml(fin ? fin.textContent : '') + '"><mrow>'
                    + suite(fils.slice(1, fin ? -1 : undefined)) + '</mrow></mfenced>';
            },
            mfrac: () => '<mfrac' + (noeud.getAttribute('linethickness') ? ' linethickness="' + this.echapperXml(noeud.getAttribute('linethickness')) + '"' : '') + '>'
                + rang(0) + rang(1) + '</mfrac>',
            msup: () => '<msup>' + base() + rang(1) + '</msup>',
            msub: () => '<msub>' + base() + rang(1) + '</msub>',
            msubsup: () => '<msubsup>' + base() + rang(1) + rang(2) + '</msubsup>',
            msqrt: () => '<msqrt>' + tous() + '</msqrt>',
            mroot: () => '<mroot>' + rang(0) + rang(1) + '</mroot>',
            /* Flèche de réaction de mhchem : rien au-dessus, donc pas d'accent. */
            mover: () => (fils[1] && this.texteMathml(fils[1]) ? '<mover>' + rang(0) + rang(1) + '</mover>' : (fils[0] ? this.mathmlOdt(fils[0]) : '')),
            munder: () => '<munder>' + rang(0) + rang(1) + '</munder>',
            munderover: () => '<munderover>' + rang(0) + rang(1) + rang(2) + '</munderover>',
            mtable: () => '<mtable>' + tous() + '</mtable>',
            mtr: () => '<mtr>' + fils.map((cellule) => '<mtd>' + this.mathmlOdt(cellule) + '</mtd>').join('') + '</mtr>'
        };
        /* math, semantics, mstyle, mtd et le reste : leurs enfants à la suite. */
        const forme = formes[noeud.tagName.toLowerCase()];
        return forme ? forme() : tous();
    },

    /* Signes que StarMath veut entourés de deux opérandes. */
    BINAIRES_STARMATH: ['+', '=', '<', '>', '/'],

    /* Caractères qui ont un sens dans la syntaxe de StarMath : écrits entre guillemets. */
    RESERVES_STARMATH: /[%#&^_~`|{}"\\]/,

    /* Accents de KaTeX : nom StarMath sur une lettre, puis sur plusieurs. */
    ACCENTS_STARMATH: {
        [String.fromCharCode(0x20D7)]: ['vec', 'widevec'], [String.fromCharCode(0x2192)]: ['widevec', 'widevec'],
        '^': ['hat', 'widehat'], '~': ['tilde', 'widetilde'],
        [String.fromCharCode(0x203E)]: ['overline', 'overline'], [String.fromCharCode(0xAF)]: ['overline', 'overline'],
        [String.fromCharCode(0x2D9)]: ['dot', 'dot'], [String.fromCharCode(0xA8)]: ['ddot', 'ddot']
    },

    /* Grands opérateurs : leurs bornes s'écrivent from et to. */
    OPERATEURS_STARMATH: { [String.fromCharCode(0x2211)]: 'sum', [String.fromCharCode(0x220F)]: 'prod', [String.fromCharCode(0x222B)]: 'int' },

    /**
     * Délimiteur extensible en StarMath : "left(", "right none"...
     *
     * @param {string} signe - Signe de KaTeX, '' s'il n'y en a pas.
     * @param {boolean} ouvrant - true à l'ouverture.
     * @returns {string} Mot-clé et délimiteur.
     */
    delimiteurStarmath(signe, ouvrant) {
        const trait = ouvrant ? 'lline' : 'rline';
        const nom = {
            '(': '(', ')': ')', '[': '[', ']': ']', '{': 'lbrace', '}': 'rbrace', '|': trait,
            [String.fromCharCode(0x2223)]: trait, [String.fromCharCode(0x27E8)]: 'langle', [String.fromCharCode(0x27E9)]: 'rangle'
        }[signe] || 'none';
        return (ouvrant ? 'left' : 'right') + (nom.length === 1 ? '' : ' ') + nom;
    },

    /**
     * Formule dans la langue de LibreOffice Math (StarMath), à partir du MathML de KaTeX.
     *
     * LibreOffice ne lit pas les accents du MathML (vecteur, barre, chapeau) :
     * il se fie à cette écriture, jointe à la formule en annotation.
     *
     * @param {Element} noeud - Élément MathML.
     * @param {{base: string, isole: boolean}} [contexte] - Base héritée d'un indice sans base ; signe en bout de rangée.
     * @returns {string} Formule StarMath.
     */
    starmathOdt(noeud, contexte = {}) {
        const elements = (parent) => [...parent.childNodes].filter((enfant) => enfant.nodeType === 1);
        const nomDe = (element) => element.tagName.toLowerCase();
        const clos = (element) => !!element && nomDe(element) === 'mo' && element.getAttribute('fence') === 'true';
        const fils = elements(noeud);
        const suite = (liste) => {
            const morceaux = [];
            liste.forEach((enfant, i) => {
                /* Chimie (mhchem) : un indice sans base s'accroche à ce qui le précède. */
                const base = elements(enfant)[0];
                const orphelin = this.INDICES_MATHML.includes(nomDe(enfant)) && base && !this.texteMathml(base);
                const morceau = this.starmathOdt(enfant, { base: orphelin ? morceaux.pop() : '', isole: i === 0 || i === liste.length - 1 });
                if (morceau) {
                    morceaux.push(morceau);
                }
            });
            return morceaux.join(' ');
        };
        /* Contenu d'un argument, sans les accolades d'une rangée : l'appelant pose les siennes. */
        const dedans = (element) => {
            if (!element) {
                return '';
            }
            return nomDe(element) === 'mrow' && !clos(elements(element)[0]) ? suite(elements(element)) : this.starmathOdt(element);
        };
        const arg = (i) => '{' + dedans(fils[i]) + '}';
        const base = () => (fils[0] && this.texteMathml(fils[0]) ? arg(0) : '{' + (contexte.base || '') + '}');
        const brut = this.flechesTexte(noeud.textContent.replace(this.INVISIBLES_MATHML, ''));
        const citer = (texte) => '"' + texte.replace(/"/g, "''") + '"';
        const mot = /^[A-Za-z]+$/.test(brut);
        const reserve = this.RESERVES_STARMATH.test(brut);
        const grand = fils[0] && this.OPERATEURS_STARMATH[this.texteMathml(fils[0])];
        const formes = {
            annotation: () => '',
            mphantom: () => '',
            mn: () => (/\s/.test(brut) || reserve ? citer(brut) : brut),
            mtext: () => (brut.trim() ? citer(brut) : (brut ? '~' : '')),
            mspace: () => '~',
            /* Mot (lim, sin) : entre guillemets, sinon LibreOffice le prend pour une commande. */
            mo: () => {
                /* Crochet hors paire extensible, comme ceux de ]a ; b[ : écrit seul, LibreOffice attend sa paire et met des "?". */
                if (brut === '[' || brut === ']') {
                    return '\\' + brut;
                }
                return (mot && brut.length > 1) || reserve || (contexte.isole && this.BINAIRES_STARMATH.includes(brut)) ? citer(brut) : brut;
            },
            mi: () => {
                const ensemble = noeud.getAttribute('mathvariant') === 'double-struck' && this.ENSEMBLES_MATHML[brut];
                if (ensemble) {
                    return String.fromCodePoint(ensemble);
                }
                return (mot && (brut.length > 1 || noeud.getAttribute('mathvariant') === 'normal')) || reserve ? citer(brut) : brut;
            },
            mrow: () => {
                if (fils.length < 2 || !clos(fils[0])) {
                    return '{' + suite(fils) + '}';
                }
                const fin = clos(fils.at(-1)) ? fils.at(-1) : null;
                return this.delimiteurStarmath(fils[0].textContent, true) + ' ' + suite(fils.slice(1, fin ? -1 : undefined))
                    + ' ' + this.delimiteurStarmath(fin ? fin.textContent : '', false);
            },
            mfrac: () => (/^0/.test(noeud.getAttribute('linethickness') || '') ? 'binom' + arg(0) + arg(1) : arg(0) + ' over ' + arg(1)),
            msup: () => (grand ? grand + ' to' + arg(1) : base() + '^' + arg(1)),
            msub: () => (grand ? grand + ' from' + arg(1) : base() + '_' + arg(1)),
            msubsup: () => (grand ? grand + ' from' + arg(1) + ' to' + arg(2) : base() + '_' + arg(1) + '^' + arg(2)),
            msqrt: () => 'sqrt{' + suite(fils) + '}',
            mroot: () => 'nroot' + arg(1) + arg(0),
            mover: () => {
                const signe = fils[1] ? this.texteMathml(fils[1]) : '';
                /* Flèche de réaction de mhchem : rien au-dessus. */
                if (!signe) {
                    return fils[0] ? this.starmathOdt(fils[0]) : '';
                }
                const accent = this.ACCENTS_STARMATH[signe];
                return accent ? accent[this.texteMathml(fils[0]).length > 1 ? 1 : 0] + arg(0) : arg(0) + ' csup ' + arg(1);
            },
            munder: () => arg(0) + ' csub ' + arg(1),
            munderover: () => (grand ? grand + ' from' + arg(1) + ' to' + arg(2) : arg(0) + ' csub ' + arg(1) + ' csup ' + arg(2)),
            mtable: () => 'matrix{' + fils.map((ligne) => elements(ligne).map((c) => '{' + suite(elements(c)) + '}').join(' # ')).join(' ## ') + '}'
        };
        const forme = formes[nomDe(noeud)];
        return forme ? forme() : suite(fils);
    },

    /**
     * État d'un export .odt, rempli au fil du parcours.
     *
     * @param {Map<Element, Object>} images - Images préparées par imagesExport.
     * @returns {Object} { images, medias, objets (MathML et StarMath des formules), styles, tableaux, e }.
     */
    etatOdt(images) {
        return { images, medias: [], objets: [], styles: new Set(), colonnes: new Set(), tableaux: 0, e: this.ecritureOdt() };
    },

    /**
     * Corps du document .odt d'une réponse affichée.
     *
     * @param {Node} element - Conteneur de la réponse.
     * @param {Object} etat - Voir etatOdt().
     * @returns {string} XML des blocs.
     */
    corpsOdt(element, etat) {
        return this.corpsExport(element, etat);
    },

    /**
     * Écriture OpenDocument des morceaux que le parcours (export.js) décrit.
     *
     * @returns {Object} Écriture à placer dans etat.e.
     */
    ecritureOdt() {
        return {
            saut: '<text:line-break/>',
            vide: '<text:p/>',
            genreRetrait: 'p text:style-name="Citation"',
            genreCentre: 'p text:style-name="Centre"',
            genreTitre: (rang) => 'h text:style-name="Heading_20_' + rang + '" text:outline-level="' + rang + '"',
            texte: (texte, style, etat) => this.morceauOdt(texte, style, etat),
            image: (noeud, etat) => this.imageOdt(noeud, etat),
            paragraphe: (runs, genre) => this.paragrapheOdt(runs, genre),
            /* ODT accepte le MathML : la formule devient un objet, modifiable dans LibreOffice Math. */
            formule: (maths, etat) => {
                const mathml = this.mathmlOdt(maths);
                if (!this.texteMathml(maths)) {
                    return '';
                }
                /* La source LaTeX est gardée aussi : un .odt d'Albert Go redéposé comme source retrouve ses formules. */
                const tex = this.descendant(maths, 'ANNOTATION');
                etat.objets.push(mathml + (tex ? '<annotation encoding="application/x-tex">' + this.echapperXml(tex.textContent) + '</annotation>' : '')
                    + '<annotation encoding="StarMath 5.0">' + this.echapperXml(this.starmathOdt(maths)) + '</annotation>');
                const numero = etat.objets.length;
                return '<draw:frame draw:style-name="Formule" draw:name="Formule' + numero + '" text:anchor-type="as-char">'
                    + '<draw:object xlink:href="./Object ' + numero + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>';
            },
            estFormule: (morceau) => morceau.startsWith('<draw:frame draw:style-name="Formule"'),
            centrer: (morceau) => this.BLOC_ODT + morceau,
            estCentree: (morceau) => morceau.startsWith(this.BLOC_ODT),
            lien: (cible, interieur) => '<text:a xlink:type="simple" xlink:href="' + this.echapperXml(cible) + '">' + interieur.join('') + '</text:a>',
            /* Les listes d'un .odt s'emboîtent : rien à porter sur les paragraphes. */
            liste: (etat, liste) => ({ ...liste, numId: 0, genre: '', genreSuite: '' }),
            finListe: (elements, liste) => '<text:list text:style-name="' + (liste.ordonnee ? 'Numeros' : 'Puces') + '">'
                + elements.map((element, i) => '<text:list-item' + (liste.ordonnee && i === 0 && liste.debut !== 1 ? ' text:start-value="' + liste.debut + '"' : '') + '>'
                    + (element || '<text:p/>') + '</text:list-item>').join('')
                + '</text:list>',
            tableau: (cases, colonnes, etat) => {
                etat.tableaux += 1;
                return '<table:table table:name="Tableau' + etat.tableaux + '" table:style-name="Tableau">'
                    + '<table:table-column table:number-columns-repeated="' + colonnes + '"/>'
                    + cases.map((ligne) => '<table:table-row>' + ligne.map((texte) => '<table:table-cell table:style-name="Case" office:value-type="string">'
                        + (texte || '<text:p/>') + '</table:table-cell>').join('') + '</table:table-row>').join('')
                    + '</table:table>';
            },
            /* Tableau à filets (tableau de variations). Styles Filet : B pour un trait dessous, 1 ou 2 pour un trait simple ou double à droite. */
            tableauRegle: (lignes, etat, poids) => {
                etat.tableaux += 1;
                const total = poids.reduce((somme, p) => somme + p, 0);
                /* 17 cm, la largeur du style Tableau, partagés selon les poids ; chaque largeur a son style, en centièmes de cm. */
                const colonnes = poids.map((p) => String(Math.round(1700 * p / total)));
                colonnes.forEach((largeur) => etat.colonnes.add(largeur));
                return '<table:table table:name="Tableau' + etat.tableaux + '" table:style-name="Tableau">'
                    + colonnes.map((largeur) => '<table:table-column table:style-name="Col' + largeur + '"/>').join('')
                    + lignes.map((ligne) => '<table:table-row>' + ligne.map((c) => '<table:table-cell table:style-name="Filet' + (c.bas ? 'B' : '') + (c.droite || '')
                        + '" office:value-type="string">' + (c.xml || '<text:p/>') + '</table:table-cell>').join('') + '</table:table-row>').join('')
                    + '</table:table>';
            },
            /* Un paragraphe par ligne, en chasse fixe. */
            code: (lignes) => lignes.map((ligne) => '<text:p text:style-name="Code">' + this.texteOdt(ligne) + '</text:p>').join('')
        };
    },

    /**
     * Styles automatiques de content.xml : mises en forme rencontrées,
     * paragraphes, cadres, tableau, listes.
     *
     * @param {Object} etat - Voir etatOdt().
     * @returns {string} Contenu de office:automatic-styles.
     */
    stylesContenuOdt(etat) {
        const texte = [...etat.styles].sort().map((nom) => '<style:style style:name="T' + nom + '" style:family="text"><style:text-properties'
            + (nom.includes('g') ? ' fo:font-weight="bold"' : '') + (nom.includes('i') ? ' fo:font-style="italic"' : '')
            + (nom.includes('b') ? ' style:text-line-through-style="solid"' : '') + (nom.includes('c') ? ' style:font-name="Courier New"' : '')
            + (nom.includes('e') ? ' style:text-position="super 58%"' : '') + (nom.includes('n') ? ' style:text-position="sub 58%"' : '')
            + '/></style:style>').join('');
        const paragraphe = (nom, proprietes, police = '') => '<style:style style:name="' + nom + '" style:family="paragraph" style:parent-style-name="Standard">'
            + '<style:paragraph-properties ' + proprietes + '/>' + police + '</style:style>';
        const niveaux = (balise, attributs) => Array.from({ length: 9 }, (_, i) => '<text:list-level-style-' + balise + ' text:level="' + (i + 1) + '" ' + attributs + '>'
            + '<style:list-level-properties text:list-level-position-and-space-mode="label-alignment">'
            + '<style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="' + (1.27 * (i + 1)).toFixed(2) + 'cm"/>'
            + '</style:list-level-properties></text:list-level-style-' + balise + '>').join('');
        return texte
            + paragraphe('Centre', 'fo:text-align="center"')
            + paragraphe('Citation', 'fo:margin-left="1.27cm"')
            + paragraphe('Code', 'fo:margin-bottom="0cm"', '<style:text-properties style:font-name="Courier New"/>')
            + '<style:style style:name="Image" style:family="graphic"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline"/></style:style>'
            /* Formule posée sur la ligne du texte (voir REGLAGES_ODT). */
            + '<style:style style:name="Formule" style:family="graphic"><style:graphic-properties style:vertical-pos="middle" style:vertical-rel="text"/></style:style>'
            + '<style:style style:name="Tableau" style:family="table"><style:table-properties style:width="17cm" table:align="left" fo:margin-bottom="0.21cm"/></style:style>'
            + '<style:style style:name="Case" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #000000"/></style:style>'
            /* Colonnes d'un tableau à filets : une largeur par style. */
            + [...etat.colonnes].sort().map((largeur) => '<style:style style:name="Col' + largeur + '" style:family="table-column"><style:table-column-properties style:column-width="'
                + (largeur / 100).toFixed(2) + 'cm"/></style:style>').join('')
            /* Cases d'un tableau à filets (tableauRegle) : aucun bord, sauf dessous (B) et à droite (1 simple, 2 double). */
            + ['', 'B'].flatMap((bas) => ['', '1', '2'].map((droite) => '<style:style style:name="Filet' + bas + droite + '" style:family="table-cell">'
                + '<style:table-cell-properties fo:padding="0.1cm" style:vertical-align="middle" fo:border-top="none" fo:border-left="none" fo:border-bottom="'
                + (bas ? '0.5pt solid #000000' : 'none') + '" fo:border-right="' + { '': 'none', 1: '0.5pt solid #000000', 2: '1.5pt double #000000' }[droite]
                + (droite === '2' ? '" style:border-line-width-right="0.5pt 0.5pt 0.5pt' : '') + '"/></style:style>')).join('')
            + '<text:list-style style:name="Puces">' + niveaux('bullet', 'text:bullet-char="&#8226;"') + '</text:list-style>'
            + '<text:list-style style:name="Numeros">' + niveaux('number', 'style:num-format="1" style:num-suffix="."') + '</text:list-style>';
    },

    /* Polices nommées dans les styles. */
    POLICES_ODT: '<office:font-face-decls>'
        + '<style:font-face style:name="Arial" svg:font-family="Arial" style:font-family-generic="swiss"/>'
        + '<style:font-face style:name="Courier New" svg:font-family="\'Courier New\'" style:font-family-generic="modern" style:font-pitch="fixed"/>'
        + '</office:font-face-decls>',

    /**
     * Styles du document : Arial 11, titres en gras de 16, 14 et 12 points, page A4 aux marges de 2 cm.
     *
     * @param {boolean} [sansGras] - Titres sans gras (Imprimerie).
     * @returns {string} XML de styles.xml.
     */
    stylesOdt(sansGras = false) {
        const titre = (rang, taille) => '<style:style style:name="Heading_20_' + rang + '" style:display-name="Heading ' + rang + '" style:family="paragraph"'
            + ' style:parent-style-name="Standard" style:next-style-name="Standard" style:default-outline-level="' + rang + '">'
            + '<style:paragraph-properties fo:margin-top="0.42cm" fo:margin-bottom="0.21cm" fo:keep-with-next="always"/>'
            + '<style:text-properties fo:font-size="' + taille + 'pt"' + (sansGras ? '' : ' fo:font-weight="bold"') + '/></style:style>';
        return '<office:document-styles ' + this.NS_ODT + '>' + this.POLICES_ODT
            + '<office:styles>'
            + '<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.21cm"/>'
            + '<style:text-properties style:font-name="Arial" fo:font-size="11pt"/></style:default-style>'
            + '<style:style style:name="Standard" style:family="paragraph" style:class="text"/>'
            + titre(1, 16) + titre(2, 14) + titre(3, 12)
            + '</office:styles>'
            + '<office:automatic-styles><style:page-layout style:name="Page"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm"'
            + ' fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2cm" fo:margin-right="2cm"/></style:page-layout></office:automatic-styles>'
            + '<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="Page"/></office:master-styles>'
            + '</office:document-styles>';
    },

    /**
     * Réglages du document : les formules s'alignent sur la ligne du texte.
     *
     * @returns {string} XML de settings.xml.
     */
    reglagesOdt() {
        return '<office:document-settings ' + this.NS_ODT + '><office:settings>'
            + '<config:config-item-set config:name="ooo:configuration-settings">'
            + '<config:config-item config:name="MathBaselineAlignment" config:type="boolean">true</config:config-item>'
            + '</config:config-item-set></office:settings></office:document-settings>';
    },

    /**
     * Liste des fichiers de l'archive, avec leur type.
     *
     * @param {Object} etat - Voir etatOdt().
     * @returns {string} XML de META-INF/manifest.xml.
     */
    manifesteOdt(etat) {
        const entree = (chemin, type, version = '') => '<manifest:file-entry manifest:full-path="' + chemin + '"' + version + ' manifest:media-type="' + type + '"/>';
        const version = ' manifest:version="1.3"';
        return '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">'
            + entree('/', 'application/vnd.oasis.opendocument.text', version)
            + entree('content.xml', 'text/xml') + entree('styles.xml', 'text/xml') + entree('settings.xml', 'text/xml')
            + etat.medias.map((media, i) => entree('Pictures/image' + (i + 1) + '.' + media.extension, media.extension === 'png' ? 'image/png' : 'image/jpeg')).join('')
            + etat.objets.map((objet, i) => entree('Object ' + (i + 1) + '/', 'application/vnd.oasis.opendocument.formula', version)
                + entree('Object ' + (i + 1) + '/content.xml', 'text/xml')).join('')
            + '</manifest:manifest>';
    },

    /**
     * Fichier .odt d'une réponse affichée.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @returns {Promise<Blob>} Document OpenDocument.
     */
    async odt(element, sansGras = false) {
        /* ponytail: validité vérifiée par l'ouverture dans LibreOffice ; passer le validateur ODF si un fichier est refusé ailleurs. */
        const etat = this.etatOdt(await this.imagesExport(element));
        etat.sansGras = sansGras;
        const corps = this.corpsOdt(element, etat);
        const xml = (texte) => new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?>\n' + texte);
        const contenu = '<office:document-content ' + this.NS_ODT + '>' + this.POLICES_ODT
            + '<office:automatic-styles>' + this.stylesContenuOdt(etat) + '</office:automatic-styles>'
            + '<office:body><office:text>' + corps + '</office:text></office:body></office:document-content>';
        return new Blob([this.zip([
            /* mimetype en premier et sans compression : c'est à cela qu'on reconnaît un .odt. */
            { nom: 'mimetype', octets: new TextEncoder().encode('application/vnd.oasis.opendocument.text') },
            { nom: 'META-INF/manifest.xml', octets: xml(this.manifesteOdt(etat)) },
            { nom: 'content.xml', octets: xml(contenu) },
            { nom: 'styles.xml', octets: xml(this.stylesOdt(sansGras)) },
            { nom: 'settings.xml', octets: xml(this.reglagesOdt()) },
            ...etat.medias.map((media, i) => ({ nom: 'Pictures/image' + (i + 1) + '.' + media.extension, octets: media.octets })),
            ...etat.objets.map((objet, i) => ({
                nom: 'Object ' + (i + 1) + '/content.xml',
                octets: xml('<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics>' + objet + '</semantics></math>')
            }))
        ])], { type: 'application/vnd.oasis.opendocument.text' });
    }
});
