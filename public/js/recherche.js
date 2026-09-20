/*
 * recherche.js
 * Recherche web par l'API Mojeek, proposée au modèle comme un outil.
 *
 * Le modèle reçoit la définition de l'outil et décide lui-même s'il
 * cherche. Ses appels sont exécutés ici, puis les résultats lui sont
 * renvoyés pour qu'il rédige sa réponse (function calling, comme
 * albert-atelier le fait pour l'OCR).
 *
 * Mojeek est le seul moteur européen testé qui accepte un appel direct
 * du navigateur : il renvoie les en-têtes CORS. Sa clé voyage dans
 * l'adresse, c'est ainsi que l'API la lit.
 * Les résultats donnent un titre, une adresse et un extrait, jamais le
 * texte des pages.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/* Appels d'outil enchaînés avant d'exiger une réponse rédigée. */
const TOURS_MAX = 2;

const Recherche = {
    /** Point d'entrée de l'API Mojeek. */
    URL: 'https://www.mojeek.com/search',

    /** Nombre de résultats demandés. */
    NOMBRE: 5,

    /** Outil proposé au modèle, au format "tools" de l'API. */
    OUTIL: {
        type: 'function',
        function: {
            name: 'recherche_web',
            description: 'Cherche des pages web et renvoie leurs titres, adresses et extraits. '
                + 'À appeler pour une actualité, un fait postérieur à ton entraînement, '
                + 'un chiffre à vérifier ou une source à citer. Ne renvoie pas le texte des pages.',
            parameters: {
                type: 'object',
                properties: { q: { type: 'string', description: 'Les mots à chercher.' } },
                required: ['q']
            }
        }
    },

    /**
     * Interroge Mojeek.
     *
     * Une clé refusée donne un code 200, un `status` en clair et aucun
     * résultat : ce cas est renvoyé comme une erreur.
     *
     * @param {string} cle - Clé de l'API Mojeek.
     * @param {string} question - Texte cherché.
     * @param {AbortSignal} [signal] - Pour annuler avec la question.
     * @returns {Promise<Array<Object>>} Résultats de l'API.
     */
    async chercher(cle, question, signal) {
        const adresse = this.URL + '?fmt=json&t=' + this.NOMBRE
            + '&api_key=' + encodeURIComponent(cle)
            + '&q=' + encodeURIComponent(question);
        const reponse = await fetch(adresse, { signal: signal });
        if (!reponse.ok) {
            throw new Error('moteur injoignable (' + reponse.status + ').');
        }
        const corps = (await reponse.json()).response || {};
        const resultats = corps.results || [];
        if (!resultats.length && corps.status) {
            throw new Error(corps.status);
        }
        return resultats;
    },

    /**
     * Met les résultats en texte pour le modèle.
     *
     * @param {Array<Object>} resultats - Résultats de l'API.
     * @returns {string} Une ligne par résultat, vide s'il n'y en a aucun.
     */
    formater(resultats) {
        /* Noms de champs non vérifiés sur une réponse valide : on prend le premier présent. */
        return resultats.map((r) => {
            const titre = r.title || r.url || '';
            const extrait = r.desc || r.snippet || '';
            return '- ' + titre + ' (' + (r.url || '') + ') : ' + extrait;
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
 * @returns {Promise<string>} Contenu du message de rôle "tool".
 */
async function executerOutil(appel, signal) {
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
        return Recherche.formater(await Recherche.chercher(reglages.cleRecherche, mots, signal)) || 'Aucun résultat.';
    } catch (err) {
        return 'Recherche impossible : ' + err.message;
    }
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
    if (!reglages.recherche || !reglages.cleRecherche) {
        return Albert.repondre(cle, requete, signal);
    }
    const messages = [...requete.messages];
    for (let tour = 0; tour < TOURS_MAX; tour++) {
        let reponse;
        try {
            reponse = await Albert.repondre(cle, { ...requete, messages: messages, tools: [Recherche.OUTIL] }, signal);
        } catch (err) {
            toast('Recherche web indisponible avec ce modèle.');
            return Albert.repondre(cle, { ...requete, messages: messages }, signal);
        }
        const appels = (reponse.message && reponse.message.tool_calls) || [];
        if (!appels.length) {
            return reponse;
        }
        messages.push(reponse.message);
        for (const appel of appels) {
            messages.push({ role: 'tool', tool_call_id: appel.id, content: await executerOutil(appel, signal) });
        }
        etat('Albert réfléchit...');
    }
    /* Dernier tour sans outil : le modèle doit rédiger avec ce qu'il a. */
    return Albert.repondre(cle, { ...requete, messages: messages }, signal);
}

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Recherche;
}
