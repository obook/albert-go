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

    /**
     * Point d'entrée de Wikipédia, dans la langue de l'interface.
     *
     * Les domaines possibles sont listés dans la CSP (index.html).
     *
     * @returns {string} Adresse de l'API MediaWiki.
     */
    wikipedia() {
        return 'https://' + I18n.langue + '.wikipedia.org/w/api.php';
    },

    /** Articles lus par recherche, et taille gardée de chaque morceau. */
    ARTICLES: 2,
    TAILLE_FICHE: 800,
    TAILLE_RESUME: 600,
    TAILLE_SECTION: 1500,

    /** Moteur Programmable Search interrogé chez Google ; identifiant public. */
    CX: 'e3354509904334408',

    /** Nombre de résultats demandés. */
    NOMBRE: 5,

    /**
     * Outil proposé au modèle, au format "tools" de l'API.
     *
     * Décrit dans la langue de l'interface, comme la consigne système.
     *
     * @returns {Object} Entrée du champ tools.
     */
    outil() {
        return {
            type: 'function',
            function: {
                name: 'recherche_web',
                description: t('recherche.description'),
                parameters: {
                    type: 'object',
                    properties: { q: { type: 'string', description: t('recherche.parametre') } },
                    required: ['q']
                }
            }
        };
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
            : this.GOOGLE + '?num=' + this.NOMBRE + '&cx=' + encodeURIComponent(this.CX) + '&key=' + encodeURIComponent(cle)
                + '&q=' + encodeURIComponent(question);
        const reponse = await fetch(adresse, { signal: signal });
        const corps = await reponse.json().catch(() => ({}));
        if (!reponse.ok) {
            throw new Error((corps.error && corps.error.message)
                || t('recherche.moteur-injoignable', { status: reponse.status }));
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
     * Interroge l'API de MediaWiki et rend son corps.
     *
     * @param {string} adresse - Requête complète.
     * @param {AbortSignal} [signal] - Pour annuler avec la question.
     * @returns {Promise<Object>} Corps de la réponse.
     */
    async interroger(adresse, signal) {
        const reponse = await fetch(adresse, { signal: signal });
        const corps = await reponse.json().catch(() => ({}));
        if (!reponse.ok) {
            throw new Error(t('recherche.wikipedia-injoignable', { status: reponse.status }));
        }
        if (corps.error) {
            throw new Error(corps.error.info || t('recherche.wikipedia-refus'));
        }
        return corps;
    },

    /**
     * Cherche des articles sur Wikipédia et en rend les passages utiles.
     *
     * Une requête pour les titres, puis une par titre : MediaWiki ne rend le
     * texte entier que d'un article à la fois, les autres reviennent vides.
     * Un article pèse des milliers de jetons, d'où le découpage par `passages`.
     *
     * Le texte brut laisse de côté l'infobox, où se trouvent justement les
     * faits chiffrés (superficie, population, dates) : le wikitexte de la
     * tête d'article part avec, dans la même requête.
     *
     * @param {string} question - Texte cherché.
     * @param {AbortSignal} [signal] - Pour annuler avec la question.
     * @returns {Promise<Array<Object>>} Articles { title, url, desc }.
     */
    async chercherWikipedia(question, signal) {
        /* origin=* : c'est ainsi que MediaWiki ouvre CORS aux appels anonymes. */
        const base = this.wikipedia() + '?action=query&format=json&origin=*&redirects=1';
        const trouves = await this.interroger(base + '&list=search&srlimit=' + this.ARTICLES
            + '&srsearch=' + encodeURIComponent(question), signal);
        const titres = ((trouves.query && trouves.query.search) || []).map(r => r.title);
        const corps = await Promise.all(titres.map(titre => this.interroger(base
            + '&prop=extracts|info|revisions&inprop=url&explaintext=1'
            + '&rvprop=content&rvslots=main&rvsection=0'
            + '&titles=' + encodeURIComponent(titre), signal)));
        return corps.map((corpsPage, rang) => {
            const pages = (corpsPage.query && corpsPage.query.pages) || {};
            const page = Object.keys(pages).map(id => pages[id])[0] || {};
            const revision = (page.revisions || [])[0];
            const wikitexte = (revision && revision.slots && revision.slots.main && revision.slots.main['*']) || '';
            return {
                title: page.title || titres[rang],
                url: page.fullurl,
                desc: this.avecFiche(this.fiche(wikitexte), this.passages(page.extract || '', question))
            };
        });
    },

    /**
     * Champs de l'infobox, en "nom : valeur" séparés par des points-virgules.
     *
     * Une ligne de l'infobox commence par une barre verticale et porte un
     * seul champ. Un champ écrit sur plusieurs lignes est ignoré.
     *
     * @param {string} wikitexte - Wikitexte de la tête d'article.
     * @returns {string} Champs renseignés, vide si l'article n'a pas d'infobox.
     */
    fiche(wikitexte) {
        const champs = [];
        for (const ligne of wikitexte.split('\n')) {
            const champ = ligne.match(/^\|\s*([^=|{}\[\]]+?)\s*=\s*(.*)$/);
            if (!champ) {
                continue;
            }
            const valeur = this.nettoyerWiki(champ[2]);
            if (valeur) {
                champs.push(champ[1] + ' : ' + valeur);
            }
        }
        return champs.join(' ; ').slice(0, this.TAILLE_FICHE);
    },

    /**
     * Retire le balisage wiki d'une valeur de champ.
     *
     * ponytail : remplacement à plat, un modèle de modèle imbriqué reste tel
     * quel. Passer par un analyseur de wikitexte si cela se voit dans les
     * réponses.
     *
     * @param {string} texte - Valeur brute du champ.
     * @returns {string} Valeur lisible.
     */
    nettoyerWiki(texte) {
        return texte
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<ref[^>]*\/>/g, '')
            .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
            /* {{unité|2363.1|km|2}} donne "2363.1 km 2" ; {{Canada}} donne "Canada". */
            .replace(/\{\{([^{}]*)\}\}/g, (tout, contenu) => {
                const parts = contenu.split('|');
                return (parts.slice(1).join(' ').trim() || parts[0]);
            })
            .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
            .replace(/\[\[([^\]]*)\]\]/g, '$1')
            .replace(/'{2,}/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    /**
     * Assemble la fiche et le texte de l'article.
     *
     * @param {string} fiche - Champs de l'infobox.
     * @param {string} texte - Passages gardés de l'article.
     * @returns {string} Extrait à donner au modèle.
     */
    avecFiche(fiche, texte) {
        if (!fiche) {
            return texte;
        }
        return 'Fiche : ' + fiche + '\n' + texte;
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
        return t('recherche.aucun-mot');
    }
    etat(t('etat.recherche', { mots: mots }));
    try {
        const resultats = await Recherche.chercher(reglages.fournisseur, reglages.cleRecherche, mots, signal);
        faites.push(mots);
        return Recherche.formater(resultats) || t('recherche.aucun-resultat');
    } catch (err) {
        /* Sinon le modèle répond de mémoire sans que rien ne le dise. */
        const echec = t('recherche.impossible', { message: err.message });
        toast(echec);
        return echec;
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
    const source = t(reglages.fournisseur === 'wikipedia' ? 'recherche.source-wikipedia' : 'recherche.source-web');
    const rappel = t('recherche.rappel', { source: source });
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
    /* Extraits trouvés, pour le dernier tour. */
    const extraits = [];
    for (let tour = 0; tour < TOURS_MAX; tour++) {
        let reponse;
        try {
            reponse = await Albert.repondre(cle, {
                ...requete,
                messages: avecRappel(messages),
                tools: [Recherche.outil()],
                tool_choice: tour === 0 ? 'required' : 'auto'
            }, signal);
        } catch (err) {
            toast(t('toast.recherche-indisponible'));
            return { ...await Albert.repondre(cle, { ...requete, messages: messages }, signal), recherches: faites };
        }
        const appels = (reponse.message && reponse.message.tool_calls) || [];
        if (!appels.length) {
            return { ...reponse, recherches: faites };
        }
        messages.push(reponse.message);
        for (const appel of appels) {
            const trouve = await executerOutil(appel, signal, faites);
            extraits.push(trouve);
            messages.push({ role: 'tool', tool_call_id: appel.id, content: trouve });
        }
        etat(t('etat.reflechit'));
    }
    /* Dernier tour sans outil ni message "tool" : gpt-oss rappellerait l'outil
       et ne rédigerait rien. Les extraits repartent en texte. */
    const dernier = extraits.length
        ? [...requete.messages, { role: 'user', content: t('recherche.resultats', { extraits: extraits.join('\n') }) }]
        : requete.messages;
    return { ...await Albert.repondre(cle, { ...requete, messages: dernier }, signal), recherches: faites };
}

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Recherche;
}
