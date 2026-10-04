/*
 * projet.js
 * Module Imprimerie (clé interne "projet") : une bibliothèque de fichiers
 * déposés une fois, communs à tous les documents ; chaque document coche
 * ceux qu'il utilise et se construit peu à peu.
 *
 * Garde la bibliothèque, les sources cochées et le nom du document affiché,
 * et tient leur volet à jour. La lecture des fichiers est dans
 * piece-jointe.js, l'envoi dans app.js, l'enregistrement et la liste des
 * documents dans historique.js.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/** Bibliothèque : texte des fichiers déposés, commun à tous les documents : { nom, texte }. */
let bibliotheque = [];
try {
    bibliotheque = JSON.parse(lire('bibliotheque', '[]'));
} catch (err) {
    /* Données illisibles : on repart de zéro. */
}
if (!Array.isArray(bibliotheque)) {
    bibliotheque = [];
}

/** Noms des fichiers de la bibliothèque cochés pour le document affiché. */
let sourcesProjet = [];

/** Fichiers cochés, envoyés avec chaque question : tenus à jour par choisirSources. */
let documentsProjet = [];

/** Nom donné au projet affiché, ou '' : son titre sert alors de nom. */
let nomProjet = '';

/** Très grand écran : la bibliothèque est une colonne à droite ; sinon un tiroir (entete.css). */
const COLONNE_SOURCES = matchMedia('(min-width: 80rem)');

/**
 * Affiche la bibliothèque en colonne, sans lui donner le focus.
 */
function montrerBibliotheque() {
    const avant = document.activeElement;
    $('bibliotheque').show();
    $('ouvrir-bibliotheque').setAttribute('aria-expanded', 'true');
    /* show() prend le focus : on le rend. */
    if (avant && avant !== document.body) {
        avant.focus();
    } else {
        document.activeElement.blur();
    }
}

/**
 * Place le volet de la bibliothèque selon le module et l'écran.
 *
 * Dans Imprimerie, sur très grand écran : colonne ouverte, sauf si elle a été repliée.
 * Ailleurs, ou sur un écran plus étroit : volet fermé, le bouton de l'en-tête l'ouvre en tiroir.
 */
function placerBibliotheque() {
    /* Premier appel avant modules.js, qui déclare outilActuel. */
    const projet = !!reglages.cle && typeof outilActuel !== 'undefined' && !!Albert.OUTILS[outilActuel].documents;
    $('ouvrir-bibliotheque').hidden = !projet;
    const volet = $('bibliotheque');
    const colonne = projet && COLONNE_SOURCES.matches && lire('bibliotheque-volet', null) !== 'replie';
    const enColonne = volet.open && !volet.matches(':modal');
    /* Déjà en place : colonne voulue et affichée, ou tiroir laissé ouvert dans Imprimerie. */
    if (colonne === enColonne && (projet || !volet.open)) {
        return;
    }
    /* La colonne glisse quand on entre dans Imprimerie ou qu'on en sort (entete.css). */
    if (volet.open) {
        volet.close();
    }
    if (colonne) {
        montrerBibliotheque();
    }
}
COLONNE_SOURCES.addEventListener('change', placerBibliotheque);

$('ouvrir-bibliotheque').addEventListener('click', () => {
    if (!COLONNE_SOURCES.matches) {
        $('bibliotheque').showModal();
        $('ouvrir-bibliotheque').setAttribute('aria-expanded', 'true');
        return;
    }
    /* Colonne : le bouton la replie ou la déplie, et s'en souvient. */
    if ($('bibliotheque').open) {
        $('bibliotheque').close();
        ecrire('bibliotheque-volet', 'replie');
    } else {
        montrerBibliotheque();
        ecrire('bibliotheque-volet', null);
    }
});

$('bibliotheque').addEventListener('close', () => {
    $('ouvrir-bibliotheque').setAttribute('aria-expanded', 'false');
});

/* Tiroir : sa flèche et un clic sur le fond le referment. */
$('bibliotheque').addEventListener('click', (e) => {
    if (e.target === $('bibliotheque') || e.target.closest('.fermer-bibliotheque')) {
        $('bibliotheque').close();
    }
});

/* Croix du bouton "Supprimer", celle de la pièce jointe. */
const ICONE_RETIRER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/**
 * Coche les sources du document affiché ; les fichiers envoyés suivent.
 *
 * @param {string[]} noms - Noms cochés ; ceux qui ont quitté la bibliothèque sont écartés.
 */
function choisirSources(noms) {
    sourcesProjet = noms.filter(nom => bibliotheque.some(d => d.nom === nom));
    documentsProjet = Albert.sourcesCochees(bibliotheque, sourcesProjet);
}

