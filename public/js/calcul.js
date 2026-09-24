/*
 * calcul.js
 * Calcul exact, proposé au modèle comme un outil : les modèles se
 * trompent en arithmétique.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

const Calcul = {
    /**
     * Outil proposé au modèle, au format "tools" de l'API.
     *
     * @returns {Object} Entrée du champ tools.
     */
    outil() {
        return {
            type: 'function',
            function: {
                name: 'calcul',
                description: t('calcul.description'),
                parameters: {
                    type: 'object',
                    properties: { expression: { type: 'string', description: t('calcul.parametre') } },
                    required: ['expression']
                }
            }
        };
    },

    /**
     * Évalue une expression : + - * / ^, parenthèses, sqrt et pi.
     *
     * Analyseur à descente récursive, sans eval. La virgule décimale est acceptée.
     *
     * @param {string} expression - Par exemple "(12,5 + 3) * 2^3".
     * @returns {number} Résultat arrondi à 12 chiffres significatifs.
     */
    evaluer(expression) {
        const jetons = String(expression).replace(/,/g, '.').match(/\d+\.?\d*|\.\d+|[a-z]+|\S/gi) || [];
        let i = 0;
        const lire = attendu => {
            if (jetons[i] !== attendu) {
                throw new Error(t('calcul.invalide'));
            }
            i++;
        };
        const somme = () => {
            let v = produit();
            while (jetons[i] === '+' || jetons[i] === '-') {
                v = jetons[i++] === '+' ? v + produit() : v - produit();
            }
            return v;
        };
        const produit = () => {
            let v = unaire();
            while (jetons[i] === '*' || jetons[i] === '/') {
                v = jetons[i++] === '*' ? v * unaire() : v / unaire();
            }
            return v;
        };
        /* Le moins passe après la puissance : -2^2 = -4. */
        const unaire = () => {
            if (jetons[i] === '-' || jetons[i] === '+') {
                return jetons[i++] === '-' ? -unaire() : unaire();
            }
            return puissance();
        };
        /* ^ associe à droite : 2^3^2 = 2^9. */
        const puissance = () => {
            const base = atome();
            if (jetons[i] === '^') {
                i++;
                return base ** unaire();
            }
            return base;
        };
        const atome = () => {
            const j = jetons[i++];
            if (j === '(') {
                const v = somme();
                lire(')');
                return v;
            }
            if (j === 'pi') {
                return Math.PI;
            }
            if (j === 'sqrt') {
                lire('(');
                const v = somme();
                lire(')');
                return Math.sqrt(v);
            }
            if (/^[\d.]/.test(j || '')) {
                return Number(j);
            }
            throw new Error(t('calcul.invalide'));
        };
        const resultat = somme();
        if (i < jetons.length || !Number.isFinite(resultat)) {
            throw new Error(t('calcul.invalide'));
        }
        return Number(resultat.toPrecision(12));
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Calcul;
}
