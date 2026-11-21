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

    /** Délai laissé au relais pour rendre le compte des appels (/stats). */
    STATS_DELAI_MS: 10000,

    /** Une heure en millisecondes, pour la moyenne horaire des appels. */
    HEURE_MS: 3600000,

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

    /** En ligne, Scalingo coupe le relais à 60 s (504 sans CORS) : un échec réseau après ce temps est cette coupure. */
    COUPURE_RELAIS_MS: 55000,

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

    /* Liste de secours des modèles, logos, top-k et modèle des images : albert/modeles.js. */

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

    /* Place des sources dans le contexte et fiche de lecture : albert/bibliotheque.js. */
    /* Passages, vecteurs et citations : albert/passages.js. */

    /* Module Courrier (Rédiger) : albert/courrier.js. */

    /** Langue source qui laisse le modèle détecter la langue du texte. */
    LANGUE_AUTO: 'auto',

    /** Langues proposées par Traduire (liste d'albert-droid), en codes ISO 639-1. */
    LANGUES: ['fr', 'en', 'de', 'es', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ar', 'la'],

    /* Lecture des réponses (variantes, langue, calcul, Mermaid) : albert/reponses.js. */

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
    /* JETONS_EXPERIENCE: 600, */

    /* Lecture des fichiers joints (image, audio, formules) et leurs modèles : albert/fichiers.js. */

    /**
     * En ligne, appels sur 90 jours (clé acceptée par Albert), comptés par le relais.
     *
     * @returns {Promise<{total: number, parHeure: number}>} Somme des jours et moyenne horaire depuis le premier jour.
     */
    async appels() {
        const res = await fetch(this.RELAIS.replace('/v1', '/stats'), { signal: AbortSignal.timeout(this.STATS_DELAI_MS) });
        if (!res.ok) {
            throw new Error(res.status);
        }
        const jours = await res.json();
        const total = Object.values(jours).reduce((n, jour) => n + jour.appels, 0);
        /* ponytail: moyenne depuis minuit UTC du premier jour, compteur par heure si le rythme récent compte. */
        const debut = Date.parse(Object.keys(jours).sort()[0] + 'T00:00:00Z');
        const heures = Math.max(1, (Date.now() - debut) / this.HEURE_MS);
        return { total, parHeure: total ? total / heures : 0 };
    },

    /* Plafonnait la réponse d'une requête dont la température dépasse 1. Retiré, voir JETONS_EXPERIENCE. */
    /*
    plafonnee(requete) {
        return requete.temperature > 1 ? { max_tokens: this.JETONS_EXPERIENCE, ...requete } : requete;
    },
    */

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
        /* /stats a répondu pendant l'attente : le relais vit, un échec ensuite coupe la réponse. */
        let relaisRepond = false;
        const minuterie = this.EN_LIGNE ? setTimeout(() => {
            this.appels().then(() => {
                relaisRepond = true;
            }, () => sonde.abort(new Error(this.texte('erreur.relais-hs'))));
        }, this.SONDE_MS) : null;
        let res, corps;
        const debut = Date.now();
        try {
            res = await fetch(this.BASE + '/chat/completions', {
                method: 'POST',
                headers: this.entetes({ 'Content-Type': 'application/json' }),
                /* body: JSON.stringify(this.plafonnee(requete)), */
                body: JSON.stringify(requete),
                signal: AbortSignal.any([annulation, sonde.signal, AbortSignal.timeout(this.DELAI_MS)])
            });
            corps = await res.json().catch(() => null);
        } catch (err) {
            throw this.erreurAppel(err, Date.now() - debut, relaisRepond);
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
     * Erreur à rendre après un échec de fetch. En ligne, un échec réseau après COUPURE_RELAIS_MS,
     * ou alors que le relais répondait encore à /stats, n'est pas une panne : le relais a coupé
     * une réponse trop longue à venir. Le message le dit, et n'est pas pris pour une panne du
     * relais (messageEchec, app.js).
     *
     * @param {Error} err - Erreur de fetch.
     * @param {number} duree - Temps écoulé depuis l'envoi, en millisecondes.
     * @param {boolean} [relaisRepond] - true si /stats a répondu pendant l'attente.
     * @returns {Error} L'erreur d'origine, ou une erreur "coupure" avec son message.
     */
    erreurAppel(err, duree, relaisRepond = false) {
        const coupee = duree >= this.COUPURE_RELAIS_MS || relaisRepond;
        if (!this.EN_LIGNE || !(err instanceof TypeError) || !coupee) {
            return err;
        }
        const coupure = new Error(t('erreur.relais-coupure', { secondes: Math.round(duree / 1000) }));
        coupure.name = 'CoupureRelais';
        return coupure;
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
    require('./albert/bibliotheque.js');
    require('./albert/courrier.js');
    require('./albert/empreinte.js');
    require('./albert/fichiers.js');
    require('./albert/historique.js');
    require('./albert/modeles.js');
    require('./albert/passages.js');
    require('./albert/reponses.js');
}