/**
 * Écrit la bibliothèque dans le stockage, selon la même règle que les conversations.
 *
 * @param {Object[]} fichiers - Bibliothèque à garder.
 * @returns {boolean} false si le stockage est plein ; bloqué, elle ne vit que le temps de la page.
 */
function ecrireBibliotheque(fichiers) {
    try {
        if (fichiers.length) {
            /* ponytail: texte gardé dans le stockage du navigateur (environ 5 millions de caractères) ; IndexedDB si le quota gêne. */
            stockage('bibliotheque').setItem('albert-go.bibliotheque', JSON.stringify(fichiers));
        } else {
            stockage('bibliotheque').removeItem('albert-go.bibliotheque');
        }
        return true;
    } catch (err) {
        return err.name !== 'QuotaExceededError';
    }
}

/**
 * Reprend dans la bibliothèque les sources que chaque document gardait avec lui.
 *
 * Appelée une fois au démarrage (app.js), après la lecture des conversations.
 */
function reprendreSources() {
    const reprise = Albert.versBibliotheque(conversations, bibliotheque);
    if (!reprise.change) {
        return;
    }
    bibliotheque = reprise.bibliotheque;
    conversations = reprise.conversations;
    try {
        /* Les conversations allégées d'abord : la bibliothèque, plus petite que la place libérée, tient ensuite. */
        ecrireConversations(conversations);
    } catch (err) {
        /* Stockage bloqué : tout reste en mémoire. */
        return;
    }
    ecrireBibliotheque(bibliotheque);
}

/**
 * Met le résumé du volet à jour : fichiers cochés, taille de la bibliothèque, part du contexte.
 */
function afficherResumeSources() {
    const part = Albert.partDocuments(documentsProjet, modeleActuel().contexte);
    $('resume-documents').textContent = t(part === null ? 'documents.resume' : 'documents.resume-part',
        { coches: documentsProjet.length, nombre: bibliotheque.length, pourcent: part });
}

/**
 * Met le volet de la bibliothèque à jour : nom du document, résumé, un fichier par ligne.
 *
 * Chaque ligne : la case qui l'ajoute au document, son nom (qui télécharge son texte), sa suppression.
 */
function afficherDocuments() {
    $('nom-projet').value = nomProjet;
    afficherResumeSources();
    $('vider-bibliotheque').hidden = !bibliotheque.length;
    $('liste-documents').replaceChildren(...bibliotheque.map((doc) => {
        const ligne = document.createElement('li');
        const coche = document.createElement('input');
        coche.type = 'checkbox';
        coche.checked = sourcesProjet.includes(doc.nom);
        coche.setAttribute('aria-label', t('documents.utiliser', { nom: doc.nom }));
        coche.addEventListener('change', () => cocherSource(doc.nom, coche));
        const nom = document.createElement('button');
        nom.type = 'button';
        nom.className = 'nom-source';
        nom.textContent = doc.nom;
        nom.title = t('documents.telecharger', { nom: Albert.nomTexte(doc.nom) });
        nom.addEventListener('click', () => {
            Rendu.telecharger(new Blob([doc.texte], { type: 'text/plain;charset=utf-8' }), Albert.nomTexte(doc.nom));
        });
        const supprimer = boutonAction(ICONE_RETIRER, t('documents.supprimer', { nom: doc.nom }));
        supprimer.addEventListener('click', () => demanderSuppressionSource(doc.nom));
        ligne.append(coche, nom, supprimer);
        return ligne;
    }));
}

/**
 * Enregistre le document affiché ; vidé avant toute question, il quitte la liste des documents.
 */
