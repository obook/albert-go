/*
 * tools/recherche.js
 * Recherche documentaire, proposée au modèle comme un outil.
 *
 * Le modèle reçoit la définition de l'outil et décide lui-même s'il
 * cherche. Ses appels sont exécutés ici, puis les résultats lui sont
 * renvoyés pour qu'il rédige sa réponse (function calling, comme
 * albert-atelier le fait pour l'OCR).
 *
 * Huit moteurs, les seuls testés qui acceptent un appel direct du
 * navigateur. Six répondent sans clé. Wikipédia, par défaut, et Vikidia
 * rendent le texte des articles ; les quatre catalogues n'acceptent que des
 * mots-clés. Google et Mojeek demandent une clé, qui voyage dans l'adresse
 * comme leurs API la lisent, et ne rendent que de courts extraits.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const Recherche = {
    /** Points d'entrée des deux moteurs web ; les autres sont dans MOTEURS. */
    MOJEEK: 'https://www.mojeek.com/search',
    GOOGLE: 'https://www.googleapis.com/customsearch/v1',

    /**
     * Moteurs proposés, dans l'ordre de la liste des réglages.
     *
     * Trois familles : `wiki` désigne un site MediaWiki, interrogé en deux
     * temps ; `adresse` et `extraire` décrivent une base JSON ouverte, dont
     * seule la forme de la réponse change ; sans l'un ni l'autre, le moteur
     * demande une clé de l'utilisateur.
     *
     * Les domaines possibles sont listés dans la CSP (index.html).
     */
    MOTEURS: {
        wikipedia: { nom: 'Wikipédia', wiki: 'wikipedia.org' },
        hal: {
            nom: 'HAL',
            adresse: (q, n) => 'https://api.archives-ouvertes.fr/search/?wt=json&rows=' + n
                + '&fl=label_s,uri_s,abstract_s&q=' + encodeURIComponent(q),
            extraire: (corps) => ((corps.response && corps.response.docs) || [])
                .map(d => ({ title: d.label_s, url: d.uri_s, desc: (d.abstract_s || [])[0] }))
        },
        'internet-archive': {
            nom: 'Internet Archive',
            adresse: (q, n) => 'https://archive.org/advancedsearch.php?output=json&rows=' + n
                + '&fl[]=identifier&fl[]=title&fl[]=description&q=' + encodeURIComponent(q),
            extraire: (corps) => ((corps.response && corps.response.docs) || [])
                .map(d => ({ title: d.title, url: 'https://archive.org/details/' + d.identifier, desc: d.description }))
        },
        'open-library': {
            nom: 'Open Library',
            adresse: (q, n) => 'https://openlibrary.org/search.json?limit=' + n
                + '&fields=key,title,author_name,first_publish_year&q=' + encodeURIComponent(q),
            extraire: (corps) => (corps.docs || []).map(d => ({
                title: d.title,
                url: d.key ? 'https://openlibrary.org' + d.key : '',
                desc: [(d.author_name || []).join(', '), d.first_publish_year].filter(Boolean).join(' - ')
            }))
        },
        openalex: {
            nom: 'OpenAlex',
            adresse: (q, n) => 'https://api.openalex.org/works?per-page=' + n
                + '&select=id,title,doi,abstract_inverted_index&search=' + encodeURIComponent(q),
            extraire: (corps) => (corps.results || []).map(r => ({
                title: r.title,
                url: r.doi || r.id,
                desc: Recherche.resumeInverse(r.abstract_inverted_index)
            }))
        },
        /* Vikidia n'existe pas dans toutes les langues de l'interface. */
        vikidia: { nom: 'Vikidia', wiki: 'vikidia.org', langues: ['fr', 'es'] },
        google: { nom: 'Google Programmable Search', cle: true },
        mojeek: { nom: 'Mojeek', cle: true }
    },

    /**
     * Point d'entrée MediaWiki d'un moteur, dans la langue de l'interface.
     *
     * @param {string} fournisseur - Clé de MOTEURS portant un champ wiki.
     * @returns {string} Adresse de l'API MediaWiki.
     */
    wiki(fournisseur) {
        const moteur = this.MOTEURS[fournisseur];
        const langues = moteur.langues;
        const langue = !langues || langues.includes(I18n.langue) ? I18n.langue : langues[0];
        return 'https://' + langue + '.' + moteur.wiki + '/w/api.php';
    },

    /**
     * Indique si le moteur répond sans clé de l'utilisateur.
     *
     * @param {string} fournisseur - Clé de MOTEURS.
     * @returns {boolean} true pour Wikipédia, Vikidia et les bases ouvertes.
     */
    sansCle(fournisseur) {
        const moteur = this.MOTEURS[fournisseur];
        return Boolean(moteur && !moteur.cle);
    },

    /**
     * Remet en phrase le résumé d'OpenAlex, livré en index inversé.
     *
     * @param {?Object} index - Mot -> positions dans le résumé.
     * @returns {string} Résumé lisible, vide si l'article n'en a pas.
     */
    resumeInverse(index) {
        if (!index) {
            return '';
        }
        const mots = [];
        for (const mot of Object.keys(index)) {
            for (const place of index[mot]) {
                mots[place] = mot;
            }
        }
        return mots.filter(Boolean).join(' ');
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
     * Les catalogues exigent que tous les mots soient présents : le modèle
     * doit y chercher par mots-clés et non par phrase, sans quoi il ne
     * ramène rien. Les encyclopédies et les moteurs web acceptent les deux.
     *
     * @param {string|string[]} [fournisseurs] - Clés de MOTEURS ; sans elles, pas de consigne de famille.
     * @returns {Object} Entrée du champ tools.
     */
    outil(fournisseurs) {
        const ids = [].concat(fournisseurs || []).filter(id => this.MOTEURS[id]);
        /* Un seul catalogue suffit à demander des mots-clés. */
        const catalogue = ids.some(id => this.MOTEURS[id].adresse);
        return {
            type: 'function',
            function: {
                name: 'recherche_web',
                description: t('recherche.description', { nom: this.noms(ids.length ? ids : ['wikipedia']) })
                    + (catalogue ? ' ' + t('recherche.description-catalogue') : ''),
                parameters: {
                    type: 'object',
                    properties: { q: { type: 'string', description: t('recherche.parametre') } },
                    required: ['q']
                }
            }
        };
    },

    /** Moteurs interrogés ensemble, au plus. */
    MOTEURS_MAX: 3,

    /**
     * Noms de moteurs, pour le modèle et pour la trace.
     *
     * @param {string[]} fournisseurs - Clés de MOTEURS.
     * @returns {string} Par exemple "Wikipédia, HAL".
     */
    noms(fournisseurs) {
        return fournisseurs.map(id => this.MOTEURS[id].nom).join(', ');
    },

    /**
     * Interroge plusieurs moteurs à la fois et mêle leurs résultats.
     *
     * Un moteur en échec est ignoré tant qu'un autre répond.
     *
     * @param {string[]} fournisseurs - Clés de MOTEURS, au moins une.
     * @param {?string} cle - Clé de l'utilisateur, pour Google ou Mojeek.
     * @param {string} question - Texte cherché.
     * @param {AbortSignal} [signal] - Pour annuler avec la question.
     * @returns {Promise<Array<Object>>} NOMBRE résultats au plus.
     */
    async chercherPartout(fournisseurs, cle, question, signal) {
        const reponses = await Promise.allSettled(fournisseurs.map(f => this.chercher(f, cle, question, signal)));
        const listes = reponses.filter(r => r.status === 'fulfilled').map(r => r.value);
        if (!listes.length) {
            throw reponses[0].reason;
        }
        /* Un résultat par moteur à tour de rôle, NOMBRE en tout. */
        const meles = [];
        for (let rang = 0; meles.length < this.NOMBRE && listes.some(l => l[rang]); rang++) {
            meles.push(...listes.map(l => l[rang]).filter(Boolean));
        }
        return meles.slice(0, this.NOMBRE);
    },

    /**
     * Interroge le moteur choisi.
     *
     * Mojeek refuse une clé par un code 200, un `status` en clair et aucun
     * résultat ; Google répond un code d'erreur et un message.
     *
     * @param {string} fournisseur - Clé de MOTEURS.
     * @param {?string} cle - Clé de l'utilisateur, inutile sauf chez Google et Mojeek.
     * @param {string} question - Texte cherché.
     * @param {AbortSignal} [signal] - Pour annuler avec la question.
     * @returns {Promise<Array<Object>>} Résultats du moteur.
     */
    async chercher(fournisseur, cle, question, signal) {
        const moteur = this.MOTEURS[fournisseur] || {};
        if (moteur.wiki) {
            return this.chercherMediaWiki(fournisseur, question, signal);
        }
        if (moteur.adresse) {
            return this.chercherBase(moteur, question, signal);
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
                || t('recherche.moteur-injoignable', { nom: moteur.nom || fournisseur, status: reponse.status }));
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
     * @param {string} nom - Nom du site, pour les messages d'erreur.
     * @returns {Promise<Object>} Corps de la réponse.
     */
    async interroger(adresse, signal, nom) {
        const reponse = await fetch(adresse, { signal: signal });
        const corps = await reponse.json().catch(() => ({}));
        if (!reponse.ok) {
            throw new Error(t('recherche.moteur-injoignable', { nom: nom, status: reponse.status }));
        }
        if (corps.error) {
            throw new Error(corps.error.info || t('recherche.moteur-refus', { nom: nom }));
        }
        return corps;
    },

    /**
     * Requêtes à essayer, de la plus complète à la plus courte.
     *
     * Ces catalogues exigent que tous les mots soient présents, alors que le
     * modèle écrit une phrase : "population française 2024 INSEE estimation"
     * ne ramène rien là où "population française" ramène trois jeux de
     * données. On retire donc les mots les plus courts, qui portent le moins
     * de sens, en gardant l'ordre d'origine.
     *
     * @param {string} question - Texte cherché.
     * @returns {Array<string>} Requêtes à tenter dans l'ordre.
     */
    replis(question) {
        const mots = question.replace(/[?!"«»]/g, ' ').split(/\s+/).filter(Boolean);
        if (mots.length < 3) {
            return [mots.join(' ')];
        }
        const garder = (nombre) => [...mots.keys()]
            .sort((a, b) => mots[b].length - mots[a].length)
            .slice(0, nombre)
            .sort((a, b) => a - b)
            .map(rang => mots[rang])
            .join(' ');
        /* Un repli aussi long que la question referait la même requête. */
        const essais = [mots.join(' ')];
        for (const nombre of [3, 2, 1]) {
            if (nombre < mots.length) {
                essais.push(garder(nombre));
            }
        }
        return essais;
    },

    /**
     * Interroge une base JSON ouverte et rend ses résultats.
     *
     * Ces bases répondent sans clé et ouvrent CORS à tout le monde : seule
     * la forme de leur réponse les distingue, d'où le couple adresse/extraire.
     *
     * La requête est raccourcie tant qu'elle ne ramène rien, au plus quatre
     * essais : mieux vaut un résultat approchant que la réponse de mémoire.
     *
     * @param {Object} moteur - Entrée de MOTEURS portant un champ adresse, ou service de Services.TABLE.
     * @param {string} question - Texte cherché.
     * @param {AbortSignal} [signal] - Pour annuler avec la question.
     * @returns {Promise<Array<Object>>} Résultats { title, url, desc }.
     */
    async chercherBase(moteur, question, signal) {
        for (const essai of this.replis(question)) {
            const reponse = await fetch(moteur.adresse(essai, this.NOMBRE), { signal: signal });
            const corps = await reponse.json().catch(() => ({}));
            if (!reponse.ok) {
                throw new Error(t('recherche.moteur-injoignable', { nom: moteur.nom, status: reponse.status }));
            }
            const resultats = moteur.extraire(corps).filter(r => r.url).map(r => ({
                title: r.title || '',
                url: r.url,
                /* Internet Archive rend parfois la description en liste. */
                desc: (Array.isArray(r.desc) ? r.desc.join(' ') : (r.desc || '')).slice(0, this.TAILLE_RESUME)
            }));
            if (resultats.length) {
                return resultats;
            }
        }
        return [];
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
     * @param {string} fournisseur - Clé de MOTEURS portant un champ wiki.
     * @param {string} question - Texte cherché.
     * @param {AbortSignal} [signal] - Pour annuler avec la question.
     * @returns {Promise<Array<Object>>} Articles { title, url, desc }.
     */
    async chercherMediaWiki(fournisseur, question, signal) {
        const nom = this.MOTEURS[fournisseur].nom;
        /* origin=* : c'est ainsi que MediaWiki ouvre CORS aux appels anonymes. */
        const base = this.wiki(fournisseur) + '?action=query&format=json&origin=*&redirects=1';
        const trouves = await this.interroger(base + '&list=search&srlimit=' + this.ARTICLES
            + '&srsearch=' + encodeURIComponent(question), signal, nom);
        const titres = ((trouves.query && trouves.query.search) || []).map(r => r.title);
        const corps = await Promise.all(titres.map(titre => this.interroger(base
            + '&prop=extracts|info|revisions&inprop=url&explaintext=1'
            + '&rvprop=content&rvslots=main&rvsection=0'
            + '&titles=' + encodeURIComponent(titre), signal, nom)));
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
     * Numérote les résultats pour que le modèle les cite : [1], [2]...
     *
     * Les numéros courent sur toute la réponse, plusieurs recherches
     * comprises, et une page déjà rencontrée garde le sien : le modèle ne
     * doit pas citer deux numéros pour la même page.
     *
     * @param {Array<Object>} resultats - Résultats du moteur.
     * @param {Array<Object>} faites - Recherches déjà faites pour cette réponse.
     * @returns {Array<Object>} Résultats { numero, titre, url, extrait, connue }.
     */
    numeroter(resultats, faites) {
        const vues = faites.reduce((liste, r) => liste.concat(r.sources || []), []);
        /* Mojeek dit url et desc, Google dit link et snippet. */
        return resultats.filter(r => r.url || r.link).map((r) => {
            const url = r.url || r.link;
            /* Un extrait Wikipédia tient sur plusieurs lignes : une ligne par résultat. */
            const extrait = (r.desc || r.snippet || '').replace(/\s+/g, ' ').trim();
            const deja = vues.find(s => s.url === url);
            if (deja) {
                return { numero: deja.numero, titre: deja.titre, url: url, extrait: extrait, connue: true };
            }
            const source = { numero: vues.length + 1, titre: r.title || url, url: url };
            vues.push(source);
            return { ...source, extrait: extrait, connue: false };
        });
    },

    /**
     * Met les résultats numérotés en texte pour le modèle.
     *
     * @param {Array<Object>} numerotes - Résultats rendus par numeroter.
     * @returns {string} Une ligne par résultat, vide s'il n'y en a aucun.
     */
    formater(numerotes) {
        return numerotes
            .map(r => '[' + r.numero + '] ' + r.titre + ' (' + r.url + ') : ' + r.extrait)
            .join('\n');
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Recherche;
    globalThis.Recherche = Recherche;
    require('./recherche/commons.js');
    require('./recherche/extraits.js');
}
