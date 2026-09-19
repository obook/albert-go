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
} catch (e) {
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
    } catch (e) {
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
    } catch (e) {
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
        } catch (e) {
            if (e.name !== 'QuotaExceededError') {
                throw e;
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
    const premiere = conversation.find(m => m.role === 'user');
    if (!premiere) {
        return;
    }
    if (!conversationId) {
        conversationId = Date.now().toString(36);
    }
    const entree = {
        id: conversationId,
        outil: outilActuel,
        titre: premiere.affiche || premiere.content,
        date: Date.now(),
        /* Copie : la conversation en cours continue de changer. */
        messages: conversation.slice()
    };
    const autres = conversations.filter(c => c.id !== conversationId);
    const voulue = [entree, ...autres].slice(0, Albert.CONVERSATIONS_MAX);
    let ecrite;
    try {
        ecrite = ecrireConversations(voulue);
    } catch (e) {
        /* Stockage bloqué : l'historique ne vit que le temps de la page. */
        conversations = voulue;
        return;
    }
    if (ecrite === null) {
        /* Rien n'a changé dans le stockage : on garde l'ancienne liste. */
        toast('Conversation trop longue pour être enregistrée. Elle reste affichée jusqu\'à la fermeture de l\'onglet.');
        return;
    }
    const supprimees = voulue.length - ecrite.length;
    if (supprimees > 0) {
        toast('Mémoire du navigateur pleine : ' + supprimees + ' ancienne(s) conversation(s) supprimée(s).');
    }
    conversations = ecrite;
    retenirCourante(conversationId);
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
    for (const message of conversation) {
        /* Traduction enregistrée avant qu'on garde la langue : on prend la langue cible actuelle. */
        let langue = message.langue;
        if (!langue && outilActuel === 'traduire') {
            langue = Albert.CODES_LANGUES[langueCible];
        }
        ajouter(message.role, message.affiche || message.content, langue);
    }
}

/**
 * Remplit la liste des conversations dans le menu.
 */
function afficherHistorique() {
    const format = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const elements = conversations.map(entree => {
        const li = document.createElement('li');
        const bouton = document.createElement('button');
        bouton.type = 'button';
        /* L'outil devant le titre, sauf pour Discuter. */
        let libelle = entree.titre;
        if (entree.outil && entree.outil !== 'discuter') {
            libelle = Albert.OUTILS[entree.outil].nom + ' : ' + entree.titre;
        }
        bouton.textContent = libelle;
        bouton.title = libelle + '\n' + format.format(entree.date);
        bouton.addEventListener('click', () => {
            rouvrirConversation(entree);
        });
        li.append(bouton);
        return li;
    });
    $('liste-historique').replaceChildren(...elements);
    $('historique-vide').hidden = conversations.length > 0;
}
