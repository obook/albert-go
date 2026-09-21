/*
 * recherche.js
 * Recherche web par l'API Mojeek, proposée au modèle comme un outil.
 *
 * Le modèle reçoit la définition de l'outil et décide lui-même s'il
 * cherche. Ses appels sont exécutés ici, puis les résultats lui sont
 * renvoyés pour qu'il rédige sa réponse (function calling, comme
 * albert-atelier le fait pour l'OCR).
 *
 * Trois moteurs au choix, les seuls testés qui acceptent un appel direct
 * du navigateur. Wikipédia par défaut : sans clé, CORS ouvert, et il rend
 * le texte des articles plutôt qu'une liste de liens, ce qui donne au
 * modèle de quoi répondre au lieu de quoi deviner. Google Programmable
 * Search et Mojeek cherchent sur le web, avec une clé qui voyage dans
 * l'adresse, c'est ainsi que leurs API la lisent ; ils ne rendent que des
 * titres, des adresses et de courts extraits.
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
    /** Points d'entrée des trois moteurs. */
    MOJEEK: 'https://www.mojeek.com/search',
    GOOGLE: 'https://www.googleapis.com/customsearch/v1',
    WIKIPEDIA: 'https://fr.wikipedia.org/w/api.php',

    /** Articles lus par recherche, et taille gardée de chaque morceau. */
    ARTICLES: 2,
    TAILLE_RESUME: 600,
    TAILLE_SECTION: 1500,

    /** Moteur Programmable Search interrogé chez Google ; identifiant public. */
    CX: 'e3354509904334408',

    /** Nombre de résultats demandés. */
    NOMBRE: 5,

    /** Outil proposé au modèle, au format "tools" de l'API. */
    OUTIL: {
        type: 'function',
        function: {
            name: 'recherche_web',
            description: 'Cherche une information et renvoie des extraits sourcés. '
                + 'À appeler pour un fait à vérifier, une date, un chiffre, une étymologie, '
                + 'une actualité ou une source à citer, et chaque fois que tu répondrais de mémoire '
                + 'sur un sujet précis. Le moteur est soit Wikipédia, soit un moteur web selon le '
                + 'réglage : ce que tu reçois est tout ce dont tu disposes, dis-le si cela ne suffit pas.',
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
     * @param {string} fournisseur - "wikipedia", "google" ou "mojeek".
     * @param {?string} cle - Clé de l'utilisateur, inutile chez Wikipédia.
     * @param {string} question - Texte cherché.
     * @param {AbortSignal} [signal] - Pour annuler avec la question.
     * @returns {Promise<Array<Object>>} Résultats du moteur.
     */
    async chercher(fournisseur, cle, question, signal) {
        if (fournisseur === 'wikipedia') {
            return this.chercherWikipedia(question, signal);
        }
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
     * Cherche des articles sur Wikipédia et en rend les passages utiles.
     *
     * Une seule requête : `generator=search` trouve les articles, `extracts`
     * en rend le texte brut. Un article entier pèse des milliers de jetons,
     * d'où le découpage par `passages`.
     *
     * @param {string} question - Texte cherché.
     * @param {AbortSignal} [signal] - Pour annuler avec la question.
     * @returns {Promise<Array<Object>>} Articles { title, url, desc }.
     */
    async chercherWikipedia(question, signal) {
        /* origin=* : c'est ainsi que MediaWiki ouvre CORS aux appels anonymes. */
        const adresse = this.WIKIPEDIA + '?action=query&format=json&origin=*&redirects=1'
            + '&generator=search&gsrlimit=' + this.ARTICLES
            + '&gsrsearch=' + encodeURIComponent(question)
            + '&prop=extracts|info&inprop=url&explaintext=1&exlimit=max';
        const reponse = await fetch(adresse, { signal: signal });
        const corps = await reponse.json().catch(() => ({}));
        if (!reponse.ok) {
            throw new Error('Wikipédia injoignable (' + reponse.status + ').');
        }
        if (corps.error) {
            throw new Error(corps.error.info || 'requête refusée par Wikipédia.');
        }
        const pages = (corps.query && corps.query.pages) || {};
        return Object.keys(pages).map(id => pages[id])
            /* index : le rang donné par la recherche, que l'objet pages perd. */
            .sort((a, b) => (a.index || 0) - (b.index || 0))
            .map(page => ({
                title: page.title,
                url: page.fullurl,
                desc: this.passages(page.extract || '', question)
            }));
    },

    /**
     * Garde d'un article son résumé et la section qui répond à la question.
     *
     * Le texte brut de MediaWiki sépare les sections par une ligne "== Titre ==" ;
     * on note chacune par le nombre de mots de la question qu'elle contient.
     *
     * @param {string} texte - Article en texte brut.
     * @param {string} question - Texte cherché.
     * @returns {string} Résumé, suivi de la meilleure section s'il y en a une.
     */
    passages(texte, question) {
        const mots = (question.toLowerCase().match(/[^\s,.;:!?"'()]{4,}/g) || []);
        const note = (bloc) => {
            const bas = bloc.toLowerCase();
            return mots.filter(mot => bas.includes(mot)).length;
        };
        /* Le premier bloc est le résumé : il précède le premier titre de section. */
        const blocs = texte.split(/\n(?=\={2}[^=])/);
        const resume = blocs[0].slice(0, this.TAILLE_RESUME);
        const sections = blocs.slice(1).sort((a, b) => note(b) - note(a));
        if (!sections.length || !note(sections[0])) {
            return resume;
        }
        return resume + '\n' + sections[0].slice(0, this.TAILLE_SECTION);
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
            /* Un extrait Wikipédia tient sur plusieurs lignes : une ligne par résultat. */
            const extrait = (r.desc || r.snippet || '').replace(/\s+/g, ' ').trim();
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
    const source = reglages.fournisseur === 'wikipedia' ? 'dans Wikipédia' : 'sur le web';
    const rappel = 'Tu disposes de l\'outil recherche_web : tu peux chercher ' + source + ', '
        + 'et tu le dis si on te le demande. Sers-t\'en dès qu\'une réponse demande un fait précis '
        + 'que tu n\'es pas certain de connaître.';
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
 * Le premier tour impose la recherche (`tool_choice`), sinon les modèles
 * ouverts répondent de mémoire sans jamais appeler l'outil. Les tours
 * suivants laissent le modèle libre, pour qu'il rédige sa réponse.
 *
 * @param {string} cle - Clé API Albert.
 * @param {Object} requete - Corps de la demande (model, messages...).
 * @param {AbortSignal} signal - Pour annuler avec la question.
 * @returns {Promise<Object>} Réponse d'Albert.repondre.
 */
async function repondreAvecRecherche(cle, requete, signal) {
    if (!reglages.recherche || (reglages.fournisseur !== 'wikipedia' && !reglages.cleRecherche)) {
        return Albert.repondre(cle, requete, signal);
    }
    const messages = [...requete.messages];
    /* Mots cherchés, rendus avec la réponse pour la trace sous la bulle. */
    const faites = [];
    for (let tour = 0; tour < TOURS_MAX; tour++) {
        let reponse;
        try {
            reponse = await Albert.repondre(cle, {
                ...requete,
                messages: avecRappel(messages),
                tools: [Recherche.OUTIL],
                tool_choice: tour === 0 ? 'required' : 'auto'
            }, signal);
        } catch (err) {
            toast('Recherche indisponible avec ce modèle.');
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
