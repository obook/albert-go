/*
 * i18n.js
 * Traduction de l'interface : langue choisie, t('clé'), data-t du HTML.
 * Les textes sont dans langues/<langue>.js.
 *
 * Premier script chargé : tous les autres appellent t('clé'). La langue
 * est choisie au démarrage (stockage.js) et changée dans les réglages.
 * Dans index.html, les textes portent data-t, data-t-html ou data-t-attr,
 * relus par I18n.appliquer à chaque changement de langue.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const I18n = {
    /** Langues de l'interface. La première sert de secours. */
    LANGUES: ['fr', 'en', 'es', 'de'],

    /** Langue affichée. */
    langue: 'fr',

    /**
     * Langue du navigateur, si l'interface la connaît.
     *
     * @returns {string} Code de langue de LANGUES.
     */
    defaut() {
        const langue = (navigator.language || 'fr').slice(0, 2).toLowerCase();
        return this.LANGUES.includes(langue) ? langue : 'fr';
    },

    /**
     * Change la langue de l'interface.
     *
     * @param {string} langue - Code de langue ; une langue inconnue donne le français.
     */
    definir(langue) {
        this.langue = this.LANGUES.includes(langue) ? langue : 'fr';
        document.documentElement.lang = this.langue;
    },

    /**
     * Texte d'une clé, avec ses valeurs.
     *
     * @param {string} cle - Clé du dictionnaire.
     * @param {Object} [valeurs] - Valeurs des {marqueurs} du texte.
     * @returns {string} Texte traduit, ou le texte français, ou la clé.
     */
    t(cle, valeurs) {
        const table = this.TEXTES[this.langue] || this.TEXTES.fr;
        let texte = table[cle];
        if (texte === undefined) {
            texte = this.TEXTES.fr[cle];
        }
        if (texte === undefined) {
            return cle;
        }
        if (!valeurs) {
            return texte;
        }
        return texte.replace(/\{(\w+)\}/g, (marque, nom) => (valeurs[nom] === undefined ? marque : valeurs[nom]));
    },

    /**
     * Texte au singulier ou au pluriel selon un nombre, dans la langue affichée.
     *
     * Le singulier a la clé du pluriel suivie de "-un". En français, 0 et 1 sont au singulier.
     *
     * @param {string} cle - Clé du pluriel.
     * @param {number} nombre - Nombre qui décide de l'accord.
     * @param {Object} [valeurs] - Valeurs des {marqueurs} du texte.
     * @returns {string} Texte traduit et accordé.
     */
    accorde(cle, nombre, valeurs) {
        const un = new Intl.PluralRules(this.langue).select(nombre) === 'one';
        return this.t(un ? cle + '-un' : cle, valeurs);
    },

    /**
     * Indique si une clé existe dans la langue affichée ou en français.
     *
     * @param {string} cle - Clé du dictionnaire.
     * @returns {boolean} true si un texte lui répond.
     */
    existe(cle) {
        return this.TEXTES[this.langue][cle] !== undefined || this.TEXTES.fr[cle] !== undefined;
    },

    /**
     * Date et heure au format court de la langue affichée.
     *
     * @param {Date|number} date - Date à écrire.
     * @returns {string} Date et heure, par exemple "22/09/2026 19:40".
     */
    dateHeure(date) {
        return new Intl.DateTimeFormat(this.langue, { dateStyle: 'short', timeStyle: 'short' }).format(date);
    },

    /**
     * Heure seule au format court de la langue affichée.
     *
     * @param {Date|number} date - Date à écrire.
     * @returns {string} Heure, par exemple "19:40".
     */
    heure(date) {
        return new Intl.DateTimeFormat(this.langue, { timeStyle: 'short' }).format(date);
    },

    /**
     * Traduit la page : textes, textes avec lien, et attributs.
     *
     * data-t-html reçoit du HTML écrit ici, jamais du texte du modèle.
     */
    appliquer() {
        for (const element of document.querySelectorAll('[data-t]')) {
            element.textContent = this.t(element.dataset.t);
        }
        for (const element of document.querySelectorAll('[data-t-html]')) {
            element.innerHTML = this.t(element.dataset.tHtml);
        }
        /* data-t-attr="aria-label:menu.fermer;title:menu.fermer" */
        for (const element of document.querySelectorAll('[data-t-attr]')) {
            for (const paire of element.dataset.tAttr.split(';')) {
                const [attribut, cle] = paire.split(':');
                element.setAttribute(attribut.trim(), this.t(cle.trim()));
            }
        }
    },

    /* Rempli par langues/fr.js, en.js, es.js, de.js. */
    TEXTES: {}
};

/**
 * Raccourci de I18n.t, appelé partout dans l'interface.
 *
 * @param {string} cle - Clé du dictionnaire.
 * @param {Object} [valeurs] - Valeurs des {marqueurs} du texte.
 * @returns {string} Texte traduit.
 */
function t(cle, valeurs) {
    return I18n.t(cle, valeurs);
}

/**
 * Traduit et accorde un texte selon un nombre (voir I18n.accorde).
 */
function tn(cle, nombre, valeurs) {
    return I18n.accorde(cle, nombre, valeurs);
}

/* Export pour les tests Node ; ignoré dans le navigateur. Les autres
   modules lisent t et I18n comme variables globales. */
if (typeof module !== 'undefined') {
    module.exports = I18n;
    globalThis.t = t;
    globalThis.tn = tn;
    globalThis.I18n = I18n;
    for (const langue of I18n.LANGUES) {
        require('../langues/' + langue + '.js');
    }
}
