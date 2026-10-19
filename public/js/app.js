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
 * Licence : GPL-3.0-or-later
 */
'use strict';

/** Annulation de la requête en cours, ou null s'il n'y en a pas. */
let annulation = null;

/**
 * Message affiché quand le relais refuse l'origine de la page.
 *
 * @returns {{texte: string, lien: string}} Message et adresse du lien final.
 */
function messageOrigine() {
    return {
        texte: t('erreur.origine', { origine: location.origin }),
        lien: Albert.URL_PUBLIQUE
    };
}

/** Délai entre deux vérifications du relais en panne. */
const RELAIS_MS = 30000;
let relaisEnPanne = false;
let minuteurRelais = null;

/**
 * Vérifie le relais jusqu'à sa reprise, puis l'annonce.
 *
 * Onglet caché : pas de requête, on attend son retour.
 */
function verifierRelais() {
    clearTimeout(minuteurRelais);
    if (document.hidden) {
        minuteurRelais = setTimeout(verifierRelais, RELAIS_MS);
        return;
    }
    Albert.appels().then(() => {
        relaisEnPanne = false;
        /* Pas pendant une réponse : la ligne d'état sert alors à l'attente. */
        if ($('etat').textContent === Albert.texte('erreur.relais-hs')) {
            etat(t('toast.relais-retabli'), false, true);
        }
        toast(t('toast.relais-retabli'));
    }).catch(() => {
        minuteurRelais = setTimeout(verifierRelais, RELAIS_MS);
    });
}

/**
 * Note la panne du relais et lance la surveillance, une seule fois.
 */
