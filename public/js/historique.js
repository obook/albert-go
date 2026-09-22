/*
 * historique.js
 * Conversations passées : enregistrement et réouverture depuis le menu.
 *
 * Chaque conversation est enregistrée après chaque réponse d'Albert
 * (app.js), questions et réponses comprises. Un clic dans le menu la
 * rouvre et permet de la poursuivre. Les flèches de la saisie rappellent,
 * elles, les questions seules (variable historique, stockage.js).
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/** Conversations enregistrées, la plus récente en premier. */
let conversations = [];
try {
    conversations = JSON.parse(lire('conversations', '[]'));
} catch (err) {
    /* Données illisibles : on repart de zéro. */
}
if (!Array.isArray(conversations)) {
    conversations = [];
}

/** Identifiant de la conversation affichée, ou null si elle n'est pas encore enregistrée. */
let conversationId = null;

/* Propre à l'onglet (sessionStorage) : retrouver la conversation après un rechargement. */
const CLE_COURANTE = 'albert-go.conversation-courante';

/**
 * Retient l'identifiant de la conversation affichée dans cet onglet.
 *
 * @param {?string} id - Identifiant, ou null quand on repart d'une conversation vide.
 */
function retenirCourante(id) {
    try {
        if (id === null) {
            sessionStorage.removeItem(CLE_COURANTE);
        } else {
            sessionStorage.setItem(CLE_COURANTE, id);
        }
    } catch (err) {
        /* Stockage bloqué : la conversation ne sera pas réaffichée. */
    }
}

/**
 * Réaffiche la conversation de cet onglet après un rechargement.
 */
function rouvrirCourante() {
    let id = null;
    try {
        id = sessionStorage.getItem(CLE_COURANTE);
    } catch (err) {
        return;
    }
    const entree = conversations.find(c => c.id === id);
    if (entree) {
        rouvrirConversation(entree);
    }
}

/**
 * Écrit une liste de conversations dans le stockage.
 *
 * Stockage plein (environ 5 millions de caractères, mesuré dans Chrome
 * et Firefox) : les plus anciennes sont retirées une à une, la première
 * (la conversation en cours) est toujours gardée.
 *
 * @param {Object[]} liste - Conversations, la plus récente en premier.
 * @returns {?Object[]} Liste réellement écrite, ou null si la première seule ne tient pas.
 * @throws {Error} Si le stockage est bloqué (navigation privée).
 */
function ecrireConversations(liste) {
    const aEcrire = liste.slice();
    while (aEcrire.length > 0) {
        try {
            stockage('conversations').setItem('albert-go.conversations', JSON.stringify(aEcrire));
            return aEcrire;
        } catch (err) {
            if (err.name !== 'QuotaExceededError') {
                throw err;
            }
            if (aEcrire.length === 1) {
                return null;
            }
            aEcrire.pop();
        }
    }
    return null;
}

/**
 * Enregistre la conversation en cours en tête de la liste.
 *
 * Au-delà de Albert.CONVERSATIONS_MAX, les plus anciennes sont supprimées.
 * Si le stockage est plein, un toast dit ce qui a été supprimé ou perdu.
 */
function sauverConversation() {
    const entree = Albert.entreeConversation(conversationId || Date.now().toString(36), outilActuel, conversation);
    if (!entree) {
        return;
    }
    conversationId = entree.id;
    const autres = conversations.filter(c => c.id !== conversationId);
    const voulue = [entree, ...autres].slice(0, Albert.CONVERSATIONS_MAX);
    if (enregistrerListe(voulue)) {
        retenirCourante(conversationId);
    }
}

/**
 * Écrit la liste des conversations, en disant ce que le stockage a refusé.
 *
 * @param {Array<Object>} voulue - Liste à enregistrer.
 * @returns {boolean} true si le stockage a pris la liste.
 */
function enregistrerListe(voulue) {
    let ecrite;
    try {
        ecrite = ecrireConversations(voulue);
    } catch (err) {
        /* Stockage bloqué : l'historique ne vit que le temps de la page. */
        conversations = voulue;
        return false;
    }
    if (ecrite === null) {
        /* Rien n'a changé dans le stockage : on garde l'ancienne liste. */
        toast(t('toast.conversation-longue'));
        return false;
    }
    const supprimees = voulue.length - ecrite.length;
    if (supprimees > 0) {
        toast(t('toast.memoire-pleine', { nombre: supprimees }));
    }
    conversations = ecrite;
    return true;
}

/**
 * Rouvre une conversation enregistrée pour la relire ou la poursuivre.
 *
 * @param {Object} entree - Conversation enregistrée { id, titre, date, messages }.
 */
