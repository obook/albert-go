/*
 * recherche.js
 * Recherche web par l'API Mojeek, proposée au modèle comme un outil.
 *
 * Le modèle reçoit la définition de l'outil et décide lui-même s'il
 * cherche. Ses appels sont exécutés ici, puis les résultats lui sont
 * renvoyés pour qu'il rédige sa réponse (function calling, comme
 * albert-atelier le fait pour l'OCR).
 *
 * Deux moteurs au choix, les seuls testés qui acceptent un appel direct
 * du navigateur : Google Programmable Search, clé en libre service, et
 * Mojeek, européen mais sur offre payante. La clé voyage dans l'adresse,
 * c'est ainsi que les deux API la lisent.
 * Les résultats donnent un titre, une adresse et un extrait, jamais le
 * texte des pages.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/* Aucun moteur utilisable : Google a fermé son API JSON, Mojeek est sur devis. */
/* Pour rouvrir : true ici, et retirer hidden du bloc "Recherche web". */
const RECHERCHE_OUVERTE = false;

/* Appels d'outil enchaînés avant d'exiger une réponse rédigée. */
const TOURS_MAX = 2;

const Recherche = {
    /** Points d'entrée des deux moteurs. */
    MOJEEK: 'https://www.mojeek.com/search',
    GOOGLE: 'https://www.googleapis.com/customsearch/v1',

    /** Moteur Programmable Search interrogé chez Google ; identifiant public. */
    CX: 'e3354509904334408',

    /** Nombre de résultats demandés. */
    NOMBRE: 5,

    /** Outil proposé au modèle, au format "tools" de l'API. */
    OUTIL: {
        type: 'function',
        function: {
            name: 'recherche_web',
            description: 'Cherche des pages web et renvoie leurs titres, adresses et extraits. '
                + 'À appeler pour une actualité, un fait postérieur à ton entraînement, '
                + 'un chiffre à vérifier ou une source à citer. Ne renvoie pas le texte des pages. '
                + 'Le moteur peut ne couvrir qu\'une sélection de sites de référence.',
            parameters: {
                type: 'object',
                properties: { q: { type: 'string', description: 'Les mots à chercher.' } },
                required: ['q']
            }
        }
    },

    /**
     * Interroge le moteur choisi.
     *
     * Mojeek refuse une clé par un code 200, un `status` en clair et aucun
     * résultat ; Google répond un code d'erreur et un message.
     *
     * @param {string} fournisseur - "google" ou "mojeek".
     * @param {string} cle - Clé de l'utilisateur chez ce moteur.
     * @param {string} question - Texte cherché.
     * @param {AbortSignal} [signal] - Pour annuler avec la question.
     * @returns {Promise<Array<Object>>} Résultats du moteur.
     */
    async chercher(fournisseur, cle, question, signal) {
        const mojeek = fournisseur === 'mojeek';
        const adresse = mojeek
            ? this.MOJEEK + '?fmt=json&t=' + this.NOMBRE + '&api_key=' + encodeURIComponent(cle)
                + '&q=' + encodeURIComponent(question)
            : this.GOOGLE + '?num=' + this.NOMBRE + '&cx=' + this.CX + '&key=' + encodeURIComponent(cle)
                + '&q=' + encodeURIComponent(question);
        const reponse = await fetch(adresse, { signal: signal });
        const corps = await reponse.json().catch(() => ({}));
        if (!reponse.ok) {
            throw new Error((corps.error && corps.error.message) || 'moteur injoignable (' + reponse.status + ').');
        }
        if (!mojeek) {
            return corps.items || [];
        }
        const resultats = (corps.response && corps.response.results) || [];
        if (!resultats.length && corps.response && corps.response.status) {
            throw new Error(corps.response.status);
        }
        return resultats;
    },

    /**
     * Met les résultats en texte pour le modèle.
     *
     * @param {Array<Object>} resultats - Résultats du moteur.
     * @returns {string} Une ligne par résultat, vide s'il n'y en a aucun.
     */
    formater(resultats) {
        /* Mojeek dit url et desc, Google dit link et snippet. */
        return resultats.map((r) => {
            const adresse = r.url || r.link || '';
            const extrait = r.desc || r.snippet || '';
            return '- ' + (r.title || adresse) + ' (' + adresse + ') : ' + extrait;
        }).join('\n');
    }
};

