/*
 * rendu/docx.js
 * Réponse affichée enregistrée en fichier Word (.docx), sans bibliothèque.
 *
 * Complète l'objet Rendu de rendu.js, chargé avant.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

Object.assign(Rendu, {
    /**
     * Somme de contrôle CRC-32 d'un fichier du zip.
     *
     * @param {Uint8Array} octets - Contenu.
     * @returns {number} CRC-32, entier non signé.
     */
    crc32(octets) {
        this._crc ??= Array.from({ length: 256 }, (_, n) => {
            for (let k = 0; k < 8; k++) {
                n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1;
            }
            return n >>> 0;
        });
        let crc = 0xFFFFFFFF;
        for (const octet of octets) {
            crc = this._crc[(crc ^ octet) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    },

    /**
     * Archive zip sans compression.
     *
     * @param {{nom: string, octets: Uint8Array}[]} fichiers - Fichiers, dans l'ordre de l'archive.
     * @returns {Uint8Array} Archive.
     */
    zip(fichiers) {
        /* ponytail: fichiers stockés tels quels ; CompressionStream('deflate-raw') si le poids gêne. */
        const encodeur = new TextEncoder();
        const morceaux = [];
        const repertoire = [];
        let adresse = 0;
        for (const fichier of fichiers) {
            const nom = encodeur.encode(fichier.nom);
            /* Champs communs à l'en-tête local et au répertoire : version 2.0, noms en UTF-8, 1er janvier 1980. */
            const commun = new DataView(new ArrayBuffer(26));
            commun.setUint16(0, 20, true);
            commun.setUint16(2, 0x0800, true);
            commun.setUint16(8, 0x0021, true);
            commun.setUint32(10, this.crc32(fichier.octets), true);
            commun.setUint32(14, fichier.octets.length, true);
            commun.setUint32(18, fichier.octets.length, true);
            commun.setUint16(22, nom.length, true);
            const local = new Uint8Array(30 + nom.length);
            new DataView(local.buffer).setUint32(0, 0x04034b50, true);
            local.set(new Uint8Array(commun.buffer), 4);
            local.set(nom, 30);
            const central = new Uint8Array(46 + nom.length);
            const vue = new DataView(central.buffer);
            vue.setUint32(0, 0x02014b50, true);
            vue.setUint16(4, 20, true);
            central.set(new Uint8Array(commun.buffer), 6);
            vue.setUint32(42, adresse, true);
            central.set(nom, 46);
            morceaux.push(local, fichier.octets);
            repertoire.push(central);
            adresse += local.length + fichier.octets.length;
        }
        const tailleRepertoire = repertoire.reduce((somme, entree) => somme + entree.length, 0);
        const fin = new DataView(new ArrayBuffer(22));
        fin.setUint32(0, 0x06054b50, true);
        fin.setUint16(8, fichiers.length, true);
        fin.setUint16(10, fichiers.length, true);
        fin.setUint32(12, tailleRepertoire, true);
        fin.setUint32(16, adresse, true);
        const archive = new Uint8Array(adresse + tailleRepertoire + 22);
        let position = 0;
        for (const morceau of [...morceaux, ...repertoire, new Uint8Array(fin.buffer)]) {
            archive.set(morceau, position);
            position += morceau.length;
        }
        return archive;
    },

    /* Saut de ligne dans un paragraphe. */
    SAUT_DOCX: '<w:r><w:br/></w:r>',

    /* Éléments qui ferment le paragraphe en cours. */
    BLOCS_DOCX: ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'PRE', 'DIV', 'FIGURE', 'FIGCAPTION', 'HR'],

    /**
     * Texte sûr dans du XML. Un seul caractère interdit en XML 1.0 rend le
     * fichier illisible dans Word : ils sont retirés.
     *
     * @param {string} texte - Texte du modèle.
     * @returns {string} Texte échappé.
     */
    echapperXml(texte) {
        return String(texte).replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    /**
     * true si l'élément porte la classe. Lue par getAttribute : le className d'un SVG n'est pas une chaîne.
     *
     * @param {Element} noeud - Élément.
     * @param {string} nom - Classe cherchée.
     * @returns {boolean}
     */
    aClasse(noeud, nom) {
        return (' ' + (noeud.getAttribute('class') || '') + ' ').includes(' ' + nom + ' ');
    },

    /**
     * Premier descendant portant cette balise.
     *
     * @param {Node} noeud - Départ.
     * @param {string} balise - Nom en majuscules.
     * @returns {?Element}
     */
    descendant(noeud, balise) {
        for (const enfant of noeud.childNodes) {
            if (enfant.nodeType !== 1) {
                continue;
            }
            if (enfant.tagName.toUpperCase() === balise) {
                return enfant;
            }
            const trouve = this.descendant(enfant, balise);
            if (trouve) {
                return trouve;
            }
        }
        return null;
    },

    /**
     * Morceau de texte avec sa mise en forme.
     *
     * @param {string} texte - Texte brut.
     * @param {Object} style - { gras, italique, barre, code, lien }.
     * @returns {string} XML d'un w:r.
     */
    runDocx(texte, style) {
        const props = (style.lien ? '<w:rStyle w:val="Hyperlink"/>' : '')
            + (style.code ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>' : '')
            + (style.gras ? '<w:b/>' : '') + (style.italique ? '<w:i/>' : '') + (style.barre ? '<w:strike/>' : '');
        return '<w:r>' + (props ? '<w:rPr>' + props + '</w:rPr>' : '')
            + '<w:t xml:space="preserve">' + this.echapperXml(texte) + '</w:t></w:r>';
    },

    /**
     * Contenu en ligne d'un nœud : texte, gras, liens, formules.
     *
     * @param {Node} noeud - Nœud de la réponse affichée.
     * @param {Object} etat - Voir docx().
     * @param {Object} style - Mise en forme héritée.
     * @returns {string[]} Morceaux XML, dans l'ordre.
     */
    lignesDocx(noeud, etat, style) {
        if (noeud.nodeType === 3) {
            const texte = style.code ? noeud.data : noeud.data.replace(/\s+/g, ' ');
            return texte ? [this.runDocx(texte, style)] : [];
        }
        if (noeud.nodeType !== 1) {
            return [];
        }
        const balise = noeud.tagName.toUpperCase();
        const enfants = (s) => [...noeud.childNodes].flatMap((enfant) => this.lignesDocx(enfant, etat, s));
        if (balise === 'BUTTON' || this.aClasse(noeud, 'boutons-figure') || this.aClasse(noeud, 'image-absente')) {
            return [];
        }
        if (balise === 'BR') {
            return [this.SAUT_DOCX];
        }
        if (balise === 'SVG' || balise === 'IMG') {
            return this.imageDocx(noeud, etat);
        }
        if (this.aClasse(noeud, 'katex')) {
            /* ponytail: formule en LaTeX brut ; équations Word (OMML) si les enseignants le demandent. */
            const tex = this.descendant(noeud, 'ANNOTATION');
            return tex ? [this.runDocx(tex.textContent, style)] : enfants(style);
        }
        if (this.aClasse(noeud, 'katex-display')) {
            return [this.SAUT_DOCX, ...enfants(style), this.SAUT_DOCX];
        }
        if (balise === 'A') {
            const adresse = noeud.getAttribute('href') || '';
            if (style.lien || !/^(https?:|mailto:)/i.test(adresse)) {
                return enfants(style);
            }
            /* Adresse normalisée : une adresse mal formée dans les relations rend le fichier illisible dans Word. */
            let cible;
            try {
                cible = new URL(adresse).href;
            } catch (err) {
                return enfants(style);
            }
            const interieur = enfants({ ...style, lien: true });
            if (!interieur.length) {
                return [];
            }
            etat.rels.push({ type: 'hyperlink', cible });
            return ['<w:hyperlink r:id="rId' + (2 + etat.rels.length) + '">' + interieur.join('') + '</w:hyperlink>'];
        }
        if (balise === 'Q') {
            return [this.runDocx('"', style), ...enfants(style), this.runDocx('"', style)];
        }
        const ajout = {
            STRONG: { gras: true }, B: { gras: true }, EM: { italique: true }, I: { italique: true },
            DEL: { barre: true }, S: { barre: true }, CODE: { code: true }
        }[balise];
        return enfants(ajout ? { ...style, ...ajout } : style);
    },

    /**
     * Paragraphe Word. Sauts de ligne retirés en tête et en queue ; un
     * paragraphe qui ne contient qu'une image est centré.
     *
     * @param {string[]} runs - Morceaux de lignesDocx.
     * @param {string} [pPr] - Propriétés du paragraphe.
     * @returns {string} XML du w:p, ou '' s'il est vide.
     */
    paragrapheDocx(runs, pPr = '') {
        const contenu = [...runs];
        while (contenu[0] === this.SAUT_DOCX) {
            contenu.shift();
        }
        while (contenu.at(-1) === this.SAUT_DOCX) {
            contenu.pop();
        }
        if (!contenu.length) {
            return '';
        }
        const image = contenu.every((run) => run.includes('<w:drawing>'));
        const props = pPr + (image && !pPr.includes('<w:jc') ? '<w:jc w:val="center"/>' : '');
        return '<w:p>' + (props ? '<w:pPr>' + props + '</w:pPr>' : '') + contenu.join('') + '</w:p>';
    },

    /**
     * Blocs d'un conteneur : paragraphes, titres, listes, tableaux. Le
     * contenu en ligne s'accumule, un bloc ferme le paragraphe en cours.
     *
     * @param {Node} noeud - Conteneur.
     * @param {Object} etat - Voir docx().
     * @param {string} [pPr] - Propriétés du premier paragraphe.
     * @param {string} [pPrSuite] - Propriétés des suivants.
     * @param {{niveau: number, numId: number}} [liste] - Liste qui contient le nœud.
     * @returns {string} XML des blocs.
     */
    fluxDocx(noeud, etat, pPr = '', pPrSuite = pPr, liste = { niveau: 0, numId: 0 }) {
        let xml = '';
        let runs = [];
        let premier = true;
        const courant = () => (premier ? pPr : pPrSuite);
        const ajouter = (morceau) => {
            if (morceau) {
                xml += morceau;
                premier = false;
            }
        };
        const fermer = () => {
            ajouter(this.paragrapheDocx(runs, courant()));
            runs = [];
        };
        for (const enfant of noeud.childNodes) {
            const balise = enfant.nodeType === 1 ? enfant.tagName.toUpperCase() : '';
            if (!this.BLOCS_DOCX.includes(balise)) {
                /* Blancs entre deux blocs : pas de paragraphe. */
                if (balise || runs.length || (enfant.data || '').trim()) {
                    runs.push(...this.lignesDocx(enfant, etat, {}));
                }
                continue;
            }
            fermer();
            if (balise === 'P') {
                ajouter(this.paragrapheDocx(this.lignesDocx(enfant, etat, {}), courant()));
            } else if (/^H[1-6]$/.test(balise)) {
                ajouter(this.paragrapheDocx(this.lignesDocx(enfant, etat, {}),
                    '<w:pStyle w:val="Heading' + Math.min(Number(balise[1]), 3) + '"/>'));
            } else if (balise === 'UL' || balise === 'OL') {
                ajouter(this.listeDocx(enfant, etat, liste));
            } else if (balise === 'TABLE') {
                ajouter(this.tableauDocx(enfant, etat));
            } else if (balise === 'PRE') {
                ajouter(this.codeDocx(enfant));
            } else if (balise === 'BLOCKQUOTE') {
                ajouter(this.fluxDocx(enfant, etat, '<w:ind w:left="720"/>'));
            } else if (balise === 'FIGCAPTION') {
                /* Titre puis crédit : un paragraphe centré chacun. */
                for (const ligne of enfant.childNodes) {
                    ajouter(this.paragrapheDocx(this.lignesDocx(ligne, etat, {}), '<w:jc w:val="center"/>'));
                }
            } else if (balise !== 'HR') {
                ajouter(this.fluxDocx(enfant, etat, courant(), pPrSuite, liste));
            }
        }
        fermer();
        return xml;
    },

    /**
     * Liste à puces ou numérotée, avec ses sous-listes. Puces : numId 1.
     * Chaque liste numérotée a le sien, pour repartir de son début ; une
     * sous-liste numérotée garde celui de sa liste.
     *
     * @param {Element} noeud - <ul> ou <ol>.
     * @param {Object} etat - Voir docx().
     * @param {{niveau: number, numId: number}} parent - Liste qui contient celle-ci.
     * @returns {string} XML des paragraphes.
     */
    listeDocx(noeud, etat, parent) {
        /* Word ne connaît que neuf niveaux. */
        const niveau = Math.min(parent.niveau, 8);
        let numId = 1;
        if (noeud.tagName.toUpperCase() === 'OL') {
            numId = parent.numId > 1 ? parent.numId
                : etat.listes.push({ debut: Number(noeud.getAttribute('start')) || 1, niveau }) + 1;
        }
        let xml = '';
        for (const item of noeud.childNodes) {
            if (item.nodeType === 1 && item.tagName.toUpperCase() === 'LI') {
                xml += this.fluxDocx(item, etat,
                    '<w:numPr><w:ilvl w:val="' + niveau + '"/><w:numId w:val="' + numId + '"/></w:numPr>',
                    '<w:ind w:left="' + 720 * (niveau + 1) + '"/>',
                    { niveau: parent.niveau + 1, numId });
            }
        }
        return xml;
    },

    /**
     * Tableau à bordures, en-tête en gras, colonnes de même largeur.
     *
     * @param {Element} noeud - <table>.
     * @param {Object} etat - Voir docx().
     * @returns {string} XML du w:tbl, suivi d'un paragraphe vide.
     */
    tableauDocx(noeud, etat) {
        const lignes = [];
        const lire = (parent) => {
            for (const enfant of parent.childNodes) {
                if (enfant.nodeType !== 1) {
                    continue;
                }
                if (enfant.tagName.toUpperCase() === 'TR') {
                    lignes.push([...enfant.childNodes].filter((c) => c.nodeType === 1 && /^T[HD]$/i.test(c.tagName)));
                } else {
                    lire(enfant);
                }
            }
        };
        lire(noeud);
        const colonnes = Math.max(0, ...lignes.map((ligne) => ligne.length));
        if (!colonnes) {
            return '';
        }
        /* 9638 : largeur utile d'une page A4 aux marges de 2 cm, en vingtièmes de point. */
        const largeur = Math.floor(9638 / colonnes);
        const cellule = (c) => {
            const texte = c ? this.paragrapheDocx(this.lignesDocx(c, etat, { gras: c.tagName.toUpperCase() === 'TH' })) : '';
            return '<w:tc><w:tcPr><w:tcW w:w="' + largeur + '" w:type="dxa"/></w:tcPr>' + (texte || '<w:p/>') + '</w:tc>';
        };
        return '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>'
            + ('<w:gridCol w:w="' + largeur + '"/>').repeat(colonnes) + '</w:tblGrid>'
            + lignes.map((ligne) => '<w:tr>' + Array.from({ length: colonnes }, (_, i) => cellule(ligne[i])).join('') + '</w:tr>').join('')
            /* Paragraphe vide : deux tableaux qui se suivent fusionneraient. */
            + '</w:tbl><w:p/>';
    },

    /**
     * Bloc de code : un paragraphe par ligne, en chasse fixe.
     *
     * @param {Element} noeud - <pre>.
     * @returns {string} XML des paragraphes.
     */
    codeDocx(noeud) {
        /* ponytail: coloration perdue ; reprendre les classes de highlight.js si elle manque. */
        return noeud.textContent.replace(/\n$/, '').split('\n')
            .map((ligne) => '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>' + this.runDocx(ligne, { code: true }) + '</w:p>').join('');
    },

    /* 16 cm, largeur maximale d'une image, en EMU (360 000 par cm). */
    LARGEUR_IMAGE_DOCX: 5760000,

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
        /* 9525 EMU par pixel, ramené à la largeur de la page. */
        const echelle = Math.min(1, this.LARGEUR_IMAGE_DOCX / (image.largeur * 9525));
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
     * Prépare les images d'une réponse : figures en PNG, images de Commons
     * récupérées. Une image impossible à préparer est omise.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @returns {Promise<Map<Element, Object>>} { octets, extension, largeur, hauteur } par élément.
     */
    async imagesDocx(element) {
        const images = new Map();
        for (const noeud of element.querySelectorAll('.diagramme > svg, figure.image-commons img')) {
            try {
                const figure = noeud.tagName.toUpperCase() === 'SVG';
                const fichier = figure ? await this.enPng(noeud) : await fetch(noeud.src).then((r) => {
                    if (!r.ok) {
                        throw new Error(r.status);
                    }
                    return r.blob();
                });
                /* ponytail: PNG et JPEG seulement ; passer par un canevas pour les autres formats. */
                const extension = { 'image/png': 'png', 'image/jpeg': 'jpg' }[fichier.type];
                if (!extension) {
                    continue;
                }
                const cadre = figure ? noeud.viewBox.baseVal : null;
                const affiche = noeud.getBoundingClientRect();
                images.set(noeud, {
                    octets: new Uint8Array(await fichier.arrayBuffer()),
                    extension,
                    largeur: figure ? (cadre && cadre.width) || affiche.width : noeud.naturalWidth,
                    hauteur: figure ? (cadre && cadre.height) || affiche.height : noeud.naturalHeight
                });
            } catch (err) {
                /* Image omise : l'export continue. */
            }
        }
        return images;
    },

    /**
     * Corps du document Word d'une réponse affichée.
     *
     * @param {Node} element - Conteneur de la réponse.
     * @param {Object} etat - Voir docx().
     * @returns {string} XML des blocs ; un paragraphe vide si la réponse n'a rien.
     */
    corpsDocx(element, etat) {
        return this.fluxDocx(element, etat) || '<w:p/>';
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
     * @returns {string} XML de word/styles.xml. Tailles en demi-points.
     */
    stylesDocx() {
        const titre = (rang, taille) => '<w:style w:type="paragraph" w:styleId="Heading' + rang + '"><w:name w:val="heading ' + rang + '"/>'
            + '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>'
            + '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="' + (rang - 1) + '"/></w:pPr>'
            + '<w:rPr><w:b/><w:sz w:val="' + taille + '"/><w:szCs w:val="' + taille + '"/></w:rPr></w:style>';
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
    async docx(element) {
        const etat = { images: await this.imagesDocx(element), medias: [], rels: [], listes: [] };
        /* Page A4, marges de 2 cm (1134 vingtièmes de point). */
        const principal = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
            + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
            + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
            + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
            + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'
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
            { nom: 'word/styles.xml', octets: xml(this.stylesDocx()) },
            { nom: 'word/numbering.xml', octets: xml(this.numerotationDocx(etat)) },
            ...etat.medias.map((media, i) => ({ nom: 'word/media/image' + (i + 1) + '.' + media.extension, octets: media.octets }))
        ])], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }
});
