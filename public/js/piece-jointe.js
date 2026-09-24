/*
 * piece-jointe.js
 * Fichier joint à une question : texte, document ou image.
 *
 * Un fichier texte est lu dans le navigateur, comme le texte d'un PDF
 * (pdf.js) ou d'un .docx ou .odt. Une image est réduite puis
 * transcrite par Albert (albert.js). Le texte obtenu part avec la question
 * suivante (app.js). Idée reprise d'albert-atelier.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/** Taille maximale d'un fichier texte, en octets. */
const TEXTE_MAX = 200000;

/** Extensions acceptées quand le navigateur ne donne pas de type text/. */
const EXTENSIONS_TEXTE = /\.(txt|md|csv|tsv|json|xml|html|css|js|py|tex|sql)$/i;

/** Documents dont on extrait le texte. */
const EXTENSIONS_DOCUMENT = /\.(pdf|docx|odt)$/i;

/** Espaces de noms du texte : .docx puis .odt. */
const XML_DOCX = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_ODT = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';

/** Taille maximale d'un document, en octets. */
const DOCUMENT_MAX = 20000000;

/** Plus grand côté d'une image envoyée, en pixels. */
const IMAGE_MAX = 1600;

/** Fichier prêt à partir : { nom, texte }, ou null. */
let pieceJointe = null;

/** Lecture en cours (AbortController), ou null. */
let lecturePiece = null;

/**
 * Affiche le nom du fichier joint au-dessus de la saisie.
 *
 * @param {{nom: string, texte: string}} piece - Fichier joint.
 * @param {boolean} [enCours] - true pendant la lecture du fichier.
 */
function afficherPiece(piece, enCours) {
    pieceJointe = enCours ? null : piece;
    $('piece-nom').textContent = enCours ? t('piece.lecture', { nom: piece.nom }) : piece.nom;
    $('piece-jointe').hidden = false;
}

/**
 * Retire le fichier joint et abandonne sa lecture si elle est en cours.
 */
function retirerPiece() {
    if (lecturePiece) {
        lecturePiece.abort();
    }
    lecturePiece = null;
    pieceJointe = null;
    $('piece-jointe').hidden = true;
}

/**
 * Réduit une image et la convertit en JPEG, plus léger à envoyer.
 *
 * @param {Blob} fichier - Image choisie ou collée.
 * @returns {Promise<string>} Image en data URL.
 */
async function imageEnDataUrl(fichier) {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(1, IMAGE_MAX / Math.max(image.width, image.height));
    const toile = document.createElement('canvas');
    toile.width = Math.round(image.width * echelle);
    toile.height = Math.round(image.height * echelle);
    const contexte = toile.getContext('2d');
    /* Fond blanc : le JPEG n'a pas de transparence. */
    contexte.fillStyle = '#ffffff';
    contexte.fillRect(0, 0, toile.width, toile.height);
    contexte.drawImage(image, 0, 0, toile.width, toile.height);
    return toile.toDataURL('image/jpeg', 0.85);
}

/**
 * Nature du fichier joint, d'après son type MIME puis son extension.
 *
 * @param {File} fichier - Fichier choisi, déposé ou collé.
 * @returns {?string} "image", "texte", "document", ou null si le format est refusé.
 */
function typeFichier(fichier) {
    if (fichier.type.startsWith('image/')) {
        return 'image';
    }
    if (fichier.type.startsWith('text/') || EXTENSIONS_TEXTE.test(fichier.name)) {
        return 'texte';
    }
    if (EXTENSIONS_DOCUMENT.test(fichier.name)) {
        return 'document';
    }
    return null;
}

/**
 * Texte d'un PDF, page par page. Un PDF scanné n'en a pas.
 *
 * @param {File} fichier - Fichier PDF.
 * @returns {Promise<string>} Texte extrait.
 */
async function lirePdf(fichier) {
    const pdfjs = await import(new URL('vendor/pdfjs/pdf.min.mjs', document.baseURI).href);
    pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.mjs';
    /* Sans eval : la CSP l'interdit. */
    const chargement = pdfjs.getDocument({ data: await fichier.arrayBuffer(), isEvalSupported: false });
    const pdf = await chargement.promise;
    let texte = '';
    for (let n = 1; n <= pdf.numPages && texte.length <= TEXTE_MAX; n++) {
        const contenu = await (await pdf.getPage(n)).getTextContent();
        texte += contenu.items.map((bout) => bout.str + (bout.hasEOL ? '\n' : '')).join('') + '\n\n';
    }
    chargement.destroy();
    return texte;
}

