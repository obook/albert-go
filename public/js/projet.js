/*
 * projet.js
 * Module Documents (clé interne "projet") : des sources déposées une fois,
 * un seul document construit peu à peu.
 *
 * Garde les documents et le nom du projet affiché, et tient sa carte à jour.
 * La lecture des fichiers est dans piece-jointe.js, l'envoi dans app.js,
 * l'enregistrement et la liste des projets dans historique.js.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/** Documents du projet affiché : { nom, texte }. */
let documentsProjet = [];

/** Nom donné au projet affiché, ou '' : son titre sert alors de nom. */
let nomProjet = '';

/* Croix du bouton "Retirer", celle de la pièce jointe. */
const ICONE_RETIRER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/**
 * Met la carte Documents à jour : nom du projet, nombre, part du contexte, liste.
 */
function afficherDocuments() {
    $('nom-projet').value = nomProjet;
    const part = Albert.partDocuments(documentsProjet, modeleActuel().contexte);
    $('resume-documents').textContent = t(part === null ? 'documents.resume' : 'documents.resume-part',
        { nombre: documentsProjet.length, pourcent: part });
    $('liste-documents').replaceChildren(...documentsProjet.map((doc) => {
        const ligne = document.createElement('li');
        const nom = document.createElement('span');
        nom.textContent = doc.nom;
        const retirer = boutonAction(ICONE_RETIRER, t('documents.retirer', { nom: doc.nom }));
        retirer.addEventListener('click', () => retirerDocument(doc.nom));
        ligne.append(nom, retirer);
        return ligne;
    }));
}

/**
 * Ajoute au projet un fichier lu, s'il tient dans le contexte du modèle.
 *
 * @param {{nom: string, texte: string}} piece - Fichier lu par joindreFichier.
 * @returns {boolean} false si le fichier est vide ou le projet plein.
 */
function ajouterDocument(piece) {
    if (!piece.texte.trim()) {
        etat(t('erreur.document-vide'), true);
        return false;
    }
    const liste = Albert.avecDocument(documentsProjet, { nom: piece.nom, texte: piece.texte }, modeleActuel().contexte);
    if (!liste) {
        etat(t('erreur.projet-plein'), true);
        return false;
    }
    documentsProjet = liste;
    afficherDocuments();
    /* ponytail: documents gardés dans l'historique ; IndexedDB si le quota du navigateur gêne. */
    sauverConversation();
    return true;
}

/**
 * Retire un document du projet : il ne part plus avec les questions suivantes.
 *
 * @param {string} nom - Nom du document.
 */
function retirerDocument(nom) {
    documentsProjet = documentsProjet.filter(d => d.nom !== nom);
    afficherDocuments();
    /* La liste est reconstruite : le focus retombe sur un bouton, pas sur la page. */
    $('deposer-documents').focus();
    if (documentsProjet.length || conversation.length) {
        sauverConversation();
        return;
    }
    /* Projet vidé avant toute question : il quitte la liste des projets. */
    const restantes = conversations.filter(c => c.id !== conversationId);
    try {
        ecrireConversations(restantes);
    } catch (err) {
        /* Stockage bloqué : la liste en mémoire suffit. */
    }
    conversations = restantes;
    conversationId = null;
    retenirCourante(null);
    afficherHistorique();
}

$('deposer-documents').addEventListener('click', () => {
    $('fichier').click();
});

/* Glisser-déposer sur la carte, comme sur la saisie. */
$('documents').addEventListener('dragover', (e) => {
    e.preventDefault();
});

$('documents').addEventListener('drop', (e) => {
    e.preventDefault();
    joindreFichiers([...e.dataTransfer.files]);
});

/* Nom du projet : suivi à chaque frappe, enregistré quand le champ est quitté. */
$('nom-projet').addEventListener('input', () => {
    nomProjet = $('nom-projet').value;
});

$('nom-projet').addEventListener('change', () => {
    /* Un nom seul ne fait pas un projet : il sera gardé au premier document ou à la première question. */
    if (documentsProjet.length || conversation.length) {
        sauverConversation();
    }
});

/* "Nouveau projet" : choisirOutil rouvrirait le projet laissé, nouvelleConversation le referme. */
$('nouveau-projet').addEventListener('click', () => {
    if (outilActuel !== 'projet') {
        choisirOutil('projet');
    }
    nouvelleConversation();
    viderSaisie();
});
