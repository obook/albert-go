/*
 * piece-jointe.js
 * Fichier joint à une question : texte, document ou image.
 *
 * Un fichier texte est lu dans le navigateur, comme le texte d'un PDF
 * (pdf.js) ou d'un .docx ou .odt. Une image est réduite puis
 * transcrite par Albert (albert.js), un enregistrement audio aussi. Le texte obtenu part avec la question
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

/* Version de pdf.js dans son adresse : le service worker garde le fichier tant qu'elle ne change pas.
   Sans elle, un appareil gardait l'ancienne version moderne, illisible sur un iPad sans Safari 18.2. */
const PDFJS = '6.3.289-legacy';

/** Espaces de noms du texte : .docx puis .odt. */
const XML_DOCX = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_ODT = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';

/** Espaces de noms des objets d'un .odt et de leur adresse. */
const XML_DESSIN_ODT = 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0';
const XML_LIEN = 'http://www.w3.org/1999/xlink';

/** Taille maximale d'un document, en octets. */
const DOCUMENT_MAX = 20000000;

/** Plus grand côté d'une image envoyée, en pixels. */
const IMAGE_MAX = 1600;

/** Enregistrements reconnus quand le navigateur ne donne pas de type audio/. */
const EXTENSIONS_AUDIO = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/i;

/** Taille maximale d'un enregistrement envoyé, en octets : n8n refuse au-delà de 16 Mo. */
const AUDIO_MAX = 15000000;

/** Fréquence du WAV envoyé : celle de whisper, 16 kHz en mono (environ 8 minutes dans AUDIO_MAX). */
const TAUX_AUDIO = 16000;

/** Fichier prêt à partir : { nom, texte, url, image? }, ou null (url : fichier d'origine, image : miniature). */
let pieceJointe = null;

/** Lecture en cours (AbortController), ou null. */
let lecturePiece = null;

/** true tant qu'un lot de fichiers est lu pour un projet. */
let depotEnCours = false;

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
 * @returns {?string} "image", "audio", "texte", "document", ou null si le format est refusé.
 */
