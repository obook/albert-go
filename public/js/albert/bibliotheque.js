/*
 * albert/bibliotheque.js
 * Sources de la bibliothèque : place qu'elles prennent dans le contexte, noms, fiche de lecture.
 *
 * La bibliothèque garde le texte des fichiers déposés ; chaque conversation ou document
 * coche les siennes. Ce fichier calcule ce qui tient dans le contexte du modèle, reprend
 * les sources des anciennes conversations et lit la fiche de lecture rédigée par Albert.
 * Complète l'objet Albert d'albert.js, chargé avant lui. Utilisé par projet.js, app.js
 * et stockage.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Albert, {
    /** Part du contexte laissée aux documents d'un projet : le reste sert à la conversation et à la réponse. */
    PART_DOCUMENTS: 0.6,

    /** Caractères par jeton, estimation prudente pour le français. */
    CARACTERES_PAR_JETON: 3,

    /** Plafond des documents d'un projet quand le contexte du modèle est inconnu, en caractères. */
    DOCUMENTS_MAX: 200000,

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
    }
});
