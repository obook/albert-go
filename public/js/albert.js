/*
 * albert.js
 * Client de l'API Albert.
 *
 * Sur un serveur d'Albert Go (serveur/), les requêtes passent par lui et il ajoute
 * sa clé. Sur Pages, sans serveur, elles passent par le relais n8n avec la clé de
 * l'utilisateur : Albert ne gère pas CORS.
 * Aucun accès au DOM, pour pouvoir être testé sous Node (tests/albert.test.js).
 * Les textes visibles et ceux envoyés au modèle viennent de langues/*.js (t).
 * Utilisé par stockage.js, reglages.js, piece-jointe.js et app.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const Albert = {
    /** Version en ligne (Pages) : pas de serveur d'Albert Go pour écrire serveur.js. */
    EN_LIGNE: typeof SERVEUR === 'undefined',

    /** Clé de l'utilisateur, en ligne seulement (cle.js) ; un serveur garde la sienne. */
    cle: null,

    /** Relais n8n de la version en ligne. */
    RELAIS: 'https://n8n.incubateur.education.gouv.fr/webhook/albert-go/v1',

    /** Adresse publique de la version en ligne, affichée dans la boîte "Partager". */
    URL_PUBLIQUE: 'https://obook.github.io/albert-go/',

    /* Même liste que allowedOrigins dans le workflow n8n. */
    ORIGINES: ['https://booklageolivier.forge.apps.education.fr', 'https://obook.github.io', 'http://localhost:8642'],

    /** Attente avant de vérifier que le relais répond encore (via /stats). */
    SONDE_MS: 10000,

    /** Adresse des appels : le relais n8n en ligne, sinon le serveur d'Albert Go. */
    get BASE() {
        return this.EN_LIGNE ? this.RELAIS : '/v1';
    },

    /**
     * Albert est joignable : par un serveur ou en ligne avec une clé.
     *
     * @returns {boolean} true si la page peut interroger Albert.
     */
    pret() {
        return !this.EN_LIGNE || !!this.cle;
    },

    /**
     * En-têtes d'une requête, avec la clé de l'utilisateur en ligne.
     *
     * @param {Object} [autres] - Autres en-têtes.
     * @param {?string} [cle] - Clé à envoyer, celle enregistrée par défaut.
     * @returns {Object} En-têtes de fetch.
     */
    entetes(autres = {}, cle = this.cle) {
        return this.EN_LIGNE && cle ? { ...autres, 'Authorization': 'Bearer ' + cle } : autres;
    },

    /**
     * Texte propre à la version en ligne s'il en existe un (clé suivie de -en-ligne).
     *
     * @param {string} cle - Clé du texte.
     * @returns {string} Le texte traduit.
     */
    texte(cle) {
        return t(this.EN_LIGNE ? cle + '-en-ligne' : cle);
    },

    /** Délai maximal d'une réponse, en millisecondes. */
    DELAI_MS: 120000,

    /** Nombre de questions gardées pour les flèches de la saisie. */
    HISTORIQUE_MAX: 30,

    /** Nombre de conversations gardées dans le menu. */
    CONVERSATIONS_MAX: 10,

    /** Nombre de projets gardés dans le menu, comptés à part des conversations. */
    PROJETS_MAX: 10,

    /** Longueur maximale du nom d'un projet. */
    NOM_PROJET_MAX: 40,

    /** Nombre de versions gardées pour un document d'Imprimerie. */
    VERSIONS_MAX: 10,

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

    /*
    Outils du menu, repris d'albert-droid. Reformuler et Traduire envoient
    une seule demande, sans les échanges précédents, avec leur consigne système.
    Le nom et l'invite sont dans langues/*.js ; la consigne est le fichier de
    public/prompts/<langue>/ (modules.js).
    */
    /* fil : conversation envoyée, outils et recherche. sources : fichiers de la
       bibliothèque cochés, envoyés avec chaque question. documents : module
       Imprimerie (un document en versions). complement : suite de la consigne. */
    OUTILS: {
        discuter: { consigne: 'discuter.txt', fil: true, sources: true },
        reformuler: { consigne: 'reformuler.txt' },
        traduire: { consigne: 'traduire.txt' },
        corriger: { consigne: 'corriger.txt' },
        rediger: { consigne: 'rediger.txt', revue: 'revoir.txt' },
        projet: { consigne: 'discuter.txt', complement: 'projet.txt', fil: true, sources: true, documents: true }
    },

    /** Part du contexte laissée aux documents d'un projet : le reste sert à la conversation et à la réponse. */
    PART_DOCUMENTS: 0.6,

    /** Caractères par jeton, estimation prudente pour le français. */
    CARACTERES_PAR_JETON: 3,

    /** Plafond des documents d'un projet quand le contexte du modèle est inconnu, en caractères. */
    DOCUMENTS_MAX: 200000,

    /* Passages, vecteurs et citations : albert/passages.js. */

    /** Rédiger : notes plus courtes non envoyées, pour ne pas payer une requête par mot. */
    LONGUEUR_MIN_NOTES: 10,

    /** Langue source qui laisse le modèle détecter la langue du texte. */
    LANGUE_AUTO: 'auto',

    /** Langues proposées par Traduire (liste d'albert-droid), en codes ISO 639-1. */
    LANGUES: ['fr', 'en', 'de', 'es', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ar', 'la'],

    /* Mots outils les plus courants : de quoi reconnaître la langue d'une réponse de Chat. */
    MOTS_OUTILS: {
        fr: 'le la les des est et une un du de que qui dans pour pas vous nous je il au sur avec ce cette sont mais ou votre'.split(' '),
        en: 'the and is are of to in that it you for with this be was have not on will i would an my your'.split(' '),
        de: 'der die das und ist nicht ich sie mit zu den ein eine einen auf für es wir von dem'.split(' '),
        es: 'el la los las de que y es en un una por con para no se del al lo pero su como muy está'.split(' '),
        it: 'il di che è e la per un una non sono con del della gli le ho mi'.split(' '),
        pt: 'o a os as de que e é não um uma para com do da em no na você'.split(' '),
        nl: 'de het een en is van ik je niet dat op te zijn met voor wij u er'.split(' ')
    },

    /** Réglages conseillés, aussi utilisés au premier lancement. */
    CONSEILLES: { modele: 'openweight-large', temperature: 0.2, topK: 40, echanges: 11 },

    /** Position du curseur de contexte qui veut dire "toute la conversation". */
    ECHANGES_TOUS: 11,

    /** Albert accepte de 0 à 2 pour la conversation ; au-delà de 1, le texte déraille. */
    TEMPERATURE_MAX: 2,

    /** Position du curseur top-k qui veut dire "sans limite" : rien n'est envoyé. */
    TOP_K_SANS_LIMITE: 50,

    /* Plafond retiré le 15 novembre 2026 : à 1,6, toute réponse développée était coupée (finish_reason "length").
       Gardé en réserve si un modèle qui déraille ne s'arrête plus. */
    // JETONS_EXPERIENCE: 600,

    /* Modèle qui lit les images (annuaire BidouIAge, 1er août 2026). */
    MODELE_VISION: 'openweight-medium',

    /** Modèles préférés pour répondre à une question avec image, quand le modèle choisi ne les lit pas. */
    MODELES_IMAGES: ['gemma-4-31b-it', 'openweight-medium'],

    /** Modèle de transcription audio (whisper). */
    MODELE_AUDIO: 'openweight-audio',

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
     * En ligne, appels sur 90 jours (clé acceptée par Albert), comptés par le relais.
     *
     * @returns {Promise<{total: number, parHeure: number}>} Somme des jours et moyenne horaire depuis le premier jour.
     */
    async appels() {
        const res = await fetch(this.RELAIS.replace('/v1', '/stats'), { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
            throw new Error(res.status);
        }
        const jours = await res.json();
        const total = Object.values(jours).reduce((n, jour) => n + jour.appels, 0);
        /* ponytail: moyenne depuis minuit UTC du premier jour, compteur par heure si le rythme récent compte. */
        const debut = Date.parse(Object.keys(jours).sort()[0] + 'T00:00:00Z');
        const heures = Math.max(1, (Date.now() - debut) / 3600000);
        return { total, parHeure: total ? total / heures : 0 };
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

    /* Plafonnait la réponse d'une requête dont la température dépasse 1. Retiré, voir JETONS_EXPERIENCE. */
    // plafonnee(requete) {
    //     return requete.temperature > 1 ? { max_tokens: this.JETONS_EXPERIENCE, ...requete } : requete;
    // },

    /**
     * Envoie une requête de conversation à Albert.
     *
     * @param {Object} requete - Corps au format chat/completions (model, messages...).
     * @param {AbortSignal} annulation - Signal du bouton Arrêter.
     * @returns {Promise<{texte: string, usage: ?Object, coupee: boolean}>} Réponse, consommation, et coupee si la longueur l'a arrêtée.
     * @throws {Error} Si Albert refuse la requête, ou si elle est annulée.
     */
    async repondre(requete, annulation) {
        /* En ligne, relais bloqué : Scalingo ne rend son 504 sans CORS qu'après 60 s.
           Si /stats ne répond pas non plus, inutile d'attendre. */
        const sonde = new AbortController();
        const minuterie = this.EN_LIGNE ? setTimeout(() => {
            this.appels().catch(() => sonde.abort(new Error(this.texte('erreur.relais-hs'))));
        }, this.SONDE_MS) : null;
        let res, corps;
        try {
            res = await fetch(this.BASE + '/chat/completions', {
                method: 'POST',
                headers: this.entetes({ 'Content-Type': 'application/json' }),
                // body: JSON.stringify(this.plafonnee(requete)),
                body: JSON.stringify(requete),
                signal: AbortSignal.any([annulation, sonde.signal, AbortSignal.timeout(this.DELAI_MS)])
            });
            corps = await res.json().catch(() => null);
        } finally {
            clearTimeout(minuterie);
        }
        /* Sonde échouée pendant la lecture du corps, avalée par le catch du json. */
        if (sonde.signal.aborted) {
            throw sonde.signal.reason;
        }
        if (!res.ok) {
            const erreur = new Error(this.messageErreur(res.status, corps));
            erreur.status = res.status;
            throw erreur;
        }
        /* Un relais en panne peut rendre un corps vide avec un code 200. */
        const choix = corps && corps.choices && corps.choices[0];
        if (!choix || !choix.message) {
            throw new Error(t('erreur.reponse-illisible'));
        }
        this.noterEmpreinte(corps.usage);
        /* message complet : il porte les tool_calls. content est null quand le
           modèle n'appelle qu'un outil, d'où le '' pour l'affichage. */
        return { texte: choix.message.content || '', message: choix.message, usage: corps.usage || null, coupee: choix.finish_reason === 'length' };
    },

    /**
     * Demande au modèle de corriger un schéma Mermaid refusé.
     *
     * @param {string} modele - Alias du modèle.
     * @param {string} code - Code refusé.
     * @param {string} erreur - Message de Mermaid.
     * @returns {Object} Corps pour repondre.
     */
    demandeCorrectionMermaid(modele, code, erreur) {
        return {
            model: modele,
            temperature: 0,
            messages: [
                { role: 'system', content: t('mermaid.corriger') },
                { role: 'user', content: code + '\n\n' + erreur }
            ]
        };
    },

    /**
     * Code Mermaid d'une réponse, avec ou sans bloc ```mermaid autour.
     *
     * @param {string} texte - Réponse du modèle.
     * @returns {string} Code seul.
     */
    codeMermaid(texte) {
        const bloc = texte.match(/```[a-z]*\n([\s\S]*?)```/i);
        return (bloc ? bloc[1] : texte).trim();
    },

    /**
     * Part du contexte occupée par le dernier échange.
     *
     * @param {?Object} usage - Champ usage de la dernière réponse.
     * @param {?number} contexte - Taille du contexte du modèle, en jetons.
     * @returns {?number} Pourcentage entre 0 et 100, ou null si inconnu.
     */
    occupation(usage, contexte) {
        if (!usage || !contexte) {
            return null;
        }
        const jetons = usage.total_tokens || ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0));
        return Math.min(100, Math.round(jetons / contexte * 100));
    },

    /* Empreinte rendue par Albert, cumulée depuis le chargement de la page. */
    empreinte: { kwh: 0, kgco2: 0, appels: 0, renseignes: 0, lus: 0, ecrits: 0, depuis: new Date() },

    /* Énergie d'une batterie de smartphone, en Wh : 4 000 mAh à 3,85 V. */
    TELEPHONE_WH: 15,

    /**
     * Ajoute l'empreinte d'un appel au cumul (valeur haute si Albert donne une fourchette).
     *
     * @param {?Object} usage - Champ usage de la réponse.
     */
    noterEmpreinte(usage) {
        /* Albert renvoie usage.impacts (nombres seuls) ; l'ancien usage.carbon donnait {min, max}. */
        const carbone = usage && (usage.impacts || usage.carbon);
        const haut = (x) => (x && typeof x === 'object' ? x.max : x);
        const kwh = carbone && haut(carbone.kWh);
        const kgco2 = carbone && haut(carbone.kgCO2eq);
        this.empreinte.appels++;
        this.empreinte.lus += (usage && usage.prompt_tokens) || 0;
        this.empreinte.ecrits += (usage && usage.completion_tokens) || 0;
        /* Certains appels n'en portent pas : ils comptent, sans chiffre. */
        if (typeof kwh === 'number' && typeof kgco2 === 'number') {
            this.empreinte.kwh += kwh;
            this.empreinte.kgco2 += kgco2;
            this.empreinte.renseignes++;
        }
    },

    /**
     * Grandeur lisible : l'unité, son millième sous 1, son millier au-dessus de 999.
     *
     * @param {number} valeur - Valeur dans l'unité (Wh, g CO2eq).
     * @param {string} unite - Unité, préfixée de "m" ou de "k".
     * @param {string} langue - Langue des nombres.
     * @returns {string} Par exemple "0,99 mWh" ou "1,2 kWh".
     */
    petiteUnite(valeur, unite, langue) {
        /* Arrondi avant le choix : 999,6 Wh s'écrirait sinon "1 000 Wh". */
        const arrondi = Number(valeur.toPrecision(2));
        const [nombre, prefixe] = arrondi < 1 ? [valeur * 1000, 'm'] : arrondi >= 1000 ? [valeur / 1000, 'k'] : [valeur, ''];
        /* Insécables : le nombre et son unité ne se séparent pas en fin de ligne. */
        return (nombre.toLocaleString(langue, { maximumSignificantDigits: 2 }) + ' ' + prefixe + unite).replace(/ /g, '\u00a0');
    },

    /**
     * Nombre de jetons, en milliers (k) au-dessus de 999.
     *
     * @param {number} n - Nombre de jetons.
     * @param {string} langue - Langue des nombres.
     * @returns {string} Par exemple "12,4 k".
     */
    jetons(n, langue) {
        return n > 999 ? (n / 1000).toLocaleString(langue, { maximumFractionDigits: 1 }) + '\u00a0k' : n.toLocaleString(langue);
    },

    /**
     * La même énergie en recharges de téléphone, en pourcentage sous une recharge.
     *
     * @param {number} kwh - Énergie, en kWh.
     * @returns {string} Par exemple "Soit 2,8 % d'une recharge de téléphone".
     */
    recharge(kwh) {
        const part = kwh * 1000 / this.TELEPHONE_WH;
        if (part < 1) {
            return t('empreinte.telephone-part', { part: part.toLocaleString(I18n.langue, { style: 'percent', maximumSignificantDigits: 2 }) });
        }
        return tn('empreinte.telephone', part, { n: part.toLocaleString(I18n.langue, { maximumFractionDigits: 1 }) });
    },

    /**
     * Fait lire une image par le modèle de vision.
     *
     * @param {string} dataUrl - Image en data URL (JPEG).
     * @param {AbortSignal} annulation - Signal pour abandonner la lecture.
     * @returns {Promise<string>} Texte trouvé dans l'image.
     */
    transcrire(dataUrl, annulation) {
        return this.repondre({
            model: this.MODELE_VISION,
            temperature: 0,
            messages: [{ role: 'user', content: [
                { type: 'text', text: t('demande.image') },
                { type: 'image_url', image_url: { url: dataUrl } }
            ] }]
        }, annulation).then(r => r.texte);
    },

    /**
     * Texte des segments de diarized_json : un tour de parole par ligne s'il y a plusieurs voix.
     *
     * Le champ text de la réponse colle alors les phrases sans espace : on repart des segments.
     *
     * @param {Array<{speaker: ?string, text: string}>} [segments] - Segments de la réponse.
     * @returns {string} Vide sans segments ; d'un seul bloc pour une voix ou un locuteur inconnu.
     */
    texteParLocuteur(segments) {
        if (!Array.isArray(segments)) {
            return '';
        }
        const locuteurs = [...new Set(segments.map(s => s.speaker))];
        if (locuteurs.length < 2 || segments.some(s => !s.speaker)) {
            return segments.map(s => s.text.trim()).join(' ');
        }
        const tours = [];
        for (const { speaker, text } of segments) {
            const dernier = tours.at(-1);
            if (dernier && dernier.speaker === speaker) {
                dernier.texte += ' ' + text.trim();
            } else {
                tours.push({ speaker, texte: text.trim() });
            }
        }
        return tours.map(tour => t('audio.tour', { n: locuteurs.indexOf(tour.speaker) + 1, texte: tour.texte })).join('\n');
    },

    /**
     * Fait transcrire un enregistrement par le modèle audio.
     *
     * @param {Blob} audio - Enregistrement MP3 ou WAV.
     * @param {string} nom - Nom du fichier, avec son extension.
     * @param {AbortSignal} annulation - Signal pour abandonner la lecture.
     * @returns {Promise<string>} Texte entendu, par locuteur s'il y a plusieurs voix.
     * @throws {Error} Si Albert refuse l'enregistrement.
     */
    async transcrireAudio(audio, nom, annulation) {
        const formulaire = new FormData();
        formulaire.append('file', audio, nom);
        formulaire.append('model', this.MODELE_AUDIO);
        formulaire.append('response_format', 'diarized_json');
        const res = await fetch(this.BASE + '/audio/transcriptions', {
            method: 'POST',
            headers: this.entetes(),
            body: formulaire,
            signal: AbortSignal.any([annulation, AbortSignal.timeout(this.DELAI_MS)])
        });
        const corps = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(this.messageErreur(res.status, corps));
        }
        if (!corps || typeof corps.text !== 'string') {
            throw new Error(t('erreur.reponse-illisible'));
        }
        return this.texteParLocuteur(corps.segments) || corps.text;
    },

    /**
     * Variantes d'un fichier d'exemples (public/exemples) : blocs séparés par une ligne vide.
     *
     * @param {string} texte - Contenu du fichier.
     * @returns {string[]} Variantes, sans les espaces autour.
     */
    variantes(texte) {
        return texte.replace(/\r/g, '').split(/\n\s*\n/).map(v => v.trim()).filter(Boolean);
    },

    /**
     * Variante tirée au hasard, différente de la précédente quand c'est possible.
     *
     * @param {string[]} liste - Variantes (au moins une).
     * @param {?string} precedente - Variante proposée au dernier clic.
     * @returns {string} Variante choisie.
     */
    autreVariante(liste, precedente) {
        const autres = liste.length > 1 ? liste.filter(v => v !== precedente) : liste;
        return autres[Math.floor(Math.random() * autres.length)];
    },

    /**
     * Fichier WAV (PCM 16 bits, mono) à partir d'échantillons entre -1 et 1.
     *
     * @param {Float32Array} echantillons - Son mono.
     * @param {number} taux - Fréquence d'échantillonnage, en hertz.
     * @returns {ArrayBuffer} Contenu du fichier.
     */
    wav(echantillons, taux) {
        const vue = new DataView(new ArrayBuffer(44 + echantillons.length * 2));
        const texte = (position, mot) => [...mot].forEach((c, i) => vue.setUint8(position + i, c.charCodeAt(0)));
        texte(0, 'RIFF');
        vue.setUint32(4, 36 + echantillons.length * 2, true);
        texte(8, 'WAVEfmt ');
        vue.setUint32(16, 16, true);
        /* Format 1 (PCM), 1 canal, taux, octets par seconde, octets par échantillon, bits. */
        vue.setUint16(20, 1, true);
        vue.setUint16(22, 1, true);
        vue.setUint32(24, taux, true);
        vue.setUint32(28, taux * 2, true);
        vue.setUint16(32, 2, true);
        vue.setUint16(34, 16, true);
        texte(36, 'data');
        vue.setUint32(40, echantillons.length * 2, true);
        echantillons.forEach((x, i) => vue.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 0x7fff, true));
        return vue.buffer;
    },

    /**
     * Assemble la question et le contenu du fichier joint.
     *
     * @param {string} question - Texte saisi, éventuellement vide.
     * @param {?{nom: string, texte: string}} piece - Fichier joint, ou null.
     * @returns {string} Message à envoyer.
     */
    joindre(question, piece) {
        if (!piece) {
            return question;
        }
        const fichier = t('demande.fichier', { nom: piece.nom, texte: piece.texte });
        return (question ? question + '\n\n' : '') + fichier;
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
    },

    /**
     * Remplace la dernière question par la question et son image, pour un modèle qui lit les images.
     *
     * @param {Object[]} messages - Messages { role, content } à envoyer.
     * @param {string} question - Texte saisi, éventuellement vide.
     * @param {string} image - Image en data URL.
     * @returns {Object[]} Messages, le dernier portant l'image.
     */
    avecImage(messages, question, image) {
        const contenu = [{ type: 'image_url', image_url: { url: image } }];
        if (question) {
            contenu.unshift({ type: 'text', text: question });
        }
        return [...messages.slice(0, -1), { role: 'user', content: contenu }];
    },

    /**
     * Texte des sources cochées, mis à la suite de la consigne.
     *
     * @param {{nom: string, texte: string}[]} documents - Documents du projet.
     * @returns {string} Un bloc par document, ou '' sans document.
     */
    joindreDocuments(documents) {
        /* ponytail: documents envoyés en entier ; recherche dans les documents (RAG) s'ils dépassent le contexte. */
        return documents.map(d => t('demande.fichier', { nom: d.nom, texte: d.texte })).join('\n\n');
    },

    /**
     * Plafond du texte des documents d'un projet.
     *
     * @param {?number} contexte - Taille du contexte du modèle, en jetons.
     * @returns {number} Nombre de caractères au plus.
     */
    plafondDocuments(contexte) {
        /* ponytail: jetons estimés à 3 caractères ; compter avec le modèle si l'estimation trompe. */
        return contexte ? Math.floor(contexte * this.PART_DOCUMENTS * this.CARACTERES_PAR_JETON) : this.DOCUMENTS_MAX;
    },

    /**
     * Part du contexte occupée par les documents d'un projet.
     *
     * @param {{texte: string}[]} documents - Documents du projet.
     * @param {?number} contexte - Taille du contexte du modèle, en jetons.
     * @returns {?number} Pourcentage, au-delà de 100 si le modèle est trop petit ; null si le contexte est inconnu.
     */
    partDocuments(documents, contexte) {
        if (!contexte) {
            return null;
        }
        const caracteres = documents.reduce((somme, d) => somme + d.texte.length, 0);
        return Math.round(caracteres / this.CARACTERES_PAR_JETON / contexte * 100);
    },

    /**
     * Documents d'un projet augmentés d'un nouveau. Un document de même nom est remplacé.
     *
     * @param {{nom: string, texte: string}[]} documents - Documents actuels.
     * @param {{nom: string, texte: string}} nouveau - Document à ajouter.
     * @param {?number} contexte - Taille du contexte du modèle, en jetons.
     * @returns {?Object[]} Nouvelle liste, ou null si elle dépasse le plafond.
     */
    avecDocument(documents, nouveau, contexte) {
        const liste = [...documents.filter(d => d.nom !== nouveau.nom), nouveau];
        const total = liste.reduce((somme, d) => somme + d.texte.length, 0);
        return total > this.plafondDocuments(contexte) ? null : liste;
    },

    /**
     * Retire tout le gras d'un document en Markdown : titres, étiquettes, mots.
     *
     * Les modèles en mettent malgré la consigne ("### **Exercice 1**", "**Durée** : 1 h").
     * Les blocs de code et le code en ligne ne sont pas touchés.
     *
     * @param {string} texte - Document en Markdown.
     * @returns {string} Le même document, sans gras.
     */
    sansGras(texte) {
        let bloc = false;
        return texte.split('\n').map((ligne) => {
            if (/^\s*(```|~~~)/.test(ligne)) {
                bloc = !bloc;
                return ligne;
            }
            if (bloc) {
                return ligne;
            }
            /* Un morceau sur deux est du code en ligne, entre accents graves. */
            return ligne.split(/(`[^`]*`)/).map((morceau, rang) => (rang % 2
                ? morceau
                : morceau.replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2'))).join('');
        }).join('\n');
    },

    /**
     * Fichiers de la bibliothèque cochés pour un document, dans l'ordre de la bibliothèque.
     *
     * @param {{nom: string, texte: string}[]} bibliotheque - Tous les fichiers déposés.
     * @param {string[]} noms - Noms cochés pour ce document.
     * @returns {Object[]} Fichiers envoyés avec ses questions.
     */
    sourcesCochees(bibliotheque, noms) {
        return bibliotheque.filter(d => noms.includes(d.nom));
    },

    /**
     * Reprend dans la bibliothèque les sources que chaque document gardait avec lui.
     *
     * Même nom et même texte : un seul fichier. Même nom, autre texte : renommé.
     *
     * @param {Object[]} conversations - Entrées d'historique, certaines avec { documents }.
     * @param {{nom: string, texte: string}[]} bibliotheque - Fichiers déjà dans la bibliothèque.
     * @returns {{conversations: Object[], bibliotheque: Object[], change: boolean}} Entrées avec { sources }, bibliothèque complétée.
     */
    versBibliotheque(conversations, bibliotheque) {
        const fichiers = bibliotheque.slice();
        let change = false;
        const reprises = conversations.map((entree) => {
            if (!entree.documents) {
                return entree;
            }
            change = true;
            const { documents, ...reste } = entree;
            reste.sources = documents.map((doc) => {
                if (fichiers.some(f => f.nom === doc.nom && f.texte === doc.texte)) {
                    return doc.nom;
                }
                const nom = this.nomLibre(doc.nom, fichiers.map(f => f.nom));
                fichiers.push({ nom: nom, texte: doc.texte });
                return nom;
            });
            return reste;
        });
        return { conversations: reprises, bibliotheque: fichiers, change: change };
    },

    /**
     * Nom sous lequel le texte d'un fichier de la bibliothèque se télécharge.
     *
     * La bibliothèque garde le texte lu, pas le fichier : un PDF revient en .txt.
     *
     * @param {string} nom - Nom du fichier déposé.
     * @returns {string} Le même nom pour un fichier texte, sinon suivi de ".txt".
     */
    nomTexte(nom) {
        return /\.(txt|md|csv|tsv|tex)$/i.test(nom) ? nom : nom + '.txt';
    },

    /**
     * Nom d'une réponse gardée dans la bibliothèque : "Note", puis le début de sa question.
     *
     * @param {string} question - Question de la réponse, ou '' (Imprimerie n'en affiche pas).
     * @returns {string} Nom en .md, le format de la réponse.
     */
    nomNote(question) {
        const debut = question.replace(/\s+/g, ' ').trim();
        /* Coupé au dernier mot entier qui tient dans 40 caractères. */
        const court = debut.length > 40 ? debut.slice(0, 41).replace(/\s+\S*$/, '').slice(0, 40) : debut;
        return t('documents.note') + (court ? ' - ' + court : '') + '.md';
    },

    /**
     * Demande le guide d'une source : résumé, thèmes clés et questions, en JSON.
     *
     * @param {string} modele - Alias du modèle.
     * @param {string} texte - Texte de la source.
     * @returns {Object} Corps pour repondre.
     */
    demandeGuide(modele, texte) {
        return {
            model: modele,
            /* Pas 0 : "Refaire le guide" en donnerait presque le même. */
            temperature: 0.7,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: t('guide.consigne') },
                { role: 'user', content: texte }
            ]
        };
    },

    /**
     * Lit le guide dans la réponse du modèle, sans gras.
     *
     * @param {string} reponse - Réponse du modèle, en JSON.
     * @returns {?{resume: string, themes: string[], questions: string[]}} null si elle est illisible ou sans résumé.
     */
    lireGuide(reponse) {
        let guide;
        try {
            /* Certains modèles entourent le JSON d'un bloc ```json. */
            guide = JSON.parse(reponse.slice(reponse.indexOf('{'), reponse.lastIndexOf('}') + 1));
        } catch (err) {
            return null;
        }
        if (!guide || typeof guide !== 'object') {
            return null;
        }
        /* Le résumé arrive parfois en liste de phrases. */
        const liste = valeur => [].concat(valeur)
            .filter(x => typeof x === 'string' && x.trim())
            .map(x => this.sansGras(x).trim());
        const resume = liste(guide.resume).join(' ');
        return resume ? { resume: resume, themes: liste(guide.themes), questions: liste(guide.questions) } : null;
    },

    /**
     * Retire un fichier supprimé de la bibliothèque des documents qui le cochaient.
     *
     * @param {Object[]} conversations - Entrées d'historique.
     * @param {string} nom - Nom du fichier supprimé.
     * @returns {Object[]} Entrées, sans ce nom dans leurs sources.
     */
    sansSource(conversations, nom) {
        return conversations.map(c => (c.sources ? { ...c, sources: c.sources.filter(s => s !== nom) } : c));
    },

    /**
     * Texte montré dans le fil pour la question posée.
     *
     * Le fichier joint s'annonce sous la question, ou seul si rien n'est tapé.
     *
     * @param {string} question - Texte saisi, éventuellement vide.
     * @param {?{nom: string}} piece - Fichier joint, ou null.
     * @returns {string} Texte de la bulle.
     */
    texteAffiche(question, piece) {
        const lignes = [question, piece ? t('fichier.joint', { nom: piece.nom }) : ''];
        return lignes.filter(Boolean).join('\n');
    },

    /**
     * Indique si le texte contient une adresse web.
     *
     * Albert n'a pas accès au web : il inventerait le contenu de la page.
     *
     * @param {string} texte - Texte saisi.
     * @returns {boolean} true si une adresse y figure.
     */
    contientLien(texte) {
        return /https?:\/\/|www\./i.test(texte);
    },

    /**
     * Ajoute à la saisie l'instruction propre à l'outil (comme albert-droid).
     *
     * @param {string} outil - Clé de OUTILS.
     * @param {string} texte - Saisie, fichier joint compris.
     * @param {string} source - Code de la langue source, ou LANGUE_AUTO.
     * @param {string} cible - Code de la langue cible.
     * @returns {string} Demande à envoyer au modèle.
     */
    construireDemande(outil, texte, source, cible) {
        if (outil === 'reformuler' || outil === 'corriger' || outil === 'rediger') {
            return t('demande.' + outil, { texte: texte });
        }
        if (outil === 'traduire') {
            /* "Traduis du Anglais" serait incorrect : la langue source va entre parenthèses. */
            const valeurs = { texte: texte, cible: t('langue.' + cible), source: t('langue.' + source) };
            return t(source === this.LANGUE_AUTO ? 'demande.traduire' : 'demande.traduire-source', valeurs);
        }
        return texte;
    },

    /**
     * Indique si les notes de Rédiger méritent une nouvelle proposition.
     *
     * @param {string} notes - Notes saisies.
     * @param {string} dernierEnvoi - Notes de la dernière proposition reçue, ou ''.
     * @returns {boolean} true si assez longues et changées depuis.
     */
    doitEnvoyer(notes, dernierEnvoi) {
        const texte = notes.trim();
        return texte.length >= this.LONGUEUR_MIN_NOTES && texte !== dernierEnvoi.trim();
    },

    /**
     * Retire le Markdown qu'un modèle ajoute malgré la consigne de Rédiger.
     *
     * Gras, italique et titres seulement : les tirets de liste viennent souvent des notes.
     *
     * @param {string} texte - Réponse du modèle.
     * @returns {string} Texte brut, retours à la ligne gardés.
     */
    sansMarkdown(texte) {
        return texte
            .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
            .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, '$1')
            .replace(/^#{1,6}[ \t]+/gm, '');
    },

    /**
     * Sépare la relecture de Rédiger : le courrier, puis les anomalies après "%%%".
     *
     * Tolérant : les modèles écrivent parfois "%%%%%", ou la première anomalie sur la même ligne.
     *
     * @param {string} texte - Réponse du modèle.
     * @returns {{texte: string, anomalies: string[]}} Courrier sans Markdown, et points à vérifier.
     */
    separerRevue(texte) {
        const debut = texte.search(/%{3,}/);
        const courrier = debut < 0 ? texte : texte.slice(0, debut);
        const suite = debut < 0 ? '' : texte.slice(debut).replace(/%{3,}/g, '\n');
        const anomalies = suite.split('\n')
            .map(ligne => ligne.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, '').trim())
            .filter(Boolean);
        return { texte: this.sansMarkdown(courrier).trim(), anomalies: anomalies };
    },

    /**
     * Jours à venir, un par ligne ("mardi 22 septembre 2026") : les modèles calculent mal le jour de la semaine.
     *
     * @param {Date} debut - Premier jour.
     * @param {number} jours - Nombre de jours.
     * @param {string} langue - Code de langue de l'interface.
     * @returns {string[]} Les jours, dans la langue demandée.
     */
    calendrier(debut, jours, langue) {
        const format = new Intl.DateTimeFormat(langue, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        return Array.from({ length: jours }, (_, i) =>
            format.format(new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i)));
    },

    /**
     * Sépare les variantes d'une réponse de Reformuler ("### Titre" puis le texte).
     *
     * @param {string} texte - Réponse du modèle.
     * @returns {?Array<{titre: string, texte: string}>} Les variantes, ou null
     *     si la réponse n'en contient pas au moins deux (on l'affiche alors d'un bloc).
     */
    decouperVariantes(texte) {
        const variantes = [];
        for (const bloc of texte.split(/^###[ \t]+/m).slice(1)) {
            const fin = bloc.indexOf('\n');
            const titre = (fin < 0 ? bloc : bloc.slice(0, fin)).trim();
            const corps = fin < 0 ? '' : bloc.slice(fin + 1).trim();
            if (titre && corps) {
                variantes.push({ titre: titre, texte: corps });
            }
        }
        if (variantes.length < 2) {
            return null;
        }
        return variantes;
    },

    /**
     * Nouvelle position dans l'historique des questions.
     *
     * @param {string[]} historique - Questions, la plus récente en premier.
     * @param {number} index - Position actuelle : -1 pour la saisie en cours.
     * @param {string} sens - "haut" (plus ancienne) ou "bas" (plus récente).
     * @returns {number} Position entre -1 et historique.length - 1.
     */
    naviguer(historique, index, sens) {
        const suivant = index + (sens === 'haut' ? 1 : -1);
        return Math.max(-1, Math.min(suivant, historique.length - 1));
    },

    /**
     * Entrée d'historique pour une conversation en cours.
     *
     * Le titre est la première question posée, telle qu'elle est affichée.
     *
     * @param {string} id - Identifiant de la conversation.
     * @param {string} outil - Clé de OUTILS.
     * @param {Array<Object>} messages - Messages de la conversation.
     * @param {Object[]} [documents] - Sources cochées d'un projet.
     * @param {string} [nom] - Nom donné au projet.
     * @param {?Object} [ancienne] - Entrée déjà enregistrée du projet : son titre est gardé.
     * @returns {?Object} Entrée { id, outil, titre, date, messages, sources?, nom? }, ou null s'il n'y a ni question ni source.
     */
    entreeConversation(id, outil, messages, documents = [], nom = '', ancienne = null) {
        const premiere = messages.find(m => m.role === 'user');
        if (!premiere && !documents.length) {
            return null;
        }
        /* Projet : la première demande peut sortir de l'historique des versions, le titre reste. */
        const garde = ancienne && ancienne.messages.length ? ancienne.titre : '';
        const entree = {
            id: id,
            outil: outil,
            /* Projet sans question : le nom de son premier document. */
            titre: garde || (premiere ? premiere.affiche || premiere.content : documents[0].nom),
            date: Date.now(),
            /* Copie : la conversation en cours continue de changer. */
            messages: messages.slice()
        };
        if (documents.length) {
            /* Les fichiers sont dans la bibliothèque : le document ne garde que leurs noms. */
            entree.sources = documents.map(d => d.nom);
        }
        const nomNet = nom.trim().slice(0, this.NOM_PROJET_MAX);
        if (nomNet) {
            entree.nom = nomNet;
        }
        return entree;
    },

    /**
     * Indique si une entrée d'historique est un projet.
     *
     * @param {Object} entree - Entrée d'historique { outil }.
     * @returns {boolean}
     */
    estProjet(entree) {
        return !!(this.OUTILS[entree.outil] || {}).documents;
    },

    /**
     * Liste d'historique ramenée à ses plafonds : projets et conversations comptés à part.
     *
     * @param {Object[]} liste - Entrées, la plus récente en premier.
     * @returns {Object[]} Entrées gardées, dans le même ordre.
     */
    limiterConversations(liste) {
        const restants = [this.CONVERSATIONS_MAX, this.PROJETS_MAX];
        return liste.filter((entree) => {
            const sorte = Number(this.estProjet(entree));
            restants[sorte] -= 1;
            return restants[sorte] >= 0;
        });
    },

    /**
     * Texte d'un objet formule d'un .odt, à remettre dans le texte du document.
     *
     * @param {string} xml - Contenu de l'objet : MathML et annotations.
     * @returns {string} "$...$" si la source LaTeX y est, "[formule : ...]" pour l'écriture de LibreOffice, '' sinon.
     */
    formuleOdt(xml) {
        const lire = (encodage) => {
            const trouve = new RegExp('<annotation[^>]*encoding="' + encodage + '"[^>]*>([^<]*)</annotation>').exec(xml);
            return trouve ? trouve[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim() : '';
        };
        /* ponytail: l'écriture StarMath de LibreOffice passe telle quelle ; la convertir en LaTeX si le modèle la lit mal. */
        const tex = lire('application/x-tex');
        const starmath = lire('StarMath 5.0');
        return tex ? '$' + tex + '$' : (starmath ? '[formule : ' + starmath + ']' : '');
    },

    /**
     * Équation Word en texte : fractions, puissances, indices et racines restent lisibles.
     *
     * @param {Node} noeud - m:oMath ou l'un de ses descendants.
     * @returns {string} Texte de l'équation.
     */
    texteOmml(noeud) {
        let texte = '';
        for (const enfant of noeud.childNodes) {
            const nom = enfant.localName || '';
            const partie = (balise) => {
                const trouve = [...enfant.childNodes].find((c) => c.localName === balise);
                return trouve ? this.texteOmml(trouve) : '';
            };
            if (nom === 't') {
                texte += enfant.textContent;
            } else if (nom === 'f') {
                texte += '(' + partie('num') + ')/(' + partie('den') + ')';
            } else if (nom === 'sSup') {
                texte += partie('e') + '^(' + partie('sup') + ')';
            } else if (nom === 'sSub') {
                texte += partie('e') + '_(' + partie('sub') + ')';
            } else if (nom === 'sSubSup') {
                texte += partie('e') + '_(' + partie('sub') + ')^(' + partie('sup') + ')';
            } else if (nom === 'rad') {
                texte += 'racine(' + partie('e') + ')';
            } else if (enfant.nodeType === 1 && !nom.endsWith('Pr')) {
                /* Les propriétés (fPr, rPr...) ne portent pas de texte. */
                texte += this.texteOmml(enfant);
            }
        }
        return texte;
    },

    /**
     * Nom libre pour un document : "image.png", puis "image (2).png" si le nom est pris.
     *
     * @param {string} nom - Nom voulu.
     * @param {string[]} pris - Noms déjà utilisés.
     * @returns {string} Nom absent de la liste.
     */
    nomLibre(nom, pris) {
        const [, base, extension = ''] = nom.match(/^(.*?)(\.[^.]*)?$/);
        let libre = nom;
        for (let rang = 2; pris.includes(libre); rang++) {
            libre = base + ' (' + rang + ')' + extension;
        }
        return libre;
    },

    /**
     * Ligne de l'outil calcul lisible sous la réponse : un tableau de
     * variations garde sa lecture, sans la consigne au modèle ni le LaTeX,
     * déjà affiché sous la réponse.
     *
     * @param {string} ligne - Ligne rendue au modèle, gardée dans les appels d'outils.
     * @returns {string} Texte de la note sous la calculatrice.
     */
    traceCalcul(ligne) {
        const debut = ligne.indexOf('$$');
        if (debut < 0) {
            return ligne;
        }
        /* Format de calcul.tableau : la lecture, la consigne au modèle sur la dernière ligne, puis le tableau. */
        let lecture = ligne.slice(0, debut).trimEnd().split('\n').slice(0, -1).join('\n').replace(/\\infty/g, '∞');
        /* Du plus intérieur vers l'extérieur : \frac{\sqrt{3}}{3}. */
        for (let avant = ''; avant !== lecture;) {
            avant = lecture;
            lecture = lecture.replace(/\\sqrt\{([^{}]*)\}/g, '√$1').replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2');
        }
        return lecture;
    },

    /**
     * Libellé d'une conversation enregistrée : l'outil devant le titre.
     *
     * Discuter n'est pas nommé : c'est l'outil par défaut.
     *
     * @param {Object} entree - Entrée d'historique { titre, outil }.
     * @returns {string} Libellé à afficher.
     */
    libelleConversation(entree) {
        /* Un projet a sa propre liste : son nom suffit, ou son titre s'il n'en a pas. */
        if (this.estProjet(entree)) {
            return entree.nom || entree.titre;
        }
        if (!entree.outil || entree.outil === 'discuter') {
            return entree.titre;
        }
        return t('outil.' + entree.outil) + ' : ' + entree.titre;
    },

    /**
     * Langue d'une réponse, pour la lire avec la bonne voix : par l'écriture,
     * sinon par ses mots outils. Dans le doute, la langue de l'interface.
     *
     * @param {string} texte - Réponse en Markdown ; le code ne compte pas.
     * @param {string} defaut - Langue de l'interface.
     * @returns {string} Code de langue ("es", "ru"...).
     */
    langueDuTexte(texte, defaut) {
        const prose = texte.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
        const lettres = (prose.match(/\p{L}/gu) || []).length;
        if (!lettres) {
            return defaut;
        }
        const part = motif => (prose.match(motif) || []).length / lettres;
        /* Des kana : japonais, même au milieu des idéogrammes. */
        if (part(/[\u3040-\u30ff]/g) > 0.1) {
            return 'ja';
        }
        for (const [code, motif] of [['zh', /\p{Script=Han}/gu], ['ru', /\p{Script=Cyrillic}/gu], ['ar', /\p{Script=Arabic}/gu]]) {
            if (part(motif) > 0.3) {
                return code;
            }
        }
        const mots = prose.toLowerCase().match(/\p{L}+/gu);
        const score = code => mots.filter(m => this.MOTS_OUTILS[code].includes(m)).length;
        let meilleure = defaut;
        for (const code of Object.keys(this.MOTS_OUTILS)) {
            if (score(code) > score(meilleure)) {
                meilleure = code;
            }
        }
        return score(meilleure) >= 2 ? meilleure : defaut;
    },

    /**
     * Messages à envoyer : la dernière question, précédée des échanges que l'IA relit.
     *
     * Seuls role et content partent : les autres champs (affiche) restent ici.
     *
     * @param {Object[]} conversation - Messages de la conversation.
     * @param {number} echanges - Échanges (question et réponse) relus ; ECHANGES_TOUS : toute la conversation.
     * @returns {Object[]} Messages { role, content } à envoyer.
     */
    messagesAEnvoyer(conversation, echanges) {
        let messages = conversation;
        if (echanges < this.ECHANGES_TOUS) {
            messages = conversation.slice(-(2 * echanges + 1));
            /* Un envoi ne commence pas par une réponse : des modèles le refusent. */
            messages = messages.slice(Math.max(messages.findIndex(m => m.role === 'user'), 0));
        }
        return messages.map(m => ({ role: m.role, content: m.content }));
    },

    /**
     * Clé de la phrase qui décrit le contexte choisi : rien, un échange, n échanges ou tout.
     *
     * @param {number} echanges - Position du curseur.
     * @returns {string} Clé du dictionnaire.
     */
    cleAideEchanges(echanges) {
        if (echanges >= this.ECHANGES_TOUS) {
            return 'reglages.aide-echanges-tous';
        }
        return ['reglages.aide-echanges-aucun', 'reglages.aide-echanges-un'][echanges] || 'reglages.aide-echanges';
    },

    /**
     * Messages d'un projet : la demande, précédée de la version en cours du
     * document et de la demande qui l'a produite.
     *
     * Un projet construit un seul document : les versions plus anciennes,
     * chacune un document entier, ne partent pas.
     *
     * @param {Object[]} conversation - Messages du projet.
     * @returns {Object[]} Trois messages { role, content } au plus.
     */
    messagesProjet(conversation) {
        const messages = conversation.slice(-3).map(m => ({ role: m.role, content: m.content }));
        /* Une version existe : sans ce rappel après la demande, le modèle rend parfois la seule partie modifiée. */
        if (messages.some(m => m.role === 'assistant')) {
            messages.at(-1).content += '\n\n' + t('demande.document-entier');
        }
        return messages;
    },

    /**
     * Versions d'un document : chaque réponse, avec la demande qui l'a produite.
     *
     * @param {Object[]} conversation - Messages du projet.
     * @returns {{rang: number, demande: string, numero: number, date: ?number}[]} Dans l'ordre de la conversation ; rang de la réponse.
     */
    versionsProjet(conversation) {
        return conversation.flatMap((m, i) => {
            const avant = conversation[i - 1];
            const demande = avant && avant.role === 'user' ? avant.affiche || avant.content : '';
            /* Le numéro affiché part de 0 : le champ version, lui, part de 1. */
            return m.role === 'assistant' ? [{ rang: i, demande: demande, numero: m.version - 1, date: m.date }] : [];
        });
    },

    /**
     * Numérote les versions qui n'ont pas de numéro, à la suite du plus grand : il les suit ensuite.
     *
     * @param {Object[]} conversation - Messages du projet.
     * @returns {Object[]} Nouvelle conversation, chaque réponse avec son champ version, à partir de 1.
     */
    numeroterVersions(conversation) {
        let dernier = Math.max(0, ...conversation.map(m => m.version || 0));
        return conversation.map((m) => {
            if (m.role !== 'assistant' || m.version) {
                return m;
            }
            dernier += 1;
            return { ...m, version: dernier };
        });
    },

    /**
     * Reprend une version : elle passe en dernier avec sa demande, et redevient le document en cours.
     *
     * @param {Object[]} conversation - Messages du projet.
     * @param {number} rang - Rang de la réponse reprise.
     * @returns {Object[]} Nouvelle conversation, aucune version n'en sort.
     */
    reprendreVersion(conversation, rang) {
        const debut = rang > 0 && conversation[rang - 1].role === 'user' ? rang - 1 : rang;
        return [...conversation.slice(0, debut), ...conversation.slice(rang + 1), ...conversation.slice(debut, rang + 1)];
    },

    /**
     * Garde les dernières versions d'un document (VERSIONS_MAX).
     *
     * @param {Object[]} conversation - Messages du projet.
     * @returns {Object[]} La conversation, sans ses versions les plus anciennes.
     */
    limiterVersions(conversation) {
        const versions = this.versionsProjet(conversation);
        const trop = versions.length - this.VERSIONS_MAX;
        return trop > 0 ? conversation.slice(versions[trop - 1].rang + 1) : conversation;
    },

    /**
     * Versions du dernier échange de Discussion (question modifiée ou réponse régénérée).
     *
     * @param {Object[]} conversation - Messages de la conversation.
     * @returns {Object[]} Versions { question, reponse }, celle affichée comprise ; [] sans échange complet.
     */
    versionsEchange(conversation) {
        const [question, reponse] = conversation.slice(-2);
        if (!question || question.role !== 'user' || !reponse || reponse.role !== 'assistant') {
            return [];
        }
        return reponse.versions || [{ question: question, reponse: reponse }];
    },

    /**
     * Affiche une version du dernier échange : sa question et sa réponse le remplacent.
     *
     * @param {Object[]} conversation - Messages de la conversation.
     * @param {Object[]} versions - Versions { question, reponse }, sans champ versions.
     * @param {number} affichee - Rang de la version à afficher.
     * @returns {Object[]} Nouvelle conversation ; la réponse porte les versions et le rang affiché.
     */
    choisirVersionEchange(conversation, versions, affichee) {
        const { question, reponse } = versions[affichee];
        return [...conversation.slice(0, -2), question, { ...reponse, versions: versions, affichee: affichee }];
    },

    /**
     * Message d'erreur lisible à partir d'une réponse refusée.
     *
     * @param {number} status - Code HTTP.
     * @param {?Object} corps - Corps JSON de la réponse, s'il existe.
     * @returns {string} Message pour l'utilisateur.
     */
    messageErreur(status, corps) {
        /* Kiosque : la session du prof est finie ou fermée (serveur/serveur.py).
           Retour à la connexion : la page ne peut plus rien demander à Albert ; l'invité y lit un message seul. */
        if (status === 401 && corps && corps.kiosque === 'terminee') {
            if (typeof location !== 'undefined') {
                const eleve = typeof SERVEUR !== 'undefined' && SERVEUR.kiosque && SERVEUR.kiosque.role === 'eleve';
                location.href = eleve ? '/kiosque?terminee' : '/kiosque?erreur=terminee';
            }
            return t('kiosque.terminee');
        }
        /* Serveur hors kiosque appelé depuis un autre poste (serveur/serveur.py). */
        if (status === 403 && corps && corps.reseau === 'refuse') {
            return t('erreur.poste-distant');
        }
        if (status === 401 || status === 403) {
            return this.texte('erreur.cle-refusee');
        }
        if (status === 429) {
            return t('erreur.quota');
        }
        /* Le serveur répond 502 quand Albert ne répond pas ; en ligne, le reverse proxy répond seul quand n8n est arrêté. */
        if ([502, 503, 504].includes(status)) {
            return this.texte('erreur.relais-hs');
        }
        const detail = corps && (typeof corps.detail === 'string' ? corps.detail : corps.message);
        if (!detail) {
            return t('erreur.http', { status: status });
        }
        return t('erreur.http-detail', { status: status, detail: String(detail).slice(0, 200) });
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur, qui charge les morceaux par index.html. */
if (typeof module !== 'undefined') {
    module.exports = Albert;
    globalThis.Albert = Albert;
    require('./albert/passages.js');
}
