/*
 * tools/calcul/compteur.js
 * Compteur de l'outil du même nom : mots, caractères, lettres, épellation,
 * ordre alphabétique et lisibilité. Un modèle compte mal les lettres : il
 * lit des morceaux de mots, pas des caractères.
 *
 * Appelé par outils.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const Compteur = {
    /**
     * Compte les mots et les caractères d'un texte ; un "?" isolé n'est pas un mot.
     *
     * @param {string} texte - Texte à compter.
     * @returns {Object} { mots, caracteres, sansEspaces }.
     */
    compter(texte) {
        const propre = String(texte).trim();
        return {
            mots: this.mots(propre).length,
            caracteres: [...propre].length,
            sansEspaces: [...propre.replace(/\s/g, '')].length
        };
    },

    /** Mots d'un texte ; un signe de ponctuation isolé n'en est pas un. */
    mots(texte) {
        return String(texte).trim().split(/\s+/).filter(m => /[\p{L}\p{N}]/u.test(m));
    },

    /** Texte sans accents ni majuscules, pour comparer des lettres. */
    nu(texte) {
        return String(texte).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    },

    /**
     * Compte une lettre, majuscules ignorées.
     *
     * "e" compte aussi é, è et ê ; "é" est comptée seule.
     *
     * @param {string} texte - Texte où chercher.
     * @param {string} lettre - Un seul caractère.
     * @returns {number} Nombre d'occurrences.
     */
    occurrences(texte, lettre) {
        const cible = String(lettre).trim().normalize('NFC').toLowerCase();
        if ([...cible].length !== 1) {
            throw new Error(t('compteur.invalide'));
        }
        const plier = this.nu(cible) === cible ? (s => this.nu(s)) : (s => s.normalize('NFC').toLowerCase());
        return [...plier(String(texte))].filter(c => c === cible).length;
    },

    /**
     * Épelle un texte : lettres séparées par des tirets, puis texte à l'envers.
     *
     * @param {string} texte - Mot ou courte phrase.
     * @returns {{lettres: string, envers: string}} Par exemple "c-h-a-t" et "tahc".
     */
    epeler(texte) {
        const propre = String(texte).trim().normalize('NFC');
        return {
            lettres: propre.split(/\s+/).map(m => [...m].join('-')).join(' '),
            envers: [...propre].reverse().join('')
        };
    },

    /**
     * Lettres triées, sans accents ni majuscules : deux anagrammes donnent le même résultat.
     *
     * @param {string} texte - Mot ou phrase.
     * @returns {string} Par exemple "ceehin" pour "Chien é".
     */
    trier(texte) {
        return [...this.nu(texte).replace(/[^\p{L}\p{N}]/gu, '')].sort().join('');
    },

    /* Seuils d'Albert Go, sans norme. */
    PHRASE_LONGUE: 20,
    MOT_LONG: 10,

    /**
     * Mesures de lisibilité d'un texte.
     *
     * @param {string} texte - Texte à mesurer.
     * @returns {Object} { phrases, moyenne, max, longues, longs }.
     */
    lisibilite(texte) {
        /* ponytail: "M. Dupont" compte pour deux phrases. */
        const phrases = String(texte).split(/[.!?…]+(?:\s+|$)/).map(p => this.mots(p).length).filter(Boolean);
        if (!phrases.length) {
            throw new Error(t('compteur.invalide'));
        }
        return {
            phrases: phrases.length,
            moyenne: phrases.reduce((a, b) => a + b, 0) / phrases.length,
            max: Math.max(...phrases),
            longues: phrases.filter(n => n > this.PHRASE_LONGUE).length,
            longs: this.mots(texte).filter(m => [...m.replace(/[^\p{L}]/gu, '')].length >= this.MOT_LONG).length
        };
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Compteur;
}
