/*
 * albert/historique.js
 * Conversations enregistrées, messages envoyés au modèle et versions d'un document.
 *
 * Une conversation de Discussion garde ses échanges, dont les versions de son dernier
 * échange (question modifiée, réponse régénérée) ; un document d'Imprimerie garde ses
 * versions. Ce fichier construit les entrées de l'historique, choisit les messages qui
 * partent avec une question et gère ces versions. Les plafonds (CONVERSATIONS_MAX,
 * VERSIONS_MAX...) restent dans albert.js avec les autres réglages.
 * Complète l'objet Albert d'albert.js, chargé avant lui. Utilisé par app.js,
 * historique.js, stockage.js et projet.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Albert, {
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
    }
});
