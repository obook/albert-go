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
 * Message affiché quand le relais refuse l'origine de la page.
 *
 * @returns {{texte: string, lien: string}} Message, et adresse du lien final.
 */
function messageOrigine() {
    return {
        texte: t('erreur.origine', { origine: location.origin }),
        lien: Albert.URL_PUBLIQUE
    };
}

/**
 * Message d'erreur à afficher après un échec d'envoi.
 *
 * Réseau coupé et CORS refusé donnent la même TypeError :
 * le navigateur ne dit pas lequel.
 *
 * Le lien remplace l'adresse publique écrite en entier, trop longue pour
 * l'écran d'un téléphone.
 *
 * @param {Error} err - Erreur reçue.
 * @returns {{texte: string, lien: ?string}} Message, et adresse du lien final.
 */
function messageEchec(err) {
    if (err instanceof TypeError && !Albert.ORIGINES.includes(location.origin)) {
        return messageOrigine();
    }
    if (err instanceof TypeError) {
        return { texte: t('erreur.relais'), lien: null };
    }
    if (err.name === 'TimeoutError') {
        return { texte: t('erreur.timeout'), lien: null };
    }
    return { texte: err.message, lien: null };
}

/**
 * Change le bouton rond : flèche d'envoi, ou carré d'arrêt pendant une requête.
 *
 * @param {boolean} enCours - true pendant une requête.
 */
function boutonEnvoi(enCours) {
    $('envoyer').classList.toggle('en-cours', enCours);
    interroger(enCours);
    $('envoyer').setAttribute('aria-label', t(enCours ? 'saisie.arreter' : 'saisie.envoyer'));
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
 * Demande la réponse à Albert pour l'outil actif.
 *
 * @param {string} outil - Clé de Albert.OUTILS.
 * @returns {Promise<Object>} Réponse de Albert.repondre.
 */
async function demanderReponse(outil) {
    /* Chaque outil a sa consigne système ; seul Discuter envoie aussi la conversation. */
    const texteConsigne = await consigne(outil);
    let messages = Albert.messagesAEnvoyer(conversation, reglages.memoire && outil === 'discuter');
    if (texteConsigne) {
        messages = [{ role: 'system', content: texteConsigne }, ...messages];
    }
    /* Seul Discuter propose l'outil de recherche : les autres outils rendent un texte. */
    const envoi = outil === 'discuter' ? repondreAvecRecherche : Albert.repondre.bind(Albert);
    return envoi(reglages.cle, {
        model: modeleActuel().id,
        temperature: reglages.temperature,
        messages: messages
    }, annulation.signal);
}

/**
 * Ajoute la réponse reçue au fil et l'enregistre.
 *
 * @param {Object} reponse - Réponse de Albert.repondre.
 * @param {string} outil - Clé de Albert.OUTILS.
 */
function recevoirReponse(reponse, outil) {
    /* Réponse de Traduire : dans la langue cible, gardée pour la lecture à voix haute. */
    const langue = outil === 'traduire' ? langueCible : I18n.langue;
    conversation.push({ role: 'assistant', content: reponse.texte, langue: langue, recherches: reponse.recherches });
    ajouter('assistant', reponse.texte, langue, true, reponse.recherches);
    sauverConversation();
    dernierUsage = reponse.usage;
    afficherReglages();
    etat('');
}

/**
 * Remet la question dans le champ après un échec, pour la reposer.
 *
 * @param {Error} err - Erreur rencontrée.
 * @param {string} question - Texte saisi.
 * @param {?Object} piece - Fichier joint, ou null.
 * @param {HTMLElement} bulle - Bulle de la question dans le fil.
 */
function reposerQuestion(err, question, piece, bulle) {
    conversation.pop();
    bulle.remove();
    $('saisie').value = question;
    if (piece) {
        afficherPiece(piece);
    }
    if (err.name === 'AbortError') {
        etat(t('etat.annulee'));
    } else {
        etat(messageEchec(err).texte, true);
    }
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

    /* Écran tactile : fermer le clavier virtuel pour laisser voir la réponse. */
    if (ecranTactile()) {
        $('saisie').blur();
    }

    const outil = outilActuel;
    if (outil === 'discuter' && Albert.contientLien(question)) {
        toast(t('toast.liens'));
    }

    const affiche = Albert.texteAffiche(question, piece);
    const demande = Albert.construireDemande(outil, Albert.joindre(question, piece), langueSource, langueCible);
    conversation.push({ role: 'user', content: demande, affiche: affiche });
    /* Pour ignorer la réponse si on change de conversation pendant l'attente. */
    const courante = conversation;
    /* Saisie vidée et état écrit avant les bulles : la zone de saisie change
       de hauteur, et le fil défilé trop tôt cachait l'attente dessous. */
    $('saisie').value = '';
    retirerPiece();
    etat(t('etat.reflechit'));
    const bulle = ajouter('user', affiche);
    annulation = new AbortController();
    boutonEnvoi(true);
    const retirerAttente = ajouterAttente();

    try {
        const reponse = await demanderReponse(outil);
        retirerAttente();
        if (conversation === courante) {
            recevoirReponse(reponse, outil);
        }
    } catch (err) {
        retirerAttente();
        if (conversation === courante) {
            reposerQuestion(err, question, piece, bulle);
        }
    } finally {
        annulation = null;
        boutonEnvoi(false);
        focusSaisie();
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
    viderRedaction();
    conversation = [];
    conversationId = null;
    retenirCourante(null);
    dernierUsage = null;
    afficherReglages();
    $('fil').replaceChildren();
    etat('');
    afficher();
}

/**
 * Bouton "Nouvelle conversation" : fil vide, et retour à Discuter
 * (Rédiger reste sur place, avec des notes vides).
 */
function repartirDeZero() {
    if (outilActuel === 'discuter' || outilActuel === 'rediger') {
        nouvelleConversation();
    } else {
        choisirOutil('discuter');
    }
}

$('nouvelle').addEventListener('click', repartirDeZero);

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
    focusSaisie();
});

$('question-suivante').addEventListener('click', () => {
    rappeler('bas');
    focusSaisie();
});

$('form-question').addEventListener('submit', (e) => {
    e.preventDefault();
    if (annulation) {
        annulation.abort();
        return;
    }
    if (lecturePiece) {
        etat(t('etat.attendre-lecture'));
        return;
    }
    envoyer();
});

/* Démarrage. */
I18n.appliquer();
afficherReglages();
afficherTheme();
afficherOutil();
afficher();
/* Origine refusée : le dire avant la saisie, et fermer le champ, elle ne servirait à rien. */
if (!Albert.ORIGINES.includes(location.origin)) {
    const origine = messageOrigine();
    messageCle(origine.texte, true, origine.lien);
    $('cle').disabled = true;
    $('form-cle').querySelector('button[type="submit"]').disabled = true;
}
if (reglages.cle) {
    rouvrirCourante();
}
chargerModeles();