/**
 * Exécute un appel d'outil demandé par le modèle.
 *
 * Un échec de recherche est rendu au modèle en texte : il répond alors
 * sans les résultats, au lieu de voir la conversation s'arrêter.
 *
 * @param {Object} appel - Entrée de tool_calls renvoyée par le modèle.
 * @param {AbortSignal} signal - Pour annuler avec la question.
 * @param {Array<string>} faites - Mots cherchés, complétés ici pour la trace sous la réponse.
 * @returns {Promise<string>} Contenu du message de rôle "tool".
 */
async function executerOutil(appel, signal, faites) {
    let mots = '';
    try {
        mots = JSON.parse(appel.function.arguments || '{}').q || '';
    } catch (e) {
        mots = '';
    }
    if (!mots) {
        return 'Aucun mot à chercher.';
    }
    etat('Recherche de « ' + mots +' »...');
    try {
        const resultats = await Recherche.chercher(reglages.fournisseur, reglages.cleRecherche, mots, signal);
        faites.push(mots);
        return Recherche.formater(resultats) || 'Aucun résultat.';
    } catch (err) {
        return 'Recherche impossible : ' + err.message;
    }
}

/**
 * Ajoute à la consigne système le rappel que l'outil est disponible.
 *
 * Interrogé sur ses capacités, un modèle répond souvent qu'il ne sait pas
 * chercher, sans regarder les outils qu'on lui a passés.
 *
 * @param {Array<Object>} messages - Messages de la demande.
 * @returns {Array<Object>} Copie avec le rappel, sans toucher l'original.
 */
function avecRappel(messages) {
    const rappel = 'Tu disposes de l\'outil recherche_web : tu peux chercher sur le web, '
        + 'et tu le dis si on te le demande.';
    if (messages[0] && messages[0].role === 'system') {
        return [{ role: 'system', content: messages[0].content + '\n' + rappel }, ...messages.slice(1)];
    }
    return [{ role: 'system', content: rappel }, ...messages];
}

/**
 * Envoie la demande à Albert, outil de recherche proposé si le réglage est actif.
 *
 * Un modèle qui refuse le champ `tools` fait échouer le premier appel :
 * on repart alors sans outil plutôt que de perdre la question.
 *
 * @param {string} cle - Clé API Albert.
 * @param {Object} requete - Corps de la demande (model, messages...).
 * @param {AbortSignal} signal - Pour annuler avec la question.
 * @returns {Promise<Object>} Réponse d'Albert.repondre.
 */
async function repondreAvecRecherche(cle, requete, signal) {
    if (!RECHERCHE_OUVERTE || !reglages.recherche || !reglages.cleRecherche) {
        return Albert.repondre(cle, requete, signal);
    }
    const messages = [...requete.messages];
    /* Mots cherchés, rendus avec la réponse pour la trace sous la bulle. */
    const faites = [];
    for (let tour = 0; tour < TOURS_MAX; tour++) {
        let reponse;
        try {
            reponse = await Albert.repondre(cle, { ...requete, messages: avecRappel(messages), tools: [Recherche.OUTIL] }, signal);
        } catch (err) {
            toast('Recherche web indisponible avec ce modèle.');
            return { ...await Albert.repondre(cle, { ...requete, messages: messages }, signal), recherches: faites };
        }
        const appels = (reponse.message && reponse.message.tool_calls) || [];
        if (!appels.length) {
            return { ...reponse, recherches: faites };
        }
        messages.push(reponse.message);
        for (const appel of appels) {
            messages.push({ role: 'tool', tool_call_id: appel.id, content: await executerOutil(appel, signal, faites) });
        }
        etat('Albert réfléchit...');
    }
    /* Dernier tour sans outil : le modèle doit rédiger avec ce qu'il a. */
    return { ...await Albert.repondre(cle, { ...requete, messages: messages }, signal), recherches: faites };
}

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Recherche;
}
