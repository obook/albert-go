/*
 * albert/courrier.js
 * Module Courrier (Rédiger) : quand envoyer les notes, texte rendu sans Markdown,
 * relecture séparée du courrier et calendrier des jours à venir.
 *
 * redaction.js propose un courrier à partir des notes tapées, puis le fait relire.
 * Complète l'objet Albert d'albert.js, chargé avant lui.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Albert, {
    /** Rédiger : notes plus courtes non envoyées, pour ne pas payer une requête par mot. */
    LONGUEUR_MIN_NOTES: 10,

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
    }
});
