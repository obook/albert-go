/*
 * rendu/export.js
 * Réponse affichée enregistrée en fichier : parcours commun au .docx et au .odt.
 *
 * Le parcours décrit la réponse bloc par bloc et confie chaque morceau de
 * XML à une "écriture" (etat.e), celle de docx.js ou celle de odt.js. Le zip
 * et la préparation des images sont ici aussi.
 *
 * Complète l'objet Rendu de rendu.js, chargé avant.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : GPL-3.0-or-later
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

    /* Éléments qui ferment le paragraphe en cours. */
    BLOCS_EXPORT: ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'PRE', 'DIV', 'FIGURE', 'FIGCAPTION', 'HR'],

    /**
     * Texte sûr dans du XML. Un seul caractère interdit en XML 1.0 rend le
     * fichier illisible dans Word : ils sont retirés.
     *
     * @param {string} texte - Texte du modèle.
     * @returns {string} Texte échappé.
     */
    echapperXml(texte) {
        return String(texte).replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
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

    /* Opérateurs invisibles de MathML (application de fonction, produit implicite) : rien à écrire. */
    INVISIBLES_MATHML: new RegExp('[' + String.fromCharCode(0x2061) + '-' + String.fromCharCode(0x2064) + ']', 'g'),

    /* Flèches d'un tableau de variations : LibreOffice prend les flèches obliques dans une police d'émojis, pas celles des Dingbats. */
    FLECHES_MATHML: new RegExp('[' + String.fromCharCode(0x2197, 0x2198) + ']', 'g'),
    FLECHES_EXPORT: { [String.fromCharCode(0x2197)]: String.fromCharCode(0x279A), [String.fromCharCode(0x2198)]: String.fromCharCode(0x2798) },

    flechesTexte(texte) {
        return texte.replace(this.FLECHES_MATHML, (fleche) => this.FLECHES_EXPORT[fleche]);
    },

    /* Ensembles de nombres : lettre ajourée d'Unicode pour une lettre "double-struck" de KaTeX. */
    ENSEMBLES_MATHML: { C: 0x2102, D: 0x1D53B, N: 0x2115, Q: 0x211A, R: 0x211D, Z: 0x2124 },

    /* Éléments MathML dont le premier enfant est la base d'un indice ou d'un exposant. */
    INDICES_MATHML: ['msub', 'msup', 'msubsup'],

    /**
     * Contenu en ligne d'un nœud : texte, gras, liens, formules, images.
     *
     * @param {Node} noeud - Nœud de la réponse affichée.
     * @param {Object} etat - État de l'export, avec son écriture etat.e.
     * @param {Object} style - Mise en forme héritée : { gras, italique, barre, code, lien, position }.
     * @returns {string[]} Morceaux XML, dans l'ordre.
     */
    lignesExport(noeud, etat, style) {
        const e = etat.e;
        if (noeud.nodeType === 3) {
            /* Seuls les blancs que HTML replie : une espace insécable le reste. */
            const texte = style.code ? noeud.data : noeud.data.replace(/[ \t\n\r\f]+/g, ' ');
            return texte ? [e.texte(texte, style, etat)] : [];
        }
        if (noeud.nodeType !== 1) {
            return [];
        }
        const balise = noeud.tagName.toUpperCase();
        const enfants = (s) => [...noeud.childNodes].flatMap((enfant) => this.lignesExport(enfant, etat, s));
        if (balise === 'BUTTON' || this.aClasse(noeud, 'boutons-figure') || this.aClasse(noeud, 'image-absente')) {
            return [];
        }
        if (balise === 'BR') {
            return [e.saut];
        }
        if (balise === 'SVG' || balise === 'IMG') {
            return e.image(noeud, etat);
        }
        if (this.aClasse(noeud, 'katex')) {
            /* KaTeX glisse le MathML de la formule dans la page : il devient une formule du document. */
            const maths = this.descendant(noeud, 'MATH');
            const formule = maths ? e.formule(maths, etat) : '';
            if (formule) {
                return [formule];
            }
            /* ponytail: sans MathML, la source LaTeX telle quelle ; rien d'autre n'est disponible. */
            const tex = this.descendant(noeud, 'ANNOTATION');
            return tex ? [e.texte(tex.textContent, style, etat)] : enfants(style);
        }
        if (this.aClasse(noeud, 'katex-display') || this.aClasse(noeud, 'formule-longue')) {
            /* Formule centrée : elle prendra son propre paragraphe (paragrapheExport). */
            const contenu = enfants(style);
            return contenu.length && contenu.every((morceau) => e.estFormule(morceau))
                ? contenu.map((morceau) => e.centrer(morceau))
                : [e.saut, ...contenu, e.saut];
        }
        if (balise === 'A') {
            const adresse = noeud.getAttribute('href') || '';
            if (style.lien || !/^(https?:|mailto:)/i.test(adresse)) {
                return enfants(style);
            }
            /* Adresse normalisée : une adresse mal formée rend le fichier illisible dans Word. */
            let cible;
            try {
                cible = new URL(adresse).href;
            } catch (err) {
                return enfants(style);
            }
            const interieur = enfants({ ...style, lien: true });
            return interieur.length ? [e.lien(cible, interieur, etat)] : [];
        }
        if (balise === 'Q') {
            return [e.texte('"', style, etat), ...enfants(style), e.texte('"', style, etat)];
        }
        const ajout = {
            STRONG: { gras: true }, B: { gras: true }, EM: { italique: true }, I: { italique: true },
            DEL: { barre: true }, S: { barre: true }, CODE: { code: true },
            /* Sans eux, 10 puissance 3 sortirait 103. */
            SUP: { position: 'superscript' }, SUB: { position: 'subscript' }
        }[balise];
        return enfants(ajout ? { ...style, ...ajout } : style);
    },

    /**
     * Paragraphes d'une suite de morceaux. Une formule centrée coupe le
     * paragraphe et prend le sien.
     *
     * @param {string[]} runs - Morceaux de lignesExport.
     * @param {Object} etat - État de l'export.
     * @param {string} [genre] - Genre du premier paragraphe, propre à l'écriture.
     * @param {string} [genreSuite] - Genre des suivants.
     * @returns {string} XML des paragraphes, ou '' si tout est vide.
     */
    paragrapheExport(runs, etat, genre = '', genreSuite = genre) {
        const morceaux = [[]];
        for (const run of runs) {
            if (etat.e.estCentree(run)) {
                morceaux.push([run], []);
            } else {
                morceaux.at(-1).push(run);
            }
        }
        let xml = '';
        for (const morceau of morceaux) {
            xml += etat.e.paragraphe(morceau, xml ? genreSuite : genre);
        }
        return xml;
    },

    /**
     * Blocs d'un conteneur : paragraphes, titres, listes, tableaux. Le
     * contenu en ligne s'accumule, un bloc ferme le paragraphe en cours.
     *
     * @param {Node} noeud - Conteneur.
     * @param {Object} etat - État de l'export.
     * @param {string} [genre] - Genre du premier paragraphe.
     * @param {string} [genreSuite] - Genre des suivants.
     * @param {{niveau: number, numId: number}} [liste] - Liste qui contient le nœud.
     * @returns {string} XML des blocs.
     */
    fluxExport(noeud, etat, genre = '', genreSuite = genre, liste = { niveau: 0, numId: 0 }) {
        const e = etat.e;
        let xml = '';
        let runs = [];
        let premier = true;
        const courant = () => (premier ? genre : genreSuite);
        const ajouter = (morceau) => {
            if (morceau) {
                xml += morceau;
                premier = false;
            }
        };
        const fermer = () => {
            ajouter(this.paragrapheExport(runs, etat, courant(), genreSuite));
            runs = [];
        };
        for (const enfant of noeud.childNodes) {
            const balise = enfant.nodeType === 1 ? enfant.tagName.toUpperCase() : '';
            if (!this.BLOCS_EXPORT.includes(balise)) {
                /* Blancs entre deux blocs : pas de paragraphe. */
                if (balise || runs.length || (enfant.data || '').trim()) {
                    runs.push(...this.lignesExport(enfant, etat, {}));
                }
                continue;
            }
            fermer();
            if (balise === 'P') {
                /* Hors d'une liste : un .odt n'accepte pas de tableau dans un élément de liste. */
                ajouter((liste.niveau === 0 && this.tableauRegleExport(enfant, etat))
                    || this.paragrapheExport(this.lignesExport(enfant, etat, {}), etat, courant(), genreSuite));
            } else if (/^H[1-6]$/.test(balise)) {
                ajouter(this.paragrapheExport(this.lignesExport(enfant, etat, {}), etat, e.genreTitre(Math.min(Number(balise[1]), 3))));
            } else if (balise === 'UL' || balise === 'OL') {
                ajouter(this.listeExport(enfant, etat, liste));
            } else if (balise === 'TABLE') {
                ajouter(this.tableauExport(enfant, etat));
            } else if (balise === 'PRE') {
                /* ponytail: coloration perdue ; reprendre les classes de highlight.js si elle manque. */
                ajouter(e.code(enfant.textContent.replace(/\n$/, '').split('\n'), etat));
            } else if (balise === 'BLOCKQUOTE') {
                ajouter(this.fluxExport(enfant, etat, e.genreRetrait));
            } else if (balise === 'FIGCAPTION') {
                /* Titre puis crédit : un paragraphe centré chacun. */
                for (const ligne of enfant.childNodes) {
                    ajouter(this.paragrapheExport(this.lignesExport(ligne, etat, {}), etat, e.genreCentre));
                }
            } else if (balise !== 'HR') {
                ajouter(this.fluxExport(enfant, etat, courant(), genreSuite, liste));
            }
        }
        fermer();
        return xml;
    },

    /**
     * Liste à puces ou numérotée, avec ses sous-listes.
     *
     * @param {Element} noeud - <ul> ou <ol>.
     * @param {Object} etat - État de l'export.
     * @param {{niveau: number, numId: number}} parent - Liste qui contient celle-ci.
     * @returns {string} XML de la liste.
     */
    listeExport(noeud, etat, parent) {
        /* start vient du modèle : un entier raisonnable, sinon 1. */
        const lu = parseInt(noeud.getAttribute('start'), 10);
        const liste = etat.e.liste(etat, {
            ordonnee: noeud.tagName.toUpperCase() === 'OL',
            debut: lu >= 0 && lu <= 9999 ? lu : 1,
            /* Word ne connaît que neuf niveaux. */
            niveau: Math.min(parent.niveau, 8),
            parent
        });
        const elements = [];
        for (const item of noeud.childNodes) {
            if (item.nodeType === 1 && item.tagName.toUpperCase() === 'LI') {
                elements.push(this.fluxExport(item, etat, liste.genre, liste.genreSuite, { niveau: parent.niveau + 1, numId: liste.numId }));
            }
        }
        return etat.e.finListe(elements, liste);
    },

    /**
     * Tableau à filets écrit en LaTeX (array avec \hline ou barres, comme un
     * tableau de variations), seul dans son paragraphe : un vrai tableau. En
     * formule, il perdrait ses filets.
     *
     * @param {Element} paragraphe - <p> de la réponse.
     * @param {Object} etat - État de l'export.
     * @returns {string} XML du tableau, ou '' si le paragraphe n'en est pas un.
     */
    tableauRegleExport(paragraphe, etat) {
        const seul = (parent) => {
            const contenu = [...parent.childNodes].filter((enfant) => enfant.nodeType === 1 || (enfant.data || '').trim());
            return contenu.length === 1 && contenu[0].nodeType === 1 ? contenu[0] : null;
        };
        /* Le rendu automatique de KaTeX enveloppe la formule d'un <span> nu. */
        let formule = seul(paragraphe);
        if (formule && !this.aClasse(formule, 'katex-display')) {
            formule = seul(formule);
        }
        const table = formule && this.aClasse(formule, 'katex-display') && this.descendant(formule, 'MTABLE');
        const tex = table && this.descendant(formule, 'ANNOTATION');
        /* Les barres doubles ne sont que dans la source : \begin{array}{c|ccc||ccc}. */
        const colonnes = tex && /\\begin\{array\}\{([^}]*)\}/.exec(tex.textContent);
        const sous = table ? (table.getAttribute('rowlines') || '').split(' ') : [];
        if (!colonnes || !(colonnes[1].includes('|') || sous.includes('solid'))) {
            return '';
        }
        const droites = [...colonnes[1].matchAll(/[a-z](\|*)/g)].map((trouve) => trouve[1].length);
        const elements = (parent) => [...parent.childNodes].filter((enfant) => enfant.nodeType === 1);
        const rangees = elements(table).map(elements);
        /* Largeur d'une colonne selon son texte le plus long : à largeurs égales, une valeur comme 2(1 - sqrt(2)) est coupée. */
        const poids = droites.map((_, j) => Math.max(3, ...rangees.map((ligne) => (ligne[j] ? ligne[j].textContent.replace(this.INVISIBLES_MATHML, '').length : 0))));
        return etat.e.tableauRegle(rangees.map((ligne, i) => ligne.map((cellule, j) => {
            const contenu = etat.e.formule(cellule, etat);
            return { xml: contenu ? etat.e.paragraphe([contenu], etat.e.genreCentre) : '', bas: sous[i] === 'solid', droite: droites[j] || 0 };
        })), etat, poids);
    },

    /**
     * Tableau : chaque ligne complétée au nombre de colonnes de la plus longue.
     *
     * @param {Element} noeud - <table>.
     * @param {Object} etat - État de l'export.
     * @returns {string} XML du tableau, ou '' s'il n'a aucune case.
     */
    tableauExport(noeud, etat) {
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
        /* Case absente : chaîne vide, que l'écriture remplace par un paragraphe vide. */
        const cases = lignes.map((ligne) => Array.from({ length: colonnes }, (_, i) => (ligne[i]
            ? this.paragrapheExport(this.lignesExport(ligne[i], etat, { gras: !etat.sansGras && ligne[i].tagName.toUpperCase() === 'TH' }), etat) : '')));
        return etat.e.tableau(cases, colonnes, etat);
    },

    /**
     * Corps du document d'une réponse affichée.
     *
     * @param {Node} element - Conteneur de la réponse.
     * @param {Object} etat - État de l'export.
     * @returns {string} XML des blocs ; un paragraphe vide si la réponse n'a rien.
     */
    corpsExport(element, etat) {
        return this.fluxExport(element, etat) || etat.e.vide;
    },

    /**
     * Prépare les images d'une réponse : figures en PNG, images de Commons
     * récupérées. Une image impossible à préparer est omise.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @returns {Promise<Map<Element, Object>>} { octets, extension, largeur, hauteur } par élément.
     */
    async imagesExport(element) {
        const images = new Map();
        for (const noeud of element.querySelectorAll('.diagramme > svg, figure.image-commons img')) {
            try {
                const figure = noeud.tagName.toUpperCase() === 'SVG';
                /* La CSP n'ouvre fetch que vers upload.wikimedia.org, qui sert les mêmes miniatures que thumb. */
                const adresse = figure ? '' : noeud.src.replace(/^https:\/\/thumb\.wikimedia\.org\//, 'https://upload.wikimedia.org/');
                const fichier = figure ? await this.enPng(noeud) : await fetch(adresse).then((r) => {
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
    }
});
