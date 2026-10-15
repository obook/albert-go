/*
 * rendu/docx.js
 * Écriture Word (.docx) d'une réponse affichée, sans bibliothèque.
 *
 * Le parcours de la réponse et le zip sont dans export.js, chargé avant.
 * Complète l'objet Rendu de rendu.js.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Rendu, {
    /* Saut de ligne dans un paragraphe. */
    SAUT_DOCX: '<w:r><w:br/></w:r>',

    /**
     * Morceau de texte avec sa mise en forme.
     *
     * @param {string} texte - Texte brut.
     * @param {Object} style - { gras, italique, barre, code, lien, position }.
     * @returns {string} XML d'un w:r.
     */
    runDocx(texte, style) {
        const props = (style.lien ? '<w:rStyle w:val="Hyperlink"/>' : '')
            + (style.code ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>' : '')
            + (style.gras ? '<w:b/>' : '') + (style.italique ? '<w:i/>' : '') + (style.barre ? '<w:strike/>' : '')
            + (style.position ? '<w:vertAlign w:val="' + style.position + '"/>' : '');
        return '<w:r>' + (props ? '<w:rPr>' + props + '</w:rPr>' : '')
            + '<w:t xml:space="preserve">' + this.echapperXml(texte) + '</w:t></w:r>';
    },

    /**
     * Un paragraphe Word. Sauts de ligne retirés en tête et en queue ; un
     * paragraphe qui ne contient qu'une image est centré.
     *
     * @param {string[]} runs - Morceaux du paragraphe.
     * @param {string} [pPr] - Propriétés du paragraphe.
     * @returns {string} XML du w:p, ou '' s'il n'a que des blancs.
     */
    unParagrapheDocx(runs, pPr = '') {
        const contenu = [...runs];
        while (contenu[0] === this.SAUT_DOCX) {
            contenu.shift();
        }
        while (contenu.at(-1) === this.SAUT_DOCX) {
            contenu.pop();
        }
        /* Après une formule centrée, le texte repart sans l'espace laissée par le retour à la ligne. */
        const corps = contenu.join('').replace(/^(<w:r>(?:<w:rPr>.*?<\/w:rPr>)?<w:t xml:space="preserve">) +/, '$1');
        if (!/<w:drawing>|<m:oMath/.test(corps) && !corps.replace(/<[^>]+>/g, '').trim()) {
            return '';
        }
        const image = contenu.every((run) => run.includes('<w:drawing>'));
        const props = pPr + (image && !pPr.includes('<w:jc') ? '<w:jc w:val="center"/>' : '');
        return '<w:p>' + (props ? '<w:pPr>' + props + '</w:pPr>' : '') + corps + '</w:p>';
    },

    /* Accents de KaTeX (chapeau, tilde, flèche) remplacés par le signe combinant que Word attend. */
    ACCENTS_OMML: { '^': 0x302, '~': 0x303, [String.fromCharCode(0x2192)]: 0x20D7 },

    /* Traits de KaTeX pour une barre au-dessus. */
    SURLIGNES_OMML: [String.fromCharCode(0x203E), String.fromCharCode(0xAF)],

    /**
     * Équation Word (OMML) d'un élément MathML de KaTeX.
     *
     * @param {Element} noeud - Élément MathML.
     * @param {string} [baseHeritee] - Base d'un indice qui n'en a pas : ce qui le précède.
     * @returns {string} XML OMML, sans l'enveloppe m:oMath.
     */
    ommlDocx(noeud, baseHeritee = '') {
        const elements = (parent) => [...parent.childNodes].filter((enfant) => enfant.nodeType === 1);
        const fils = elements(noeud);
        const suite = (liste) => {
            const morceaux = [];
            for (const enfant of liste) {
                /* Chimie (mhchem) : un indice sans base s'accroche à ce qui le précède. */
                const base = elements(enfant)[0];
                const orphelin = this.INDICES_MATHML.includes(enfant.tagName.toLowerCase()) && base && !this.ommlDocx(base);
                morceaux.push(this.ommlDocx(enfant, orphelin ? morceaux.pop() : ''));
            }
            return morceaux.join('');
        };
        const tous = () => suite(fils);
        const partie = (i) => (fils[i] ? this.ommlDocx(fils[i]) : '');
        const texte = (proprietes = '') => {
            const lu = this.echapperXml(this.flechesTexte(noeud.textContent.replace(this.INVISIBLES_MATHML, '')));
            return lu ? '<m:r>' + proprietes + '<m:t xml:space="preserve">' + lu + '</m:t></m:r>' : '';
        };
        /* Texte droit. LibreOffice ne respecte que la marque "nor" ; sans elle, il lit "lim" comme un mot-clé et casse la formule. */
        const droit = '<m:rPr><m:nor/></m:rPr>';
        /* Indice ou exposant sans base (chimie) : un blanc sans largeur, sinon Word dessine une case vide. */
        const base = () => partie(0) || baseHeritee || '<m:r><m:t>&#8203;</m:t></m:r>';
        const formes = {
            annotation: () => '',
            mn: () => texte(),
            /* Mot (lim) ou crochet hors paire extensible, comme ceux de ]a ; b[ : sans la marque, LibreOffice casse la formule. */
            mo: () => texte(/^([A-Za-z]{2,}|[\[\]])$/.test(noeud.textContent) ? droit : ''),
            /* Plusieurs lettres (sin, cm) ou variante "normal" : en droit, pas en italique. */
            mi: () => {
                const ensemble = noeud.getAttribute('mathvariant') === 'double-struck' && this.ENSEMBLES_MATHML[noeud.textContent];
                if (ensemble) {
                    return '<m:r><m:t xml:space="preserve">' + String.fromCodePoint(ensemble) + '</m:t></m:r>';
                }
                return texte(noeud.textContent.length > 1 || noeud.getAttribute('mathvariant') === 'normal' ? droit : '');
            },
            mrow: () => {
                /* Parenthèse ou accolade extensible de KaTeX : un délimiteur Word, qui grandit avec son contenu. */
                const clos = (enfant) => enfant.tagName.toLowerCase() === 'mo' && enfant.getAttribute('fence') === 'true';
                if (fils.length < 2 || !clos(fils[0])) {
                    return tous();
                }
                const fin = clos(fils.at(-1)) ? fils.at(-1) : null;
                const dedans = suite(fils.slice(1, fin ? -1 : undefined));
                return '<m:d><m:dPr><m:begChr m:val="' + this.echapperXml(fils[0].textContent) + '"/><m:endChr m:val="'
                    + this.echapperXml(fin ? fin.textContent : '') + '"/></m:dPr><m:e>' + dedans + '</m:e></m:d>';
            },
            mtext: () => texte(droit),
            /* Lettre fantôme de mhchem, qui ne sert qu'à caler la hauteur. */
            mphantom: () => '',
            mspace: () => '<m:r><m:t xml:space="preserve"> </m:t></m:r>',
            mfrac: () => '<m:f><m:num>' + partie(0) + '</m:num><m:den>' + partie(1) + '</m:den></m:f>',
            msup: () => '<m:sSup><m:e>' + base() + '</m:e><m:sup>' + partie(1) + '</m:sup></m:sSup>',
            msub: () => '<m:sSub><m:e>' + base() + '</m:e><m:sub>' + partie(1) + '</m:sub></m:sSub>',
            msubsup: () => '<m:sSubSup><m:e>' + base() + '</m:e><m:sub>' + partie(1) + '</m:sub><m:sup>' + partie(2) + '</m:sup></m:sSubSup>',
            msqrt: () => '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>' + tous() + '</m:e></m:rad>',
            mroot: () => '<m:rad><m:deg>' + partie(1) + '</m:deg><m:e>' + partie(0) + '</m:e></m:rad>',
            mover: () => {
                const signe = (fils[1] ? fils[1].textContent : '').trim();
                /* Flèche de réaction de mhchem : rien au-dessus. */
                if (!signe) {
                    return partie(0);
                }
                if (this.SURLIGNES_OMML.includes(signe)) {
                    return '<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>' + partie(0) + '</m:e></m:bar>';
                }
                const accent = this.ACCENTS_OMML[signe] ? String.fromCharCode(this.ACCENTS_OMML[signe]) : signe;
                return '<m:acc><m:accPr><m:chr m:val="' + this.echapperXml(accent) + '"/></m:accPr><m:e>' + partie(0) + '</m:e></m:acc>';
            },
            munder: () => '<m:limLow><m:e>' + partie(0) + '</m:e><m:lim>' + partie(1) + '</m:lim></m:limLow>',
            /* ponytail: somme ou intégrale rendue par deux limites ; m:nary si la taille de l'opérateur compte. */
            munderover: () => '<m:limUpp><m:e><m:limLow><m:e>' + partie(0) + '</m:e><m:lim>' + partie(1) + '</m:lim></m:limLow></m:e><m:lim>'
                + partie(2) + '</m:lim></m:limUpp>',
            /* Tableau de variations : des cases vides. plcHide retire leur repère dans Word ; l'espace
               sans largeur les garde à leur place quand LibreOffice ouvre le fichier. */
            mtable: () => '<m:m><m:mPr><m:plcHide m:val="1"/></m:mPr>' + tous() + '</m:m>',
            mtr: () => '<m:mr>' + fils.map((cellule) => '<m:e>' + (this.ommlDocx(cellule) || '<m:r><m:t>&#8203;</m:t></m:r>') + '</m:e>').join('') + '</m:mr>'
        };
        /* math, semantics, mstyle, mtd et le reste : leurs enfants à la suite. */
        const forme = formes[noeud.tagName.toLowerCase()];
        return forme ? forme() : tous();
    },

    /* 16 cm et 12 cm, largeur et hauteur maximales d'une image, en EMU (360 000 par cm). */
    LARGEUR_IMAGE_DOCX: 5760000,
    HAUTEUR_IMAGE_DOCX: 4320000,

    /**
     * Image insérée dans le texte, si elle a pu être préparée.
     *
     * @param {Element} noeud - <svg> ou <img> de la réponse.
     * @param {Object} etat - Voir docx().
     * @returns {string[]} Un w:r avec l'image, ou rien.
     */
    imageDocx(noeud, etat) {
        const image = etat.images.get(noeud);
        if (!image || !image.largeur || !image.hauteur) {
            return [];
        }
        etat.medias.push(image);
        const numero = etat.medias.length;
        etat.rels.push({ type: 'image', cible: 'media/image' + numero + '.' + image.extension });
        /* 9525 EMU par pixel, ramené à la largeur de la page et à une demi-page de haut. */
        const echelle = Math.min(1, this.LARGEUR_IMAGE_DOCX / (image.largeur * 9525), this.HAUTEUR_IMAGE_DOCX / (image.hauteur * 9525));
        const cx = Math.round(image.largeur * 9525 * echelle);
        const cy = Math.round(image.hauteur * 9525 * echelle);
        return ['<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
            + '<wp:extent cx="' + cx + '" cy="' + cy + '"/>'
            + '<wp:docPr id="' + numero + '" name="Image ' + numero + '" descr="' + this.echapperXml(noeud.getAttribute('alt') || '') + '"/>'
            + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
            + '<pic:nvPicPr><pic:cNvPr id="' + numero + '" name="Image ' + numero + '"/><pic:cNvPicPr/></pic:nvPicPr>'
            + '<pic:blipFill><a:blip r:embed="rId' + (2 + etat.rels.length) + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
            + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>'
            + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
            + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'];
    },

    /**
     * Corps du document Word d'une réponse affichée.
     *
     * @param {Node} element - Conteneur de la réponse.
     * @param {Object} etat - Voir docx().
     * @returns {string} XML des blocs ; un paragraphe vide si la réponse n'a rien.
     */
    corpsDocx(element, etat) {
        etat.e ??= this.ecritureDocx();
        return this.corpsExport(element, etat);
    },

    /**
     * Liste Word, avec ses sous-listes : paragraphes numérotés à plat.
     *
     * @param {Element} noeud - <ul> ou <ol>.
     * @param {Object} etat - Voir docx().
     * @param {{niveau: number, numId: number}} parent - Liste qui contient celle-ci.
     * @returns {string} XML des paragraphes.
     */
    listeDocx(noeud, etat, parent) {
        etat.e ??= this.ecritureDocx();
        return this.listeExport(noeud, etat, parent);
    },

    /**
     * Écriture Word des morceaux que le parcours (export.js) décrit.
     *
     * @returns {Object} Écriture à placer dans etat.e.
     */
    ecritureDocx() {
        return {
            saut: this.SAUT_DOCX,
            vide: '<w:p/>',
            genreRetrait: '<w:ind w:left="720"/>',
            genreCentre: '<w:jc w:val="center"/>',
            genreTitre: (rang) => '<w:pStyle w:val="Heading' + rang + '"/>',
            texte: (texte, style) => this.runDocx(texte, style),
            image: (noeud, etat) => this.imageDocx(noeud, etat),
            paragraphe: (runs, genre) => this.unParagrapheDocx(runs, genre),
            formule: (maths) => {
                const omml = this.ommlDocx(maths);
                /* Signe seul (case d'un tableau de variations) : en texte droit, sinon LibreOffice lui cherche un opérande. */
                const seul = /^<m:r>(<m:t xml:space="preserve">[+\-\u2212]<\/m:t><\/m:r>)$/.exec(omml);
                return omml ? '<m:oMath>' + (seul ? '<m:r><m:rPr><m:nor/></m:rPr>' + seul[1] : omml) + '</m:oMath>' : '';
            },
            estFormule: (morceau) => morceau.startsWith('<m:oMath>'),
            centrer: (morceau) => '<m:oMathPara>' + morceau + '</m:oMathPara>',
            estCentree: (morceau) => morceau.startsWith('<m:oMathPara>'),
            lien: (cible, interieur, etat) => {
                etat.rels.push({ type: 'hyperlink', cible });
                return '<w:hyperlink r:id="rId' + (2 + etat.rels.length) + '">' + interieur.join('') + '</w:hyperlink>';
            },
            /* Puces : numId 1. Chaque liste numérotée a le sien, pour repartir de son début ;
               une sous-liste numérotée garde celui de sa liste. */
            liste: (etat, { ordonnee, debut, niveau, parent }) => {
                let numId = 1;
                if (ordonnee) {
                    numId = parent.numId > 1 ? parent.numId : etat.listes.push({ debut, niveau }) + 1;
                }
                return {
                    numId,
                    genre: '<w:numPr><w:ilvl w:val="' + niveau + '"/><w:numId w:val="' + numId + '"/></w:numPr>',
                    genreSuite: '<w:ind w:left="' + 720 * (niveau + 1) + '"/>'
                };
            },
            finListe: (elements) => elements.join(''),
            tableau: (cases, colonnes) => {
                /* 9638 : largeur utile d'une page A4 aux marges de 2 cm, en vingtièmes de point. */
                const largeur = Math.floor(9638 / colonnes);
                const cellule = (texte) => '<w:tc><w:tcPr><w:tcW w:w="' + largeur + '" w:type="dxa"/></w:tcPr>' + (texte || '<w:p/>') + '</w:tc>';
                return '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>'
                    + ('<w:gridCol w:w="' + largeur + '"/>').repeat(colonnes) + '</w:tblGrid>'
                    + cases.map((ligne) => '<w:tr>' + ligne.map(cellule).join('') + '</w:tr>').join('')
                    /* Paragraphe vide : deux tableaux qui se suivent fusionneraient. */
                    + '</w:tbl><w:p/>';
            },
            /* Tableau à filets (tableau de variations) : trait sous une ligne, à droite d'une colonne, double à une valeur interdite. */
            tableauRegle: (lignes, etat, poids) => {
                const total = poids.reduce((somme, p) => somme + p, 0);
                const largeur = (j) => Math.floor(9638 * poids[j] / total);
                const trait = (cote, genre) => '<w:' + cote + ' w:val="' + genre + '" w:sz="6" w:space="0" w:color="auto"/>';
                const cellule = (c, j) => '<w:tc><w:tcPr><w:tcW w:w="' + largeur(j) + '" w:type="dxa"/><w:tcBorders>' + (c.bas ? trait('bottom', 'single') : '')
                    + (c.droite ? trait('right', c.droite > 1 ? 'double' : 'single') : '') + '</w:tcBorders><w:vAlign w:val="center"/></w:tcPr>' + (c.xml || '<w:p/>') + '</w:tc>';
                return '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/></w:tblPr><w:tblGrid>'
                    + poids.map((_, j) => '<w:gridCol w:w="' + largeur(j) + '"/>').join('') + '</w:tblGrid>'
                    + lignes.map((ligne) => '<w:tr>' + ligne.map(cellule).join('') + '</w:tr>').join('') + '</w:tbl><w:p/>';
            },
            /* Un paragraphe par ligne, en chasse fixe. */
            code: (lignes) => lignes.map((ligne) => '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>' + this.runDocx(ligne, { code: true }) + '</w:p>').join('')
        };
    },

    /* Types des fichiers de l'archive. */
    TYPES_DOCX: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Default Extension="png" ContentType="image/png"/>'
        + '<Default Extension="jpg" ContentType="image/jpeg"/>'
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
        + '</Types>',

    /* Relation de l'archive vers le document. */
    RACINE_DOCX: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        + '</Relationships>',

    /**
     * Relations du document : styles, numérotation, puis images et liens
     * dans l'ordre où le parcours les a rencontrés.
     *
     * @param {Object} etat - Voir docx().
     * @returns {string} XML de word/_rels/document.xml.rels.
     */
    relsDocx(etat) {
        const TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
        return '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + '<Relationship Id="rId1" Type="' + TYPE + 'styles" Target="styles.xml"/>'
            + '<Relationship Id="rId2" Type="' + TYPE + 'numbering" Target="numbering.xml"/>'
            + etat.rels.map((rel, i) => '<Relationship Id="rId' + (i + 3) + '" Type="' + TYPE + rel.type
                + '" Target="' + this.echapperXml(rel.cible) + '"' + (rel.type === 'hyperlink' ? ' TargetMode="External"' : '') + '/>').join('')
            + '</Relationships>';
    },

    /**
     * Numérotations : les puces (numId 1), puis une par liste numérotée.
     *
     * @param {Object} etat - Voir docx().
     * @returns {string} XML de word/numbering.xml.
     */
    numerotationDocx(etat) {
        const niveaux = (format, texte) => Array.from({ length: 9 }, (_, i) => '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/>'
            + '<w:numFmt w:val="' + format + '"/><w:lvlText w:val="' + texte(i) + '"/><w:lvlJc w:val="left"/>'
            + '<w:pPr><w:ind w:left="' + 720 * (i + 1) + '" w:hanging="360"/></w:pPr></w:lvl>').join('');
        return '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            + '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>' + niveaux('bullet', () => '&#8226;') + '</w:abstractNum>'
            + '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>' + niveaux('decimal', (i) => '%' + (i + 1) + '.') + '</w:abstractNum>'
            + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
            + etat.listes.map((liste, i) => '<w:num w:numId="' + (i + 2) + '"><w:abstractNumId w:val="1"/>'
                + '<w:lvlOverride w:ilvl="' + liste.niveau + '"><w:startOverride w:val="' + liste.debut + '"/></w:lvlOverride></w:num>').join('')
            + '</w:numbering>';
    },

    /**
     * Styles : Arial 11, titres en gras de 16, 14 et 12 points, liens, tableau à bordures.
     *
     * @param {boolean} [sansGras] - Titres sans gras (Imprimerie).
     * @returns {string} XML de word/styles.xml. Tailles en demi-points.
     */
    stylesDocx(sansGras = false) {
        const titre = (rang, taille) => '<w:style w:type="paragraph" w:styleId="Heading' + rang + '"><w:name w:val="heading ' + rang + '"/>'
            + '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>'
            + '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="' + (rang - 1) + '"/></w:pPr>'
            + '<w:rPr>' + (sansGras ? '' : '<w:b/>') + '<w:sz w:val="' + taille + '"/><w:szCs w:val="' + taille + '"/></w:rPr></w:style>';
        const bord = (cote) => '<w:' + cote + ' w:val="single" w:sz="4" w:space="0" w:color="auto"/>';
        return '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>'
            + '<w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>'
            + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
            + titre(1, 32) + titre(2, 28) + titre(3, 24)
            + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'
            + '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>'
            + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(bord).join('')
            + '</w:tblBorders></w:tblPr></w:style>'
            + '</w:styles>';
    },

    /**
     * Fichier .docx d'une réponse affichée.
     *
     * etat : images préparées, puis médias, relations et listes numérotées
     * que le parcours rencontre.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @returns {Promise<Blob>} Document Word.
     */
    async docx(element, sansGras = false) {
        const etat = { images: await this.imagesExport(element), medias: [], rels: [], listes: [], e: this.ecritureDocx(), sansGras: sansGras };
        /* Page A4, marges de 2 cm (1134 vingtièmes de point). */
        const principal = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
            + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
            + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
            + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
            + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
            + ' xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>'
            + this.corpsDocx(element, etat)
            + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
            + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
            + '</w:body></w:document>';
        const xml = (texte) => new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + texte);
        return new Blob([this.zip([
            { nom: '[Content_Types].xml', octets: xml(this.TYPES_DOCX) },
            { nom: '_rels/.rels', octets: xml(this.RACINE_DOCX) },
            { nom: 'word/document.xml', octets: xml(principal) },
            { nom: 'word/_rels/document.xml.rels', octets: xml(this.relsDocx(etat)) },
            { nom: 'word/styles.xml', octets: xml(this.stylesDocx(sansGras)) },
            { nom: 'word/numbering.xml', octets: xml(this.numerotationDocx(etat)) },
            ...etat.medias.map((media, i) => ({ nom: 'word/media/image' + (i + 1) + '.' + media.extension, octets: media.octets }))
        ])], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }
});