function typeFichier(fichier) {
    if (fichier.type.startsWith('image/')) {
        return 'image';
    }
    if (fichier.type.startsWith('audio/') || EXTENSIONS_AUDIO.test(fichier.name)) {
        return 'audio';
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
 * Réécrit un enregistrement en WAV 16 kHz mono : Albert ne lit que le MP3
 * et le WAV, et ce format reste léger.
 *
 * @param {File} fichier - Enregistrement dans un format lu par le navigateur.
 * @returns {Promise<Blob>} Fichier WAV.
 */
async function audioEnWav(fichier) {
    /* Le décodage passe au taux du contexte ; le rendu mélange les canaux. */
    const son = await new OfflineAudioContext(1, 1, TAUX_AUDIO).decodeAudioData(await fichier.arrayBuffer());
    const contexte = new OfflineAudioContext(1, son.length, TAUX_AUDIO);
    const source = contexte.createBufferSource();
    source.buffer = son;
    source.connect(contexte.destination);
    source.start();
    const mono = await contexte.startRendering();
    return new Blob([Albert.wav(mono.getChannelData(0), TAUX_AUDIO)], { type: 'audio/wav' });
}

/**
 * Texte d'un PDF, page par page. Un PDF scanné n'en a pas.
 *
 * @param {File} fichier - Fichier PDF.
 * @returns {Promise<string>} Texte extrait.
 */
async function lirePdf(fichier) {
    const pdfjs = await import(new URL('vendor/pdfjs/pdf.min.mjs?v=' + PDFJS, document.baseURI).href);
    pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.mjs?v=' + PDFJS;
    /* Sans eval : la CSP l'interdit. */
    const chargement = pdfjs.getDocument({ data: await fichier.arrayBuffer(), isEvalSupported: false });
    const pdf = await chargement.promise;
    let texte = '';
    for (let n = 1; n <= pdf.numPages && texte.length <= TEXTE_MAX; n++) {
        /* Pas getTextContent : il parcourt un flux par for await, que WebKit ne sait pas faire (tous les navigateurs de l'iPad). */
        const lecteur = (await pdf.getPage(n)).streamTextContent().getReader();
        for (let morceau = await lecteur.read(); !morceau.done; morceau = await lecteur.read()) {
            texte += morceau.value.items.map((bout) => bout.str + (bout.hasEOL ? '\n' : '')).join('');
        }
        texte += '\n\n';
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
 * @param {Map<Element, string>} [formules] - Texte des objets formule d'un .odt (lireDocument).
 * @returns {string} Texte du nœud.
 */
function texteXml(noeud, odt, formules = new Map()) {
    let texte = '';
    for (const enfant of noeud.childNodes) {
        if (enfant.nodeType === Node.TEXT_NODE) {
            texte += odt ? enfant.data : '';
        } else if (['pPr', 'rPr'].includes(enfant.localName)) {
            /* Propriétés du .docx : leurs w:tab sont des taquets, pas du texte. */
        } else if (formules.has(enfant)) {
            /* Formule d'un .odt : un objet à part, sans elle le texte perdrait ses maths. */
            texte += formules.get(enfant);
        } else if (enfant.localName === 'oMath') {
            /* Équation Word : ses chiffres mis bout à bout donneraient 4860 pour 48/60. */
            texte += Albert.texteOmml(enfant);
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
            texte += texteXml(enfant, odt, formules);
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
    const donnees = await fichier.arrayBuffer();
    const xml = await lireDansZip(donnees, odt ? 'content.xml' : 'word/document.xml');
    const racine = new DOMParser().parseFromString(xml, 'application/xml');
    /* Formules d'un .odt : chacune est un objet rangé dans son dossier de l'archive. */
    const formules = new Map();
    for (const objet of odt ? racine.getElementsByTagNameNS(XML_DESSIN_ODT, 'object') : []) {
        const dossier = (objet.getAttributeNS(XML_LIEN, 'href') || '').replace(/^\.\//, '');
        formules.set(objet, Albert.formuleOdt(await lireDansZip(donnees, dossier + '/content.xml').catch(() => '')));
    }
    /* Paragraphes et titres, dans l'ordre du document. */
    const paragraphes = [...racine.getElementsByTagName('*')]
        .filter((e) => e.namespaceURI === (odt ? XML_ODT : XML_DOCX) && ['p', 'h'].includes(e.localName));
    /* Les cases d'une même ligne de tableau sont séparées par une tabulation. */
    return paragraphes.map((p) => {
        const caseTableau = ['tc', 'table-cell'].includes(p.parentNode.localName);
        const suite = caseTableau && p === p.parentNode.lastElementChild && p.parentNode.nextElementSibling;
        return texteXml(p, odt, formules) + (suite ? '\t' : '\n');
    }).join('');
}

/**
 * Contenu du fichier, transcrit par le modèle s'il s'agit d'une image ou d'un son.
 *
 * @param {File} fichier - Fichier choisi, déposé ou collé.
 * @param {string} type - "image", "audio", "texte" ou "document".
 * @param {AbortSignal} signal - Pour annuler avec le fichier.
 * @param {string} [image] - Image réduite en data URL, pour une image.
 * @returns {Promise<string>} Texte à joindre à la question.
 * @throws {Error} Si le fichier est trop long, illisible ou sans texte.
 */
async function lireContenu(fichier, type, signal, image) {
    if (type === 'image') {
        etat(t('etat.lecture-image'));
        return Albert.transcrire(reglages.cle, image, signal);
    }
    if (type === 'audio') {
        if (fichier.size > AUDIO_MAX) {
            throw new Error(t('erreur.audio-long'));
        }
        /* Le MP3 part tel quel, les autres formats en WAV. */
        const mp3 = /\.mp3$/i.test(fichier.name);
        const audio = mp3 ? fichier : await audioEnWav(fichier).catch(() => {
            throw new Error(t('erreur.audio-illisible'));
        });
        if (audio.size > AUDIO_MAX) {
            throw new Error(t('erreur.audio-long'));
        }
        etat(t('etat.lecture-audio'));
        const texte = await Albert.transcrireAudio(reglages.cle, audio, mp3 ? fichier.name : 'audio.wav', signal);
        if (!texte.trim()) {
            throw new Error(t('erreur.audio-vide'));
        }
        return texte;
    }
    if (type === 'document') {
        if (fichier.size > DOCUMENT_MAX) {
            throw new Error(t('erreur.document-lourd'));
        }
        /* Une erreur de lecture passerait sinon pour une panne du relais. */
        const texte = await (/\.pdf$/i.test(fichier.name) ? lirePdf(fichier) : lireDocument(fichier))
            .catch((err) => {
                /* Erreur de lecture recopiée le temps du diagnostic iPad (ROADMAP.md) : la console y est hors de portée. */
                throw new Error(t('erreur.document-illisible') + ' (' + String(err).slice(0, 200) + ')');
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
 * @param {boolean} versBibliotheque - true : le fichier rejoint la bibliothèque, pas le message.
 * @returns {Promise<boolean>} true si le fichier est joint.
 */
async function joindreFichier(fichier, versBibliotheque) {
    retirerPiece();
    const type = typeFichier(fichier);
    if (!type) {
        etat(t('erreur.format'), true);
        return false;
    }

    const piece = { nom: fichier.name || t('piece.image-collee'), texte: '' };
    afficherPiece(piece, true);
    const controle = new AbortController();
    lecturePiece = controle;
    let lu = false;
    try {
        if (type === 'image') {
            piece.image = await imageEnDataUrl(fichier);
        }
        piece.texte = await lireContenu(fichier, type, controle.signal, piece.image);
        /* Un autre fichier a remplacé celui-ci pendant la lecture. */
        if (lecturePiece !== controle) {
            return false;
        }
        lecturePiece = null;
        if (versBibliotheque) {
            retirerPiece();
            lu = ajouterDocument(piece);
        } else {
            /* ponytail: jamais révoquée, le fichier reste en mémoire jusqu'au rechargement. */
            piece.url = URL.createObjectURL(fichier);
            afficherPiece(piece);
            lu = true;
        }
        if (lu) {
            etat('');
        }
    } catch (err) {
        if (lecturePiece !== controle) {
            return false;
        }
        retirerPiece();
        if (err.name !== 'AbortError') {
            etat(messageEchec(err).texte, true);
        }
    }
    focusSaisie();
    return lu;
}

/**
 * Joint les fichiers choisis ou déposés : tous vers la bibliothèque, sinon le premier au message.
 *
 * L'un après l'autre : une lecture en cours serait abandonnée par la suivante.
 * Arrêt au premier fichier refusé, pour que son message reste affiché.
 *
 * @param {File[]} fichiers - Fichiers choisis ou déposés.
 * @param {boolean} [versBibliotheque] - true : ils rejoignent la bibliothèque. Par défaut, dans Projet seulement.
 * @returns {Promise<void>}
 */
async function joindreFichiers(fichiers, versBibliotheque = !!Albert.OUTILS[outilActuel].documents) {
    /* Bibliothèque : un dépôt pendant un autre abandonnerait la lecture en cours et le reste du lot. */
    if (versBibliotheque && depotEnCours) {
        etat(t('etat.attendre-lecture'));
        return;
    }
    depotEnCours = versBibliotheque;
    try {
        for (const fichier of versBibliotheque ? fichiers : fichiers.slice(0, 1)) {
            if (!await joindreFichier(fichier, versBibliotheque)) {
                return;
            }
        }
    } finally {
        depotEnCours = false;
    }
}

/**
 * Fichier joint dans la bulle de question : son nom mène au fichier
 * d'origine, et une image s'y ajoute en miniature.
 *
 * @param {{nom: string, url: string, image?: string}} piece - Fichier envoyé.
 * @returns {HTMLSpanElement} Ligne du fichier joint.
 */
function lignePiece(piece) {
    const ligne = document.createElement('span');
    ligne.className = 'ligne-piece';
    const lien = document.createElement('a');
    lien.href = piece.url;
    lien.download = piece.nom;
    lien.textContent = piece.nom;
    const [avant, apres] = t('fichier.joint', { nom: '\n' }).split('\n');
    ligne.append(avant, lien, apres);
    if (piece.image) {
        /* Doublon du lien sur le nom : ignoré au clavier et par les lecteurs d'écran. */
        const miniature = lien.cloneNode(false);
        miniature.className = 'miniature';
        miniature.tabIndex = -1;
        miniature.setAttribute('aria-hidden', 'true');
        const image = document.createElement('img');
        image.src = piece.image;
        image.alt = '';
        miniature.append(image);
        ligne.append(miniature);
    }
    return ligne;
}

$('joindre').addEventListener('click', () => {
    $('fichier').click();
});

$('fichier').addEventListener('change', () => {
    const fichiers = [...$('fichier').files];
    /* Permet de choisir à nouveau le même fichier. */
    $('fichier').value = '';
    joindreFichiers(fichiers);
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
    joindreFichiers([...e.dataTransfer.files]);
});

/* Fichier lâché hors de la saisie et du volet : ignoré. Sinon Firefox tente d'ouvrir file:/// et refuse, avec une erreur de sécurité.
   Un texte glissé garde son comportement : il se dépose dans un champ. */
for (const evenement of ['dragover', 'drop']) {
    document.addEventListener(evenement, (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
        }
    });
}

/* Image collée (Ctrl+V) dans le champ de saisie. */
$('saisie').addEventListener('paste', (e) => {
    const fichiers = e.clipboardData ? [...e.clipboardData.files] : [];
    const image = fichiers.find(f => f.type.startsWith('image/'));
    if (!image) {
        return;
    }
    e.preventDefault();
    /* Projet : deux images collées portent le même nom, la seconde ne doit pas remplacer la première. */
    const voulu = image.name || t('piece.image-collee');
    const nom = Albert.OUTILS[outilActuel].documents ? Albert.nomLibre(voulu, bibliotheque.map(d => d.nom)) : voulu;
    joindreFichiers([nom === image.name ? image : new File([image], nom, { type: image.type })]);
});
