/*
 * tools/calcul/tirage.js
 * Tirage au sort de l'outil tirage : un nombre, une liste mélangée, des
 * groupes. Le hasard vient de crypto.getRandomValues : un modèle qui
 * "tire au sort" choisit toujours un peu les mêmes.
 *
 * Appelé par outils.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const Tirage = {
    /**
     * Entier au hasard dans [0, n[.
     *
     * @param {number} n - Borne exclue.
     * @returns {number} L'entier.
     */
    hasard(n) {
        return Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 * n);
    },

    /**
     * Mélange une liste (Fisher-Yates), sans toucher l'originale.
     *
     * @param {Array} liste - Éléments à mélanger.
     * @returns {Array} Copie mélangée.
     */
    melanger(liste) {
        const copie = [...liste];
        for (let i = copie.length - 1; i > 0; i--) {
            const j = this.hasard(i + 1);
            [copie[i], copie[j]] = [copie[j], copie[i]];
        }
        return copie;
    },

    /**
     * Répartit les éléments au hasard en groupes égaux à un près.
     *
     * @param {Array} liste - Éléments.
     * @param {number} groupes - Nombre de groupes.
     * @returns {Array<Array>} Les groupes.
     */
    repartir(liste, groupes) {
        const resultat = Array.from({ length: groupes }, () => []);
        this.melanger(liste).forEach((e, i) => resultat[i % groupes].push(e));
        return resultat;
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Tirage;
}