function rouvrirConversation(entree) {
    nouvelleConversation();
    /* Les conversations enregistrées avant les outils n'ont pas de champ outil. */
    outilActuel = entree.outil || 'discuter';
    ecrire('outil', outilActuel);
    afficherOutil();
    conversation = entree.messages.slice();
    conversationId = entree.id;
    retenirCourante(conversationId);
    if (outilActuel === 'rediger') {
        rouvrirRedaction(conversation);
        return;
    }
    for (const message of conversation) {
        /* Traduction enregistrée avant qu'on garde la langue : on prend la langue cible actuelle. */
        let langue = message.langue;
        if (!langue && outilActuel === 'traduire') {
            langue = langueCible;
        }
        ajouter(message.role, message.affiche || message.content, langue, false, message.recherches);
    }
}

/**
 * Supprime une conversation, après confirmation.
 *
 * La conversation affichée reste à l'écran ; seul son enregistrement part.
 *
 * @param {Object} entree - Conversation enregistrée.
 * @param {string} libelle - Titre affiché dans la boîte de confirmation.
 */
function demanderSuppression(entree, libelle) {
    $('texte-confirmer-suppression').textContent = libelle;
    /* Sinon Échap reprendrait la réponse précédente. */
    $('confirmer-suppression').returnValue = '';
    $('confirmer-suppression').addEventListener('close', () => {
        if ($('confirmer-suppression').returnValue !== 'oui') {
            return;
        }
        const restantes = conversations.filter(c => c.id !== entree.id);
        try {
            ecrireConversations(restantes);
        } catch (err) {
            /* Stockage bloqué : la liste en mémoire suffit. */
        }
        conversations = restantes;
        if (conversationId === entree.id) {
            conversationId = null;
            retenirCourante(null);
        }
        afficherHistorique();
        toast(t('toast.conversation-supprimee'));
    }, { once: true });
    $('confirmer-suppression').showModal();
}

/** Durée d'un appui long, en millisecondes. */
const APPUI_LONG = 600;

/** Glissement au-delà duquel l'appui devient un défilement de la liste. */
const TOLERANCE_APPUI = 10;

/** Vrai entre le déclenchement d'un appui long et le clic qu'il provoque. */
let appuiLongDeclenche = false;

/*
Enregistré avant celui de menu.js (ordre des scripts d'index.html) : il le
court-circuite, sinon le clic qui suit un appui long fermerait le volet et
rouvrirait la conversation.
*/
/* Sauté sous Node, où le fichier n'est chargé que pour ses tests. */
if (typeof document !== 'undefined') {
    $('menu').addEventListener('click', (e) => {
        if (appuiLongDeclenche) {
            appuiLongDeclenche = false;
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);
}

/**
 * Arme l'appui long et le clic droit sur un élément.
 *
 * @param {HTMLElement} element - Élément qui reçoit le geste.
 * @param {Function} action - Appelée au bout du délai, ou au clic droit.
 */
function armerAppuiLong(element, action) {
    let minuteur = null;
    let depart = null;
    const arreter = () => {
        clearTimeout(minuteur);
        minuteur = null;
    };
    element.addEventListener('pointerdown', (e) => {
        appuiLongDeclenche = false;
        depart = { x: e.clientX, y: e.clientY };
        minuteur = setTimeout(() => {
            appuiLongDeclenche = true;
            action();
        }, APPUI_LONG);
    });
    element.addEventListener('pointermove', (e) => {
        if (!depart) {
            return;
        }
        const ecart = Math.hypot(e.clientX - depart.x, e.clientY - depart.y);
        if (ecart > TOLERANCE_APPUI) {
            arreter();
        }
    });
    for (const nom of ['pointerup', 'pointercancel', 'pointerleave']) {
        element.addEventListener(nom, arreter);
    }
    /* Clic droit sur ordinateur ; sur téléphone, empêche le menu du système. */
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (!appuiLongDeclenche) {
            action();
        }
    });
}

/**
 * Remplit la liste des conversations dans le menu.
 */
function afficherHistorique() {
    $('liste-historique').replaceChildren(...conversations.map(ligneHistorique));
    $('historique-vide').hidden = conversations.length > 0;
}

/**
 * Ligne de la liste : le titre qui rouvre, et le bouton qui supprime.
 *
 * @param {Object} entree - Conversation enregistrée.
 * @returns {HTMLLIElement} La ligne.
 */
function ligneHistorique(entree) {
    const libelle = Albert.libelleConversation(entree);
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'titre-conversation';
    bouton.textContent = libelle;
    bouton.title = libelle + '\n' + I18n.dateHeure(entree.date);
    bouton.addEventListener('click', () => {
        rouvrirConversation(entree);
    });
    /* Appui long ou clic droit : même menu que le bouton de suppression. */
    armerAppuiLong(bouton, () => {
        demanderSuppression(entree, libelle);
    });
    const supprimer = document.createElement('button');
    supprimer.type = 'button';
    supprimer.className = 'supprimer-conversation';
    supprimer.innerHTML = ICONES.points;
    supprimer.setAttribute('aria-label', t('historique.supprimer-aria', { titre: libelle }));
    supprimer.title = t('historique.supprimer');
    supprimer.addEventListener('click', () => {
        demanderSuppression(entree, libelle);
    });
    const li = document.createElement('li');
    li.append(bouton, supprimer);
    return li;
}

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = { ecrireConversations: ecrireConversations };
}
