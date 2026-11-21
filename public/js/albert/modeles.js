/*
 * albert/modeles.js
 * Modèles d'Albert : liste demandée à /v1/models, liste de secours, nom et logo
 * de chaque modèle, réglage top-k et choix d'un modèle qui lit les images.
 *
 * reglages.js affiche ces modèles dans les réglages ; app.js choisit celui qui répond.
 * Complète l'objet Albert d'albert.js, chargé avant lui.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Albert, {
    /*
    Liste de secours si /v1/models ne répond pas (relevée le 2 octobre 2026).
    Albert peut changer le modèle derrière un alias : /v1/models fait foi.
    */
    MODELES: [
        { id: 'openweight-code', nom: 'Code', reel: 'qwen3-coder-30b-A3b-instruct', type: 'texte', contexte: 262144 },
        { id: 'deepseek-v4-flash-0731', nom: 'DeepSeek V4 Flash', reel: 'deepseek-ai/DeepSeek-V4-Flash-0731', type: 'texte', contexte: 131072 },
        { id: 'gemma-4-31b-it', nom: 'Gemma 4 31B', reel: 'google/gemma-4-31B-it', type: 'texte-images', contexte: 262144 },
        { id: 'openweight-large', nom: 'Large', reel: 'openai/gpt-oss-120b', type: 'texte', contexte: 131072 },
        { id: 'openweight-medium', nom: 'Medium', reel: 'mistral-small-3-2-24b-instruct-2506', type: 'texte-images', contexte: 128000 },
        { id: 'openweight-small', nom: 'Small', reel: 'ministral-3-8b-instruct-2512', type: 'texte-images', contexte: 262144 }
    ],

    /** Modèles préférés pour répondre à une question avec image, quand le modèle choisi ne les lit pas. */
    MODELES_IMAGES: ['gemma-4-31b-it', 'openweight-medium'],

    /**
     * Demande la liste des modèles à Albert.
     *
     * @param {?string} [cle] - En ligne, clé à essayer ; celle enregistrée par défaut.
     * @returns {Promise<Object[]>} Les modèles de conversation, triés.
     * @throws {Error} Si Albert refuse la requête ; err.status donne le code HTTP.
     */
    async modeles(cle = this.cle) {
        const res = await fetch(this.BASE + '/models', {
            headers: this.entetes({}, cle),
            signal: AbortSignal.timeout(20000)
        });
        const corps = await res.json().catch(() => null);
        if (!res.ok) {
            const erreur = new Error(this.messageErreur(res.status, corps));
            erreur.status = res.status;
            throw erreur;
        }
        return this.normaliserModeles((corps && corps.data) || []);
    },

    /**
     * Garde les modèles de conversation, sans OCR, triés par alias.
     *
     * Le type est dans "type", ou dans "model_type" derrière certains proxys.
     * Le modèle réel est l'alias "éditeur/modèle" (ex. openai/gpt-oss-120b) :
     * Albert met un nom court dans "id" (gpt-oss-120b), un relais comme
     * llm-proxy y met l'alias (openweight-large). Sans alias de cette forme,
     * "id" sert de repli.
     *
     * @param {Object[]} liste - Modèles bruts renvoyés par /v1/models.
     * @returns {Object[]} Modèles { id, nom, reel, type, contexte }.
     */
    normaliserModeles(liste) {
        return liste
            .filter(m => ['text-generation', 'image-text-to-text'].includes(m.model_type || m.type))
            .filter(m => ![m.id, ...(m.aliases || [])].some(n => /ocr/i.test(n)))
            .map(m => {
                const alias = (m.aliases || []).find(a => a.startsWith('openweight-')) || m.id;
                const connu = this.MODELES.find(c => c.id === alias);
                /* Albert dit text-generation pour tous (constaté le 10/11/2026) : input_modalities
                   viendra avec OpenGateLLM #641, la liste de secours sait qui lit les images en attendant. */
                const images = (m.model_type || m.type) === 'image-text-to-text'
                    || (m.input_modalities || []).includes('image')
                    || (connu && connu.type === 'texte-images');
                return {
                    id: alias,
                    nom: connu ? connu.nom : this.nomCourt(alias),
                    reel: (m.aliases || []).find(a => a.includes('/')) || m.id,
                    type: images ? 'texte-images' : 'texte',
                    contexte: m.max_context_length || (connu && connu.contexte) || null
                };
            })
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    },

    /* Logos repris de ia.numerique.gouv.fr, reconnus au nom du modèle réel. */
    EDITEURS: [
        ['qwen', /qwen/i],
        ['deepseek', /deepseek/i],
        ['openai', /openai|gpt|whisper/i],
        ['mistral', /mistral|ministral|magistral|codestral|devstral|pixtral/i],
        ['gemma', /gemma|google/i],
        ['baai', /baai|bge/i],
        ['lighton', /lighton/i]
    ],

    /**
     * Logo de l'éditeur d'un modèle, ou logo neutre si l'éditeur est inconnu.
     *
     * @param {string} reel - Nom du modèle réel, ex. "openai/gpt-oss-120b".
     * @returns {string} Chemin de l'image.
     */
    logoEditeur(reel) {
        const trouve = this.EDITEURS.find(([, motif]) => motif.test(reel || ''));
        if (!trouve) {
            return 'images/editeurs/inconnu.svg';
        }
        return 'images/editeurs/' + trouve[0] + (trouve[0] === 'lighton' ? '.jpg' : '.png');
    },

    /**
     * Nom d'affichage d'un alias inconnu : openweight-code-2 donne "Code 2".
     *
     * @param {string} alias - Alias du modèle.
     * @returns {string} Nom court.
     */
    nomCourt(alias) {
        return alias.replace(/^openweight-/, '').split('-')
            .map(mot => mot.charAt(0).toUpperCase() + mot.slice(1)).join(' ');
    },

    /**
     * Champ top_k d'une requête : le modèle tire le mot suivant parmi les k plus probables.
     *
     * @param {number} k - Position du curseur.
     * @returns {Object} { top_k }, ou rien quand le curseur est sur "sans limite".
     */
    topK(k) {
        return k < this.TOP_K_SANS_LIMITE ? { top_k: k } : {};
    },

    /**
     * Clé de la phrase qui décrit le top-k choisi : un mot, k mots ou tous.
     *
     * @param {number} k - Position du curseur.
     * @returns {string} Clé du dictionnaire.
     */
    cleAideTopK(k) {
        if (k >= this.TOP_K_SANS_LIMITE) {
            return 'reglages.aide-top-k-tous';
        }
        return k === 1 ? 'reglages.aide-top-k-un' : 'reglages.aide-top-k';
    },

    /**
     * Modèle qui répond à une question accompagnée d'une image.
     *
     * @param {Object[]} modeles - Modèles disponibles.
     * @param {Object} actuel - Modèle choisi dans les réglages.
     * @returns {?Object} Le modèle choisi s'il lit les images, sinon le premier de MODELES_IMAGES, ou null.
     */
    modeleImages(modeles, actuel) {
        const lecteurs = modeles.filter(m => m.type === 'texte-images');
        if (lecteurs.includes(actuel)) {
            return actuel;
        }
        const prefere = this.MODELES_IMAGES.map(id => lecteurs.find(m => m.id === id)).find(Boolean);
        return prefere || lecteurs[0] || null;
    }
});
