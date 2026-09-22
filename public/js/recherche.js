/*
 * recherche.js
 * Recherche documentaire, proposée au modèle comme un outil.
 *
 * Le modèle reçoit la définition de l'outil et décide lui-même s'il
 * cherche. Ses appels sont exécutés ici, puis les résultats lui sont
 * renvoyés pour qu'il rédige sa réponse (function calling, comme
 * albert-atelier le fait pour l'OCR).
 *
 * Neuf moteurs, les seuls testés qui acceptent un appel direct du
 * navigateur. Sept répondent sans clé. Wikipédia, par défaut, et Vikidia
 * rendent le texte des articles ; les cinq catalogues n'acceptent que des
 * mots-clés. Google et Mojeek demandent une clé, qui voyage dans l'adresse
 * comme leurs API la lisent, et ne rendent que de courts extraits.
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
        'data-gouv': {
            nom: 'data.gouv.fr',
            adresse: (q, n) => 'https://www.data.gouv.fr/api/1/datasets/?page_size=' + n
                + '&q=' + encodeURIComponent(q),
            extraire: (corps) => (corps.data || [])
                .map(d => ({ title: d.title, url: d.page, desc: d.description }))
        },
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
     * @param {string} [fournisseur] - Clé de MOTEURS ; sans elle, pas de consigne de famille.
     * @returns {Object} Entrée du champ tools.
     */
    outil(fournisseur) {
        const moteur = this.MOTEURS[fournisseur];
        const catalogue = Boolean(moteur && moteur.adresse);
        return {
            type: 'function',
            function: {
                name: 'recherche_web',
                description: t('recherche.description', { nom: (moteur || this.MOTEURS.wikipedia).nom })
                    + (catalogue ? ' ' + t('recherche.description-catalogue') : ''),
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
            return this.chercherBase(fournisseur, question, signal);
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
     * @param {string} nom - Nom du site, pour les messages d'erreur.
     * @returns {Promise<Object>} Corps de la réponse.
     */
    async interroger(adresse, signal, nom) {
        const reponse = await fetch(adresse, { signal: signal });
        const corps = await reponse.json().catch(() => ({}));
        if (!reponse.ok) {
            throw new Error(t('recherche.wiki-injoignable', { nom: nom, status: reponse.status }));
        }
        if (corps.error) {
            throw new Error(corps.error.info || t('recherche.wiki-refus', { nom: nom }));
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
     * @param {string} fournisseur - Clé de MOTEURS portant un champ adresse.
     * @param {string} question - Texte cherché.
     * @param {AbortSignal} [signal] - Pour annuler avec la question.
     * @returns {Promise<Array<Object>>} Résultats { title, url, desc }.
     */
    async chercherBase(fournisseur, question, signal) {
        const moteur = this.MOTEURS[fournisseur];
        for (const essai of this.replis(question)) {
            const reponse = await fetch(moteur.adresse(essai, this.NOMBRE), { signal: signal });
            const corps = await reponse.json().catch(() => ({}));
            if (!reponse.ok) {
                throw new Error(t('recherche.moteur-injoignable', { status: reponse.status }));
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
        const resume = this.resumeUtile(blocs[0], note);
        const sections = blocs.slice(1).sort((a, b) => note(b) - note(a));
        if (!sections.length || !note(sections[0])) {
            return resume;
        }
        return resume + '\n' + sections[0].slice(0, this.TAILLE_SECTION);
    },

    /**
     * Résumé réduit à sa première phrase et à celles qui répondent.
     *
     * Couper les premiers caractères perdait le fait cherché : dans
     * "Démographie de la France", le nombre d'habitants arrive au millier de
     * caractères, après la définition du mot démographie et la présentation
     * de l'Insee. Les paragraphes y pèsent 800 caractères, soit plus que la
     * place disponible : le tri se fait donc phrase par phrase.
     *
     * @param {string} bloc - Résumé de l'article, avant le premier titre.
     * @param {function(string): number} note - Pertinence d'une phrase.
     * @returns {string} Phrases retenues, dans l'ordre du texte.
     */
    resumeUtile(bloc, note) {
        const phrases = bloc.split(/\n|(?<=[.!?])\s+/).filter(p => p.trim());
        if (!phrases.length) {
            return '';
        }
        /* La première phrase dit de quoi parle l'article : elle reste. */
        const gardes = new Set([0]);
        let reste = this.TAILLE_RESUME - phrases[0].length;
        /* ponytail : classement à la densité, mots trouvés rapportés à la
           longueur. Une phrase courte qui donne le chiffre passe ainsi devant
           une longue phrase institutionnelle citant les mêmes mots. Compter
           les occurrences plutôt que les mots distincts si cela ne suffit pas. */
        const densite = (p) => note(p) / p.length;
        const classes = [...phrases.keys()].sort((a, b) => densite(phrases[b]) - densite(phrases[a]));
        for (const rang of classes) {
            if (reste <= 0) {
                break;
            }
            if (!gardes.has(rang) && note(phrases[rang])) {
                gardes.add(rang);
                reste -= phrases[rang].length;
            }
        }
        return [...gardes].sort((a, b) => a - b).map(rang => phrases[rang]).join(' ');
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

/**
 * Exécute un appel d'outil demandé par le modèle.
 *
 * Un échec de recherche est rendu au modèle en texte : il répond alors
 * sans les résultats, au lieu de voir la conversation s'arrêter.
 *
 * @param {Object} appel - Entrée de tool_calls renvoyée par le modèle.
 * @param {AbortSignal} signal - Pour annuler avec la question.
 * @param {Array<Object>} faites - Recherches { mots, moteur, sources }, complétées ici pour la trace sous la réponse.
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
        const numerotes = Recherche.numeroter(resultats, faites);
        /* Une page déjà citée garde son numéro : elle n'entre pas deux fois. */
        faites.push({
            mots: mots,
            moteur: reglages.fournisseur,
            sources: numerotes.filter(r => !r.connue).map(r => ({ numero: r.numero, titre: r.titre, url: r.url }))
        });
        return Recherche.formater(numerotes) || t('recherche.aucun-resultat');
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
    const moteur = Recherche.MOTEURS[reglages.fournisseur] || {};
    const source = Recherche.sansCle(reglages.fournisseur)
        ? t('recherche.source-base', { nom: moteur.nom })
        : t('recherche.source-web');
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
    if (!reglages.recherche || (!Recherche.sansCle(reglages.fournisseur) && !reglages.cleRecherche)) {
        return Albert.repondre(cle, requete, signal);
    }
    const messages = [...requete.messages];
    /* Recherches faites, rendues avec la réponse pour la trace sous la bulle. */
    const faites = [];
    /* Extraits trouvés, pour le dernier tour. */
    const extraits = [];
    for (let tour = 0; tour < TOURS_MAX; tour++) {
        let reponse;
        try {
            reponse = await Albert.repondre(cle, {
                ...requete,
                messages: avecRappel(messages),
                tools: [Recherche.outil(reglages.fournisseur)],
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
