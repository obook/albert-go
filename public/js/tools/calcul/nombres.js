/*
 * tools/calcul/nombres.js
 * Arithmétique et statistiques de l'outil calcul : facteurs premiers, PGCD,
 * PPCM (Facteurs), puis moyenne, médiane, quartiles et moyenne pondérée
 * (Statistiques). math.js ne décompose pas, et le modèle se trompe sur ces calculs.
 *
 * Appelé par outils.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const Facteurs = {
    /** Plus grand nombre accepté : sa racine, un million, borne les divisions. */
    MAX: 1e12,

    /**
     * Décompose un entier en facteurs premiers, par divisions successives.
     *
     * @param {number} n - Entier de 2 à MAX.
     * @returns {Array<Array<number>>} Couples [premier, exposant], du plus petit au plus grand.
     */
    decomposer(n) {
        if (!Number.isSafeInteger(n) || n < 2 || n > this.MAX) {
            throw new Error(t('calcul.invalide'));
        }
        const facteurs = [];
        for (let p = 2; p * p <= n; p += (p === 2 ? 1 : 2)) {
            let exposant = 0;
            while (n % p === 0) {
                n /= p;
                exposant++;
            }
            if (exposant) {
                facteurs.push([p, exposant]);
            }
        }
        if (n > 1) {
            facteurs.push([n, 1]);
        }
        return facteurs;
    },

    /** PGCD par l'algorithme d'Euclide. */
    pgcd(a, b) {
        return b ? this.pgcd(b, a % b) : a;
    },

    /**
     * PPCM d'une liste, en BigInt : celui de grands nombres dépasse la
     * précision des nombres ordinaires.
     *
     * @param {number[]} nombres - Entiers déjà validés par decomposer.
     * @returns {string} Le PPCM, en chiffres.
     */
    ppcm(nombres) {
        let m = 1n;
        for (const n of nombres) {
            /* pgcd(m, n) = pgcd(m mod n, n), qui tient dans un nombre ordinaire. */
            m = m / BigInt(this.pgcd(Number(m % BigInt(n)), n)) * BigInt(n);
        }
        return m.toString();
    },

    /**
     * Décompose chaque nombre ; pour plusieurs nombres, ajoute PGCD et PPCM.
     *
     * @param {number[]} nombres - Entiers de 2 à MAX.
     * @returns {string} Une ligne pour le modèle et pour la trace.
     */
    decrire(nombres) {
        const lignes = nombres.map((n) => {
            const facteurs = this.decomposer(n);
            if (facteurs.length === 1 && facteurs[0][1] === 1) {
                return t('calcul.premier', { nombre: n });
            }
            return n + ' = ' + facteurs.map(([p, e]) => (e > 1 ? p + '^' + e : String(p))).join(' × ');
        });
        if (nombres.length > 1) {
            lignes.push(t('calcul.pgcd-ppcm', { pgcd: nombres.reduce((d, n) => this.pgcd(d, n)), ppcm: this.ppcm(nombres) }));
        }
        return lignes.join(' ; ');
    }
};

const Statistiques = {
    /**
     * Lit une série de nombres, virgule décimale acceptée.
     *
     * @param {Array<number|string>} valeurs - Série.
     * @returns {number[]} Les nombres, dans l'ordre donné.
     */
    lire(valeurs) {
        const serie = (valeurs || []).map(v => Number(String(v).replace(',', '.')));
        if (!serie.length || serie.some(v => !Number.isFinite(v))) {
            throw new Error(t('calcul.invalide'));
        }
        return serie;
    },

    /**
     * Moyenne pondérée : notes et coefficients, dans le même ordre.
     *
     * @param {Array<number|string>} valeurs - Série.
     * @param {Array<number|string>} coefficients - Un coefficient positif par valeur.
     * @returns {{moyenne: number, total: number}} Moyenne et somme des coefficients.
     */
    ponderer(valeurs, coefficients) {
        const serie = this.lire(valeurs);
        const poids = this.lire(coefficients);
        const total = poids.reduce((a, b) => a + b, 0);
        if (poids.length !== serie.length || poids.some(p => p < 0) || total === 0) {
            throw new Error(t('calcul.invalide'));
        }
        return { moyenne: serie.reduce((a, v, i) => a + v * poids[i], 0) / total, total: total };
    },

    /**
     * Statistiques d'une série, quartiles comme au lycée.
     *
     * @param {Array<number|string>} valeurs - Série, virgule décimale acceptée.
     * @returns {Object} Effectif, moyenne, médiane, variance, écart-type, extrêmes, quartiles, étendue, écart interquartile.
     */
    calculer(valeurs) {
        const serie = this.lire(valeurs).sort((a, b) => a - b);
        const n = serie.length;
        const moyenne = serie.reduce((a, b) => a + b, 0) / n;
        const milieu = Math.floor(n / 2);
        const variance = serie.reduce((a, v) => a + (v - moyenne) ** 2, 0) / n;
        const q1 = serie[Math.ceil(n / 4) - 1];
        const q3 = serie[Math.ceil(3 * n / 4) - 1];
        return {
            effectif: n,
            moyenne: moyenne,
            mediane: n % 2 ? serie[milieu] : (serie[milieu - 1] + serie[milieu]) / 2,
            variance: variance,
            ecartType: Math.sqrt(variance),
            min: serie[0],
            max: serie[n - 1],
            etendue: serie[n - 1] - serie[0],
            q1: q1,
            q3: q3,
            interquartile: q3 - q1
        };
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = { Facteurs, Statistiques };
}