/**
 * Fichier d'une archive zip, décompressé par le navigateur.
 *
 * @param {ArrayBuffer} donnees - Archive.
 * @param {string} nom - Chemin du fichier dans l'archive.
 * @returns {Promise<string>} Contenu du fichier.
 * @throws {Error} Si l'archive ou le fichier est introuvable.
 */
async function lireDansZip(donnees, nom) {
    const vue = new DataView(donnees);
    /* Fin du répertoire central, en fin d'archive. */
    let fin = donnees.byteLength - 22;
    while (fin >= 0 && vue.getUint32(fin, true) !== 0x06054b50) {
        fin--;
    }
    if (fin < 0) {
        throw new Error(t('erreur.document-illisible'));
    }
    let entree = vue.getUint32(fin + 16, true);
    for (let i = vue.getUint16(fin + 10, true); i > 0; i--) {
        const longueurNom = vue.getUint16(entree + 28, true);
        if (new TextDecoder().decode(new Uint8Array(donnees, entree + 46, longueurNom)) === nom) {
            const local = vue.getUint32(entree + 42, true);
            const debut = local + 30 + vue.getUint16(local + 26, true) + vue.getUint16(local + 28, true);
            let flux = new Blob([new Uint8Array(donnees, debut, vue.getUint32(entree + 20, true))]).stream();
            /* Méthode 8 : deflate. Méthode 0 : stocké tel quel. */
            if (vue.getUint16(entree + 10, true) === 8) {
                flux = flux.pipeThrough(new DecompressionStream('deflate-raw'));
            }
            return new Response(flux).text();
        }
        entree += 46 + longueurNom + vue.getUint16(entree + 30, true) + vue.getUint16(entree + 32, true);
    }
    throw new Error(t('erreur.document-illisible'));
}

/**
 * Texte d'un nœud XML de .docx ou .odt, avec tabulations et retours à
 * la ligne. Dans un .docx, seuls les w:t portent le texte : les codes
 * de champ et le texte supprimé en mode révision sont ignorés.
 *
 * @param {Node} noeud - Paragraphe ou partie de paragraphe.
 * @param {boolean} odt - true pour un .odt.
 * @returns {string} Texte du nœud.
 */
function texteXml(noeud, odt) {
    let texte = '';
    for (const enfant of noeud.childNodes) {
        if (enfant.nodeType === Node.TEXT_NODE) {
            texte += odt ? enfant.data : '';
        } else if (['pPr', 'rPr'].includes(enfant.localName)) {
            /* Propriétés du .docx : leurs w:tab sont des taquets, pas du texte. */
        } else if (enfant.localName === 't') {
            texte += enfant.textContent;
        } else if (enfant.localName === 'tab') {
            texte += '\t';
        } else if (['br', 'cr', 'line-break'].includes(enfant.localName)) {
            texte += '\n';
        } else if (enfant.localName === 's') {
            /* text:s c="3" : trois espaces. */
            texte += ' '.repeat(Number(enfant.getAttributeNS(XML_ODT, 'c')) || 1);
        } else {
            texte += texteXml(enfant, odt);
        }
    }
    return texte;
}

/**
 * Texte d'un .docx ou d'un .odt, un paragraphe par ligne.
 *
 * @param {File} fichier - Document Word ou OpenDocument.
 * @returns {Promise<string>} Texte extrait.
 */
async function lireDocument(fichier) {
    const odt = /\.odt$/i.test(fichier.name);
    const xml = await lireDansZip(await fichier.arrayBuffer(), odt ? 'content.xml' : 'word/document.xml');
    const racine = new DOMParser().parseFromString(xml, 'application/xml');
    /* Paragraphes et titres, dans l'ordre du document. */
    const paragraphes = [...racine.getElementsByTagName('*')]
        .filter((e) => e.namespaceURI === (odt ? XML_ODT : XML_DOCX) && ['p', 'h'].includes(e.localName));
    /* Les cases d'une même ligne de tableau sont séparées par une tabulation. */
    return paragraphes.map((p) => {
        const caseTableau = ['tc', 'table-cell'].includes(p.parentNode.localName);
        const suite = caseTableau && p === p.parentNode.lastElementChild && p.parentNode.nextElementSibling;
        return texteXml(p, odt) + (suite ? '\t' : '\n');
    }).join('');
}

