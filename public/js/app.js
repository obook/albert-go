/*
 * app.js
 * Dernier script de l'interface : envoi des questions, historique, démarrage.
 *
 * Point d'entrée : branche la saisie, envoie les questions à Albert
 * (albert.js) et affiche les réponses (affichage.js). Les dernières
 * lignes lancent l'application.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/** Annulation de la requête en cours, ou null s'il n'y en a pas. */
let annulation = null;

/**
 * Message d'erreur à afficher après un échec d'envoi.
 *
 * Réseau coupé et CORS refusé donnent la même TypeError :
 * le navigateur ne dit pas lequel.
 *
 * @param {Error} err - Erreur reçue.
 * @returns {string} Message pour l'utilisateur.
 */
function messageEchec(err) {
    if (err instanceof TypeError && !Albert.ORIGINES.includes(location.origin)) {
        return 'Le relais n8n n\'accepte pas l\'adresse ' + location.origin + '. Ouvrez Albert Go depuis '
            + Albert.ORIGINES.join(' ou ') + '.';
    }
    if (err instanceof TypeError) {
        return 'Relais n8n injoignable. Vérifiez la connexion.';
    }
    if (err.name === 'TimeoutError') {
        return 'Albert ne répond pas. Réessayez.';
    }
    return err.message;
}

/**
 * Change le bouton rond : flèche d'envoi, ou carré d'arrêt pendant une requête.
 *
 * @param {boolean} enCours - true pendant une requête.
 */
function boutonEnvoi(enCours) {
    $('envoyer').classList.toggle('en-cours', enCours);
    $('envoyer').setAttribute('aria-label', enCours ? 'Arrêter' : 'Envoyer');
}

/**
 * Remet une question de l'historique dans la saisie.
 *
 * @param {string} sens - "haut" (plus ancienne) ou "bas" (plus récente).
 * @returns {boolean} true si la saisie a changé.
 */
function rappeler(sens) {
    const champ = $('saisie');
    const nouvelle = Albert.naviguer(historique, position, sens);
    if (nouvelle === position) {
        return false;
    }
    if (position === -1) {
        brouillon = champ.value;
    }
    position = nouvelle;
    champ.value = position === -1 ? brouillon : historique[position];
    champ.setSelectionRange(champ.value.length, champ.value.length);
    return true;
}

/**
 * Ajoute une question en tête de l'historique, sans doublon.
 *
 * @param {string} question - Question envoyée.
 */
function memoriser(question) {
    historique = [question, ...historique.filter(q => q !== question)].slice(0, Albert.HISTORIQUE_MAX);
    ecrire('historique', JSON.stringify(historique));
}

/**
 * Envoie la question saisie (et le fichier joint) puis affiche la réponse.
 *
 * @returns {Promise<void>}
 */
async function envoyer() {
    const question = $('saisie').value.trim();
    const piece = pieceJointe;
    if (!question && !piece) {
        return;
    }
    if (question) {
        memoriser(question);
    }
    position = -1;
    brouillon = '';

    const outil = outilActuel;
    /* Albert n'a pas accès au web : il inventerait le contenu de la page. */
    if (outil === 'discuter' && /https?:\/\/|www\./i.test(question)) {
        toast('Albert n\'ouvre pas les liens. Pour une page web, collez son texte ou joignez-le en fichier.');
    }

    const affiche = question + (piece ? (question ? '\n' : '') + 'Fichier joint : ' + piece.nom : '');
    const demande = Albert.construireDemande(outil, Albert.joindre(question, piece), langueSource, langueCible);
    conversation.push({ role: 'user', content: demande, affiche: affiche });
    /* Pour ignorer la réponse si on change de conversation pendant l'attente. */
    const courante = conversation;
    const bulle = ajouter('user', affiche);
    $('saisie').value = '';
    retirerPiece();
    annulation = new AbortController();
    boutonEnvoi(true);
    const retirerAttente = ajouterAttente();
    etat('Albert réfléchit...');

    try {
        /* Reformuler et Traduire : la demande seule, précédée de leur consigne. */
        const texteConsigne = await consigne(outil);
        let messages = Albert.messagesAEnvoyer(conversation, reglages.memoire && outil === 'discuter');
        if (texteConsigne) {
            messages = [{ role: 'system', content: texteConsigne }, ...messages];
        }
        const reponse = await Albert.repondre(reglages.cle, {
            model: modeleActuel().id,
            temperature: reglages.temperature,
            messages: messages
        }, annulation.signal);
        retirerAttente();
        if (conversation !== courante) {
            return;
        }
        conversation.push({ role: 'assistant', content: reponse.texte });
        ajouter('assistant', reponse.texte);
        sauverConversation();
        dernierUsage = reponse.usage;
        afficherReglages();
        etat('');
    } catch (err) {
        retirerAttente();
        if (conversation !== courante) {
            return;
        }
        /* On retire la question du fil pour pouvoir la reposer. */
        conversation.pop();
        bulle.remove();
        $('saisie').value = question;
        if (piece) {
            afficherPiece(piece);
        }
        if (err.name === 'AbortError') {
            etat('Question annulée.');
        } else {
            etat(messageEchec(err), true);
        }
    } finally {
        annulation = null;
        boutonEnvoi(false);
        $('saisie').focus();
    }
}

/**
 * Vide le fil et repart d'une conversation vide.
 */
function nouvelleConversation() {
    if (typeof speechSynthesis !== 'undefined') {
        Lecture.arreter();
    }
    if (annulation) {
        annulation.abort();
    }
    retirerPiece();
    conversation = [];
    conversationId = null;
    retenirCourante(null);
    dernierUsage = null;
    afficherReglages();
    $('fil').replaceChildren();
    etat('');
    afficher();
}

/* Deux accès : le bouton "+" de l'en-tête et l'entrée du menu. */
$('nouvelle-entete').addEventListener('click', nouvelleConversation);
$('nouvelle').addEventListener('click', nouvelleConversation);

$('saisie').addEventListener('keydown', (e) => {
    const champ = $('saisie');
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        /* Pendant une requête, Entrée ne doit pas l'annuler. */
        if (!annulation) {
            $('form-question').requestSubmit();
        }
        return;
    }
    /* Flèches : seulement depuis la première ou la dernière ligne. */
    const premiereLigne = !champ.value.slice(0, champ.selectionStart).includes('\n');
    const derniereLigne = !champ.value.slice(champ.selectionEnd).includes('\n');
    let sens = null;
    if (e.key === 'ArrowUp' && premiereLigne) {
        sens = 'haut';
    } else if (e.key === 'ArrowDown' && derniereLigne && position >= 0) {
        sens = 'bas';
    }
    if (!sens || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
    }
    if (rappeler(sens)) {
        e.preventDefault();
    }
});

/* Boutons pour écran tactile, à la place des flèches (saisie.css). */
$('question-precedente').addEventListener('click', () => {
    rappeler('haut');
    $('saisie').focus();
});

$('question-suivante').addEventListener('click', () => {
    rappeler('bas');
    $('saisie').focus();
});

$('form-question').addEventListener('submit', (e) => {
    e.preventDefault();
    if (annulation) {
        annulation.abort();
        return;
    }
    if (lecturePiece) {
        etat('Attendez la fin de la lecture du fichier.');
        return;
    }
    envoyer();
});

/* Démarrage. */
afficherReglages();
afficherTheme();
afficherOutil();
afficher();
if (reglages.cle) {
    rouvrirCourante();
}
chargerModeles();