function signalerPanneRelais() {
    if (!relaisEnPanne) {
        relaisEnPanne = true;
        minuteurRelais = setTimeout(verifierRelais, RELAIS_MS);
    }
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
 * @returns {{texte: string, lien: ?string}} Message et adresse du lien final.
 */
function messageEchec(err) {
    if (err instanceof TypeError && Albert.EN_LIGNE && !Albert.ORIGINES.includes(location.origin)) {
        return messageOrigine();
    }
    if (err instanceof TypeError) {
        if (navigator.onLine && Albert.EN_LIGNE) {
            signalerPanneRelais();
        }
        return { texte: navigator.onLine ? Albert.texte('erreur.relais') : t('erreur.hors-ligne'), lien: null };
    }
    if (err.name === 'TimeoutError') {
        return { texte: t('erreur.timeout'), lien: null };
    }
    /* Tous les échecs passent ici : c'est là qu'on repère la panne du relais. */
    if (Albert.EN_LIGNE && err.message === Albert.texte('erreur.relais-hs')) {
        signalerPanneRelais();
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
 * @param {string} question - Texte saisi, sans le fichier joint.
 * @param {?string} image - Image à montrer au modèle, ou null.
 * @param {Object} modele - Modèle qui répond : celui des réglages, ou un lecteur d'images.
 * @returns {Promise<Object>} Réponse de Albert.repondre.
 */
async function demanderReponse(outil, question, image, modele) {
    /* Chaque outil a sa consigne système ; seuls les modules à fil envoient aussi la conversation. */
    const fil = Albert.OUTILS[outil].fil;
    let texteConsigne = await consigne(outil);
    /* Discussion et Imprimerie : les sources cochées partent à chaque question, à la suite de la consigne. */
    if (Albert.OUTILS[outil].sources && documentsProjet.length) {
        texteConsigne += '\n\n' + Albert.joindreDocuments(documentsProjet);
    }
    /* Projet : un seul document, seule sa version en cours accompagne la demande. */
    let messages = Albert.OUTILS[outil].documents ? Albert.messagesProjet(conversation)
        : Albert.messagesAEnvoyer(conversation, fil ? reglages.echanges : 0);
    /* ponytail: l'image ne part qu'avec sa question ; aux tours suivants, le modèle relit sa transcription. */
    if (image) {
        messages = Albert.avecImage(messages, question, image);
    }
    if (texteConsigne) {
        messages = [{ role: 'system', content: texteConsigne }, ...messages];
    }
    /* Seuls les modules à fil proposent les outils calcul et recherche : les autres rendent un texte. */
    const envoi = fil ? repondreAvecOutils : Albert.repondre.bind(Albert);
    return envoi({
        model: modele.id,
        temperature: reglages.temperature,
        ...Albert.topK(reglages.topK),
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
    /* Langue gardée pour la lecture à voix haute : la cible de Traduire, sinon celle du texte. */
    const langue = outil === 'traduire' ? langueCible : Albert.langueDuTexte(reponse.texte, I18n.langue);
    /* Imprimerie : le gras est retiré avant l'affichage, l'export et la demande suivante. */
    const texte = Albert.OUTILS[outil].documents ? Albert.sansGras(reponse.texte) : reponse.texte;
    /* Sources cochées : notées avec la réponse, pour son icône de bibliothèque. */
    const recherches = Albert.OUTILS[outil].sources && documentsProjet.length
        ? [...(reponse.recherches || []), { bibliotheque: documentsProjet.map(d => d.nom).join(', ') }]
        : reponse.recherches;
    conversation.push({ role: 'assistant', content: texte, langue: langue, recherches: recherches, usage: reponse.usage });
    if (Albert.OUTILS[outil].documents) {
        /* Imprimerie : la version prend son heure et son numéro ; au-delà du plafond, la plus ancienne sort. */
        conversation.at(-1).date = Date.now();
        conversation = Albert.limiterVersions(Albert.numeroterVersions(conversation));
    }
    ajouter('assistant', texte, langue, true, recherches);
    sauverConversation();
    afficherReglages();
    /* Réponse arrêtée par la longueur : la fin manque, on le dit. */
    etat(reponse.coupee ? t('etat.coupee') : '', reponse.coupee);
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
    if (Albert.OUTILS[outil].fil && Albert.contientLien(question)) {
        toast(t('toast.liens'));
    }

    /* Image : un modèle qui lit les images répond à cette question, à la place du modèle choisi s'il le faut. */
    let image = null;
    let modele = modeleActuel();
    if (piece && piece.image && Albert.OUTILS[outil].fil) {
        const lecteur = Albert.modeleImages(modelesDispo, modele);
        if (!lecteur) {
            toast(t('toast.image-transcrite', { modele: modele.nom }));
        } else {
            image = piece.image;
            if (lecteur !== modele) {
                toast(t('toast.image-modele', { modele: lecteur.nom }));
            }
            modele = lecteur;
        }
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
    /* Lien vers le fichier et miniature : à l'écran seulement, pas dans l'historique. */
    const bulle = ajouter('user', piece ? question : affiche);
    if (piece) {
        bulle.append(lignePiece(piece));
    }
    annulation = new AbortController();
    boutonEnvoi(true);
    /* Imprimerie : la demande n'a pas de bulle, l'attente la rappelle. */
    const retirerAttente = ajouterAttente(Albert.OUTILS[outil].documents ? affiche : '');

    try {
        const reponse = await demanderReponse(outil, question, image, modele);
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
    choisirSources([]);
    nomProjet = '';
    afficherDocuments();
    conversationId = null;
    retenirCourante(null);
    afficherCourante();
    afficherReglages();
    $('fil').replaceChildren();
    etat('');
    afficher();
}

/**
 * Saisie vide : une conversation neuve ou rouverte part sans question en attente.
 * Pas dans nouvelleConversation : en changeant de module, la saisie suit.
 */
function viderSaisie() {
    $('saisie').value = '';
    position = -1;
    brouillon = '';
}

/**
 * Bouton "Nouvelle discussion" : retour à Discussion, depuis Courrier aussi,
 * avec un fil et une saisie vides. choisirOutil rouvrirait la dernière
 * discussion : nouvelleConversation la referme.
 */
function repartirDeZero() {
    if (outilActuel !== 'discuter') {
        choisirOutil('discuter');
    }
    nouvelleConversation();
    viderSaisie();
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

/**
 * Recharge la page si une version plus récente est en ligne.
 *
 * La forge garde index.html 10 minutes en cache, et l'application installée
 * reprend l'onglet sans le recharger. Rien ne se passe pendant une réponse
 * ou si la saisie contient du texte.
 */
async function verifierVersion() {
    if (VERSION.commit === 'locale' || annulation || $('saisie').value) {
        return;
    }
    const texte = await fetch('js/version.js', { cache: 'no-store' }).then(r => r.text()).catch(() => '');
    const enLigne = (texte.match(/commit: '(\w+)'/) || [])[1];
    /* Un seul essai par version : pas de boucle si la page reste ancienne. */
    if (enLigne && enLigne !== VERSION.commit && sessionStorage.getItem('recharge') !== enLigne) {
        sessionStorage.setItem('recharge', enLigne);
        location.reload();
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        verifierVersion();
        if (relaisEnPanne) {
            verifierRelais();
        }
    }
});

/* Démarrage. */
verifierVersion();
/* En ligne, relais vérifié en arrière-plan : la panne s'annonce avant la première question. */
if (Albert.EN_LIGNE) {
    Albert.appels().catch(() => {
        etat(Albert.texte('erreur.relais-hs'), true);
        toast(Albert.texte('erreur.relais-hs'));
        signalerPanneRelais();
    });
}
/* "À propos" : la clé passe par le relais n8n en ligne, reste sur le poste dans l'application standalone. */
if (Albert.EN_LIGNE || Serveur.portable) {
    document.querySelector('[data-t="info.donnees.relais"]').dataset.t = Albert.EN_LIGNE ? 'info.donnees.relais-en-ligne' : 'info.donnees.relais-portable';
}
I18n.appliquer();
afficherReglages();
afficherTheme();
afficherOutil();
afficher();
/* Origine refusée : le dire avant la saisie et fermer le champ, qui ne servirait à rien. */
if (Albert.EN_LIGNE && !Albert.ORIGINES.includes(location.origin)) {
    const origine = messageOrigine();
    messageCle(origine.texte, true, origine.lien);
    $('cle').disabled = true;
    $('form-cle').querySelector('button[type="submit"]').disabled = true;
}
reprendreSources();
if (Albert.pret()) {
    rouvrirCourante();
}
chargerModeles();
/* Serveur sans clé : le dire dès l'ouverture plutôt qu'à la première question.
   Le bouton d'ouverture du .env n'existe que dans l'application (standalone/preload.js). */
if (Serveur.cleAbsente) {
    $('texte-cle-absente').textContent = t('cle-absente.texte', { chemin: Serveur.cleAbsente });
    $('ouvrir-env').hidden = !window.Application;
    $('cle-absente').addEventListener('close', () => {
        if ($('cle-absente').returnValue === 'ouvrir') {
            window.Application.ouvrirEnv();
        }
    });
    $('cle-absente').showModal();
}

/* Plus de service worker : une page servie depuis le cache masquerait le renvoi vers /kiosque.
   Un navigateur qui en garde un d'une ancienne version le retire. */
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(liste => liste.forEach(r => r.unregister())).catch(() => {});
}
