/*
 * albert.js
 * Client de l'API Albert.
 *
 * Albert ne gère pas CORS : toutes les requêtes passent par le relais n8n.
 * Aucun accès au DOM, pour pouvoir être testé sous Node (tests/albert.test.js).
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
        { id: 'openweight-medium', nom: 'Medium', reel: 'mistral-small-3-2-24b-instruct-2506', type: 'Texte et images', contexte: 128000, description: 'Équilibré entre qualité et rapidité.' },
        { id: 'openweight-large', nom: 'Large', reel: 'openai/gpt-oss-120b', type: 'Texte', contexte: 131072, description: 'Le plus capable, pour les raisonnements longs. Plus lent.' },
        { id: 'openweight-small', nom: 'Small', reel: 'ministral-3-8b-instruct-2512', type: 'Texte et images', contexte: 262144, description: 'Le plus rapide, pour les questions simples.' },
        { id: 'openweight-code', nom: 'Code', reel: 'qwen3-coder-30b-A3b-instruct', type: 'Texte', contexte: 262144, description: 'Spécialisé en programmation.' },
        { id: 'openweight-code-2', nom: 'Code 2', reel: 'deepseek-v4-flash', type: 'Texte', contexte: 393216, description: 'Programmation, contexte très long.' }
    ],

    /*
    Outils du menu, repris d'albert-droid. Reformuler et Traduire envoient
    une seule demande, sans les échanges précédents, avec leur consigne système.
    */
    OUTILS: {
        discuter: { nom: 'Discuter', consigne: null, invite: 'Poser votre question...' },
        reformuler: { nom: 'Reformuler', consigne: 'prompts/reformuler.txt', invite: 'Collez le texte à reformuler...' },
        traduire: { nom: 'Traduire', consigne: 'prompts/traduire.txt', invite: 'Collez le texte à traduire...' }
    },

    /** Langue source qui laisse le modèle détecter la langue du texte. */
    LANGUE_AUTO: 'Automatique',

    /** Langues proposées par Traduire (liste d'albert-droid). */
    LANGUES: ['Français', 'Anglais', 'Allemand', 'Espagnol', 'Italien', 'Portugais',
        'Néerlandais', 'Russe', 'Chinois', 'Japonais', 'Arabe', 'Latin'],

    /** Réglages conseillés, aussi utilisés au premier lancement. */
    CONSEILLES: { modele: 'openweight-large', temperature: 0.2, memoire: true },

    /* Modèle qui lit les images (annuaire BidouIAge, 1er août 2026). */
    MODELE_VISION: 'openweight-medium',

    /** Consigne envoyée avec une image jointe. */
    CONSIGNE_IMAGE: 'Transcris fidèlement tout le texte visible dans cette image, en Markdown. '
        + 'Écris les formules en LaTeX entre $. Si l\'image contient une figure ou un schéma, '
        + 'décris-le en quelques phrases. Ne réponds rien d\'autre.',

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
        return this.conversation((corps && corps.data) || []);
    },

    /**
     * Garde les modèles de conversation, sans OCR, alias openweight-* d'abord.
     *
     * Le type est dans "type", ou dans "model_type" derrière certains proxys.
     *
     * @param {Object[]} liste - Modèles bruts renvoyés par /v1/models.
     * @returns {Object[]} Modèles { id, nom, reel, type, description, contexte }.
     */
    conversation(liste) {
        const ordre = this.MODELES.map(m => m.id);
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
                    type: (m.model_type || m.type) === 'image-text-to-text' ? 'Texte et images' : 'Texte',
                    description: connu ? connu.description : 'Modèle de conversation.',
                    contexte: m.max_context_length || (connu && connu.contexte) || null
                };
            })
            .sort((a, b) => {
                const rangA = ordre.indexOf(a.id);
                const rangB = ordre.indexOf(b.id);
                /* Les modèles connus d'abord, dans l'ordre de MODELES. */
                if (rangA >= 0 || rangB >= 0) {
                    return (rangA < 0 ? 99 : rangA) - (rangB < 0 ? 99 : rangB);
                }
                return a.id.localeCompare(b.id);
            });
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
        return { texte: corps.choices[0].message.content, usage: corps.usage || null };
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
                { type: 'text', text: this.CONSIGNE_IMAGE },
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
        return (question ? question + '\n\n' : '') + 'Contenu du fichier "' + piece.nom + '" :\n\n' + piece.texte;
    },

    /**
     * Ajoute à la saisie l'instruction propre à l'outil (comme albert-droid).
     *
     * @param {string} outil - "discuter", "reformuler" ou "traduire".
     * @param {string} texte - Saisie, fichier joint compris.
     * @param {string} source - Langue source, ou LANGUE_AUTO.
     * @param {string} cible - Langue cible.
     * @returns {string} Demande à envoyer au modèle.
     */
    construireDemande(outil, texte, source, cible) {
        if (outil === 'reformuler') {
            return 'Reformule ce texte :\n\n' + texte;
        }
        if (outil === 'traduire') {
            /* "Traduis du Anglais" serait incorrect : la langue source va entre parenthèses. */
            if (source === this.LANGUE_AUTO) {
                return 'Traduis ce texte en ' + cible + ' :\n\n' + texte;
            }
            return 'Traduis ce texte en ' + cible + ' (langue source : ' + source + ') :\n\n' + texte;
        }
        return texte;
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
            return 'Clé refusée par Albert. Vérifiez-la ou changez-la.';
        }
        if (status === 429) {
            return 'Quota atteint. Réessayez dans une minute.';
        }
        const detail = corps && (typeof corps.detail === 'string' ? corps.detail : corps.message);
        return 'Erreur ' + status + (detail ? ' : ' + String(detail).slice(0, 200) : '.');
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Albert;
}
