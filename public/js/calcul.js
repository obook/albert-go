/*
 * calcul.js
 * Calcul exact et calendrier, proposés au modèle comme outils : les
 * modèles se trompent en arithmétique et sur le jour de la semaine.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/* Angles en degrés, comme en classe. Le presque zéro est ramené à zéro : sin(180) = 0. */
const RAD = Math.PI / 180;
const net = v => (Math.abs(v) < 1e-12 ? 0 : v);

const Calcul = {
    /** Fonctions acceptées ; log est le logarithme décimal, ln le népérien. */
    FONCTIONS: {
        sqrt: Math.sqrt,
        abs: Math.abs,
        round: Math.round,
        floor: Math.floor,
        ceil: Math.ceil,
        exp: Math.exp,
        ln: Math.log,
        log: Math.log10,
        sin: x => net(Math.sin(x * RAD)),
        cos: x => net(Math.cos(x * RAD)),
        tan: x => net(Math.sin(x * RAD)) / net(Math.cos(x * RAD)),
        asin: x => Math.asin(x) / RAD,
        acos: x => Math.acos(x) / RAD,
        atan: x => Math.atan(x) / RAD
    },

    /** Constantes acceptées. */
    CONSTANTES: { pi: Math.PI, e: Math.E },

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
     * Évalue une expression : + - * / ^, parenthèses, FONCTIONS et CONSTANTES.
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
            if (Object.hasOwn(this.CONSTANTES, j)) {
                return this.CONSTANTES[j];
            }
            if (Object.hasOwn(this.FONCTIONS, j)) {
                lire('(');
                const v = somme();
                lire(')');
                return this.FONCTIONS[j](v);
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

const Calendrier = {
    /**
     * Outil proposé au modèle, au format "tools" de l'API.
     *
     * @returns {Object} Entrée du champ tools.
     */
    outil() {
        return {
            type: 'function',
            function: {
                name: 'calendrier',
                description: t('calendrier.description'),
                parameters: {
                    type: 'object',
                    properties: {
                        date: { type: 'string', description: t('calendrier.date') },
                        jours: { type: 'integer', description: t('calendrier.jours') },
                        fin: { type: 'string', description: t('calendrier.fin') }
                    },
                    required: ['date']
                }
            }
        };
    },

    /**
     * Lit une date AAAA-MM-JJ ; refuse le 31 février.
     *
     * @param {string} texte - Date au format ISO.
     * @returns {Date} La date, à minuit heure locale.
     */
    lire(texte) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texte).trim());
        const d = m && new Date(Number(m[1]), m[2] - 1, Number(m[3]));
        if (!d || d.getMonth() !== m[2] - 1 || d.getDate() !== Number(m[3])) {
            throw new Error(t('calendrier.invalide'));
        }
        return d;
    },

    /**
     * Répond à un appel : jour de la semaine, date décalée ou écart entre deux dates.
     *
     * @param {Object} demande - { date, jours?, fin? }.
     * @param {string} langue - Code de langue de l'interface.
     * @returns {string} Une ligne pour le modèle et pour la trace.
     */
    repondre(demande, langue) {
        const format = new Intl.DateTimeFormat(langue, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const debut = this.lire(demande.date);
        if (demande.fin) {
            const fin = this.lire(demande.fin);
            /* En UTC : un changement d'heure ne décale pas le compte. */
            const ecart = (Date.UTC(fin.getFullYear(), fin.getMonth(), fin.getDate())
                - Date.UTC(debut.getFullYear(), debut.getMonth(), debut.getDate())) / 86400000;
            return t('calendrier.ecart', { debut: format.format(debut), fin: format.format(fin), jours: ecart });
        }
        if (Number.isInteger(demande.jours) && demande.jours !== 0) {
            const decale = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + demande.jours);
            return t('calendrier.decale', { debut: format.format(debut), jours: demande.jours, date: format.format(decale) });
        }
        return format.format(debut);
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = { Calcul, Calendrier };
}
