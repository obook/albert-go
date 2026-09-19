/*
 * piece-jointe.js
 * Fichier joint à une question : texte ou image.
 *
 * Un fichier texte est lu dans le navigateur. Une image est réduite puis
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
    $('piece-nom').textContent = piece.nom + (enCours ? ' : lecture en cours...' : '');
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
 * Lit un fichier et le prépare pour la prochaine question.
 *
 * @param {File} fichier - Fichier choisi, déposé ou collé.
 * @returns {Promise<void>}
 */
async function joindreFichier(fichier) {
    retirerPiece();
    const image = fichier.type.startsWith('image/');
    const texte = fichier.type.startsWith('text/') || EXTENSIONS_TEXTE.test(fichier.name);
    if (!image && !texte) {
        etat('Format non pris en charge : images et fichiers texte uniquement.', true);
        return;
    }

    const piece = { nom: fichier.name || 'image collée', texte: '' };
    afficherPiece(piece, true);
    const controle = new AbortController();
    lecturePiece = controle;
    try {
        if (image) {
            etat('Lecture de l\'image par Albert...');
            piece.texte = await Albert.transcrire(reglages.cle, await imageEnDataUrl(fichier), controle.signal);
        } else {
            if (fichier.size > TEXTE_MAX) {
                throw new Error('Fichier trop long : 200 Ko au plus.');
            }
            piece.texte = await fichier.text();
        }
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
            etat(messageEchec(err), true);
        }
    }
    $('saisie').focus();
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
    $('saisie').focus();
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
