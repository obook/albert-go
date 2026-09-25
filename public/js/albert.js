/*
 * albert.js
 * Client de l'API Albert.
 *
 * Albert ne gère pas CORS : toutes les requêtes passent par le relais n8n.
 * Aucun accès au DOM, pour pouvoir être testé sous Node (tests/albert.test.js).
 * Les textes visibles et ceux envoyés au modèle viennent de i18n.js (t).
 * Utilisé par stockage.js, reglages.js, piece-jointe.js et app.js.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

const Albert = {
    /** Adresse du relais n8n. */
    BASE: 'https://n8n.incubateur.education.gouv.fr/webhook/albert-go/v1',

    /** Adresse publique de la page, affichée dans la boîte "Partager". */
    URL_PUBLIQUE: 'https://booklageolivier.forge.apps.education.fr/albert-go/',

    /* Même liste que allowedOrigins dans le workflow n8n. */
    ORIGINES: ['https://booklageolivier.forge.apps.education.fr', 'http://localhost:8642'],

    /** Délai maximal d'une réponse, en millisecondes. */
    DELAI_MS: 120000,

    /** Nombre de questions gardées pour les flèches de la saisie. */
    HISTORIQUE_MAX: 30,

    /** Nombre de conversations gardées dans le menu. */
    CONVERSATIONS_MAX: 10,

    /*
    Liste de secours si /v1/models ne répond pas (annuaire BidouIAge, 1er août 2026).
    Albert peut changer le modèle derrière un alias : /v1/models fait foi.
    */
    MODELES: [
        { id: 'openweight-code', nom: 'Code', reel: 'qwen3-coder-30b-A3b-instruct', type: 'texte', contexte: 262144 },
        { id: 'openweight-code-2', nom: 'Code 2', reel: 'deepseek-v4-flash', type: 'texte', contexte: 393216 },
        { id: 'openweight-large', nom: 'Large', reel: 'openai/gpt-oss-120b', type: 'texte', contexte: 131072 },
        { id: 'openweight-medium', nom: 'Medium', reel: 'mistral-small-3-2-24b-instruct-2506', type: 'texte-images', contexte: 128000 },
        { id: 'openweight-small', nom: 'Small', reel: 'ministral-3-8b-instruct-2512', type: 'texte-images', contexte: 262144 }
    ],

    /*
    Outils du menu, repris d'albert-droid. Reformuler et Traduire envoient
    une seule demande, sans les échanges précédents, avec leur consigne système.
    Le nom et l'invite sont dans i18n.js ; la consigne est le fichier de
    public/prompts/<langue>/ (outils.js).
    */
    OUTILS: {
        discuter: { consigne: 'discuter.txt' },
        reformuler: { consigne: 'reformuler.txt' },
        traduire: { consigne: 'traduire.txt' },
        corriger: { consigne: 'corriger.txt' },
        rediger: { consigne: 'rediger.txt', revue: 'revoir.txt' }
    },

    /** Rédiger : notes plus courtes non envoyées, pour ne pas payer une requête par mot. */
    LONGUEUR_MIN_NOTES: 10,

    /** Langue source qui laisse le modèle détecter la langue du texte. */
    LANGUE_AUTO: 'auto',

    /** Langues proposées par Traduire (liste d'albert-droid), en codes ISO 639-1. */
    LANGUES: ['fr', 'en', 'de', 'es', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ar', 'la'],

    /** Réglages conseillés, aussi utilisés au premier lancement. */
    CONSEILLES: { modele: 'openweight-large', temperature: 0.2, memoire: true },

    /* Modèle qui lit les images (annuaire BidouIAge, 1er août 2026). */
    MODELE_VISION: 'openweight-medium',

    /**
     * Demande la liste des modèles à Albert.
     *
     * @param {string} cle - Clé API de l'utilisateur.
     * @returns {Promise<Object[]>} Les modèles de conversation, triés.
     * @throws {Error} Si Albert refuse la requête ; err.status donne le code HTTP.
     */
    async modeles(cle) {
        const res = await fetch(this.BASE + '/models', {
            headers: { 'Authorization': 'Bearer ' + cle },
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
                return {
                    id: alias,
                    nom: connu ? connu.nom : this.nomCourt(alias),
                    reel: m.id,
                    type: (m.model_type || m.type) === 'image-text-to-text' ? 'texte-images' : 'texte',
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
        if (!trouve) return 'images/editeurs/inconnu.svg';
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
     * Envoie une requête de conversation à Albert.
     *
     * @param {string} cle - Clé API de l'utilisateur.
     * @param {Object} requete - Corps au format chat/completions (model, messages...).
     * @param {AbortSignal} annulation - Signal du bouton Arrêter.
     * @returns {Promise<{texte: string, usage: ?Object}>} Réponse et consommation.
     * @throws {Error} Si Albert refuse la requête, ou si elle est annulée.
     */
    async repondre(cle, requete, annulation) {
        const res = await fetch(this.BASE + '/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + cle, 'Content-Type': 'application/json' },
            body: JSON.stringify(requete),
            signal: AbortSignal.any([annulation, AbortSignal.timeout(this.DELAI_MS)])
        });
        const corps = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(this.messageErreur(res.status, corps));
        }
        /* Un relais en panne peut rendre un corps vide avec un code 200. */
        const choix = corps && corps.choices && corps.choices[0];
        if (!choix || !choix.message) {
            throw new Error(t('erreur.reponse-illisible'));
        }
        /* message complet : il porte les tool_calls. content est null quand le
           modèle n'appelle qu'un outil, d'où le '' pour l'affichage. */
        return { texte: choix.message.content || '', message: choix.message, usage: corps.usage || null };
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

    /**
     * Fait lire une image par le modèle de vision.
     *
     * @param {string} cle - Clé API de l'utilisateur.
     * @param {string} dataUrl - Image en data URL (JPEG).
     * @param {AbortSignal} annulation - Signal pour abandonner la lecture.
     * @returns {Promise<string>} Texte trouvé dans l'image.
     */
    transcrire(cle, dataUrl, annulation) {
        return this.repondre(cle, {
            model: this.MODELE_VISION,
            temperature: 0,
            messages: [{ role: 'user', content: [
                { type: 'text', text: t('demande.image') },
                { type: 'image_url', image_url: { url: dataUrl } }
            ] }]
        }, annulation).then(r => r.texte);
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
     * @returns {?Object} Entrée { id, outil, titre, date, messages }, ou null si rien n'a été demandé.
     */
    entreeConversation(id, outil, messages) {
        const premiere = messages.find(m => m.role === 'user');
        if (!premiere) {
            return null;
        }
        return {
            id: id,
            outil: outil,
            titre: premiere.affiche || premiere.content,
            date: Date.now(),
            /* Copie : la conversation en cours continue de changer. */
            messages: messages.slice()
        };
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
        if (!entree.outil || entree.outil === 'discuter') {
            return entree.titre;
        }
        return t('outil.' + entree.outil) + ' : ' + entree.titre;
    },

    /**
     * Messages à envoyer : toute la conversation, ou la dernière question seule.
     *
     * Seuls role et content partent : les autres champs (affiche) restent ici.
     *
     * @param {Object[]} conversation - Messages de la conversation.
     * @param {boolean} memoire - Réglage "Envoyer toute la conversation".
     * @returns {Object[]} Messages { role, content } à envoyer.
     */
    messagesAEnvoyer(conversation, memoire) {
        const messages = memoire ? conversation : conversation.slice(-1);
        return messages.map(m => ({ role: m.role, content: m.content }));
    },

    /**
     * Message d'erreur lisible à partir d'une réponse refusée.
     *
     * @param {number} status - Code HTTP.
     * @param {?Object} corps - Corps JSON de la réponse, s'il existe.
     * @returns {string} Message pour l'utilisateur.
     */
    messageErreur(status, corps) {
        if (status === 401 || status === 403) {
            return t('erreur.cle-refusee');
        }
        if (status === 429) {
            return t('erreur.quota');
        }
        const detail = corps && (typeof corps.detail === 'string' ? corps.detail : corps.message);
        if (!detail) {
            return t('erreur.http', { status: status });
        }
        return t('erreur.http-detail', { status: status, detail: String(detail).slice(0, 200) });
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Albert;
}