function enregistrerProjet() {
    if (documentsProjet.length || conversation.length) {
        sauverConversation();
        return;
    }
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

/**
 * Coche ou décoche un fichier pour le document affiché.
 *
 * @param {string} nom - Nom du fichier.
 * @param {HTMLInputElement} coche - Sa case ; décochée si le fichier ne tient pas dans le contexte.
 */
function cocherSource(nom, coche) {
    if (coche.checked) {
        const fichier = bibliotheque.find(d => d.nom === nom);
        if (!Albert.avecDocument(documentsProjet, fichier, modeleActuel().contexte)) {
            coche.checked = false;
            etat(t('erreur.projet-plein'), true);
            return;
        }
        choisirSources([...sourcesProjet, nom]);
    } else {
        choisirSources(sourcesProjet.filter(s => s !== nom));
    }
    /* La liste n'est pas reconstruite : la case garde le focus. */
    afficherResumeSources();
    enregistrerProjet();
}

/**
 * Ajoute à la bibliothèque un fichier lu, et le coche pour le document affiché.
 *
 * @param {{nom: string, texte: string}} piece - Fichier lu par joindreFichier.
 * @returns {boolean} false si le fichier est vide, trop gros pour le contexte, ou si le stockage est plein.
 */
function ajouterDocument(piece) {
    if (!piece.texte.trim()) {
        etat(t('erreur.document-vide'), true);
        return false;
    }
    const nouveau = { nom: piece.nom, texte: piece.texte };
    /* Coché pour ce document : il doit tenir dans le contexte avec les autres sources cochées. */
    if (!Albert.avecDocument(documentsProjet, nouveau, modeleActuel().contexte)) {
        etat(t('erreur.projet-plein'), true);
        return false;
    }
    /* Un fichier de même nom est remplacé, pour tous les documents qui le cochent. */
    const fichiers = [...bibliotheque.filter(d => d.nom !== nouveau.nom), nouveau];
    if (!ecrireBibliotheque(fichiers)) {
        etat(t('erreur.bibliotheque-pleine'), true);
        return false;
    }
    bibliotheque = fichiers;
    choisirSources([...sourcesProjet.filter(s => s !== nouveau.nom), nouveau.nom]);
    afficherDocuments();
    sauverConversation();
    return true;
}

/**
 * Supprime un fichier de la bibliothèque : il quitte tous les documents.
 *
 * @param {string} nom - Nom du fichier.
 */
function supprimerSource(nom) {
    bibliotheque = bibliotheque.filter(d => d.nom !== nom);
    ecrireBibliotheque(bibliotheque);
    choisirSources(sourcesProjet);
    const allegees = Albert.sansSource(conversations, nom);
    try {
        ecrireConversations(allegees);
    } catch (err) {
        /* Stockage bloqué : la liste en mémoire suffit. */
    }
    conversations = allegees;
    afficherDocuments();
    /* La liste est reconstruite : le focus retombe sur un bouton, pas sur la page. */
    $('deposer-documents').focus();
    enregistrerProjet();
}

/**
 * Vide la bibliothèque : chaque fichier quitte tous les documents.
 */
function viderBibliotheque() {
    const allegees = bibliotheque.reduce((liste, doc) => Albert.sansSource(liste, doc.nom), conversations);
    bibliotheque = [];
    ecrireBibliotheque(bibliotheque);
    choisirSources([]);
    try {
        ecrireConversations(allegees);
    } catch (err) {
        /* Stockage bloqué : la liste en mémoire suffit. */
    }
    conversations = allegees;
    afficherDocuments();
    $('deposer-documents').focus();
    enregistrerProjet();
}

$('vider-bibliotheque').addEventListener('click', () => {
    $('texte-confirmer-suppression').textContent = t('confirmer-suppression.bibliotheque-texte');
    $('titre-confirmer-suppression').textContent = t('confirmer-suppression.bibliotheque');
    /* Sinon Échap reprendrait la réponse précédente. */
    $('confirmer-suppression').returnValue = '';
    $('confirmer-suppression').addEventListener('close', () => {
        if ($('confirmer-suppression').returnValue === 'oui') {
            viderBibliotheque();
        }
    }, { once: true });
    $('confirmer-suppression').showModal();
});

/**
 * Demande confirmation avant de supprimer un fichier de la bibliothèque.
 *
 * @param {string} nom - Nom du fichier, affiché dans la boîte de confirmation.
 */
function demanderSuppressionSource(nom) {
    $('texte-confirmer-suppression').textContent = nom;
    $('titre-confirmer-suppression').textContent = t('confirmer-suppression.source');
    /* Sinon Échap reprendrait la réponse précédente. */
    $('confirmer-suppression').returnValue = '';
    $('confirmer-suppression').addEventListener('close', () => {
        if ($('confirmer-suppression').returnValue === 'oui') {
            supprimerSource(nom);
        }
    }, { once: true });
    $('confirmer-suppression').showModal();
}

$('deposer-documents').addEventListener('click', () => {
    $('fichier').click();
});

/* Glisser-déposer sur le volet, comme sur la saisie. */
$('bibliotheque').addEventListener('dragover', (e) => {
    e.preventDefault();
});

$('bibliotheque').addEventListener('drop', (e) => {
    e.preventDefault();
    joindreFichiers([...e.dataTransfer.files]);
});

/* Nom du projet : suivi à chaque frappe, enregistré quand le champ est quitté. */
$('nom-projet').addEventListener('input', () => {
    nomProjet = $('nom-projet').value;
});

$('nom-projet').addEventListener('change', () => {
    /* Un nom seul ne fait pas un projet : il sera gardé à la première source ou à la première question. */
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