/**
 * Contenu du fichier, transcrit par le modèle s'il s'agit d'une image.
 *
 * @param {File} fichier - Fichier choisi, déposé ou collé.
 * @param {string} type - "image", "texte" ou "document".
 * @param {AbortSignal} signal - Pour annuler avec le fichier.
 * @returns {Promise<string>} Texte à joindre à la question.
 * @throws {Error} Si le fichier est trop long, illisible ou sans texte.
 */
async function lireContenu(fichier, type, signal) {
    if (type === 'image') {
        etat(t('etat.lecture-image'));
        return Albert.transcrire(reglages.cle, await imageEnDataUrl(fichier), signal);
    }
    if (type === 'document') {
        if (fichier.size > DOCUMENT_MAX) {
            throw new Error(t('erreur.document-lourd'));
        }
        /* Une erreur de lecture passerait sinon pour une panne du relais. */
        const texte = await (/\.pdf$/i.test(fichier.name) ? lirePdf(fichier) : lireDocument(fichier))
            .catch(() => {
                throw new Error(t('erreur.document-illisible'));
            });
        if (!texte.trim()) {
            throw new Error(t('erreur.document-vide'));
        }
        if (texte.length > TEXTE_MAX) {
            throw new Error(t('erreur.document-long'));
        }
        return texte;
    }
    if (fichier.size > TEXTE_MAX) {
        throw new Error(t('erreur.fichier-long'));
    }
    return fichier.text();
}

/**
 * Lit un fichier et le prépare pour la prochaine question.
 *
 * @param {File} fichier - Fichier choisi, déposé ou collé.
 * @returns {Promise<void>}
 */
async function joindreFichier(fichier) {
    retirerPiece();
    const type = typeFichier(fichier);
    if (!type) {
        etat(t('erreur.format'), true);
        return;
    }

    const piece = { nom: fichier.name || t('piece.image-collee'), texte: '' };
    afficherPiece(piece, true);
    const controle = new AbortController();
    lecturePiece = controle;
    try {
        piece.texte = await lireContenu(fichier, type, controle.signal);
        /* Un autre fichier a remplacé celui-ci pendant la lecture. */
        if (lecturePiece !== controle) {
            return;
        }
        lecturePiece = null;
        afficherPiece(piece);
        etat('');
    } catch (err) {
        if (lecturePiece !== controle) {
            return;
        }
        retirerPiece();
        if (err.name !== 'AbortError') {
            etat(messageEchec(err).texte, true);
        }
    }
    focusSaisie();
}

$('joindre').addEventListener('click', () => {
    $('fichier').click();
});

$('fichier').addEventListener('change', () => {
    const fichier = $('fichier').files[0];
    /* Permet de choisir à nouveau le même fichier. */
    $('fichier').value = '';
    if (fichier) {
        joindreFichier(fichier);
    }
});

$('piece-retirer').addEventListener('click', () => {
    retirerPiece();
    etat('');
    focusSaisie();
});

/* Glisser-déposer sur la carte de saisie. */
$('form-question').addEventListener('dragover', (e) => {
    e.preventDefault();
    $('form-question').classList.add('depot');
});

$('form-question').addEventListener('dragleave', () => {
    $('form-question').classList.remove('depot');
});

$('form-question').addEventListener('drop', (e) => {
    e.preventDefault();
    $('form-question').classList.remove('depot');
    const fichier = e.dataTransfer.files[0];
    if (fichier) {
        joindreFichier(fichier);
    }
});

/* Image collée (Ctrl+V) dans le champ de saisie. */
$('saisie').addEventListener('paste', (e) => {
    const fichiers = e.clipboardData ? [...e.clipboardData.files] : [];
    const image = fichiers.find(f => f.type.startsWith('image/'));
    if (!image) {
        return;
    }
    e.preventDefault();
    joindreFichier(image);
});
