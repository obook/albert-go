/*
 * calcul.js
 * Outils locaux du modèle : calcul, calendrier, compteur, tirage, statistiques.
 * Là où les modèles se trompent ; tout reste dans le navigateur.
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

const Compteur = {
    /**
     * Compte les mots (séparés par des espaces) et les caractères d'un texte.
     *
     * @param {string} texte - Texte à compter.
     * @returns {Object} { mots, caracteres, sansEspaces }.
     */
    compter(texte) {
        const propre = String(texte).trim();
        return {
            mots: propre ? propre.split(/\s+/).length : 0,
            caracteres: [...propre].length,
            sansEspaces: [...propre.replace(/\s/g, '')].length
        };
    }
};

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

const Statistiques = {
    /**
     * Statistiques d'une série, quartiles comme au lycée.
     *
     * @param {Array<number|string>} valeurs - Série, virgule décimale acceptée.
     * @returns {Object} Effectif, moyenne, médiane, variance, écart-type, extrêmes, quartiles, étendue, écart interquartile.
     */
    calculer(valeurs) {
        const serie = (valeurs || []).map(v => Number(String(v).replace(',', '.'))).sort((a, b) => a - b);
        if (!serie.length || serie.some(v => !Number.isFinite(v))) {
            throw new Error(t('statistiques.invalide'));
        }
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

/**
 * Définition d'un outil pour le champ "tools" de l'API.
 *
 * @param {string} nom - Nom de l'outil, préfixe de ses textes dans i18n.js.
 * @param {Object} proprietes - { paramètre: type JSON Schema }.
 * @param {string[]} requis - Paramètres obligatoires.
 * @returns {Object} Entrée du champ tools.
 */
function definirOutil(nom, proprietes, requis) {
    const properties = {};
    for (const [cle, schema] of Object.entries(proprietes)) {
        properties[cle] = { ...schema, description: t(nom + '.' + cle) };
    }
    return {
        type: 'function',
        function: { name: nom, description: t(nom + '.description'), parameters: { type: 'object', properties, required: requis } }
    };
}

/** Nombre au format de la langue, sans séparateur de milliers. */
const formaterNombre = (v, langue) => Number(v.toPrecision(12)).toLocaleString(langue, { maximumFractionDigits: 4, useGrouping: false });

/* Le nom sert de réglage, de clé de stockage et de préfixe i18n. */
const OUTILS_LOCAUX = {
    calcul: {
        icone: 'calculatrice',
        outil: () => definirOutil('calcul', { expression: { type: 'string' } }, ['expression']),
        executer: (a, langue) => a.expression + ' = '
            + Calcul.evaluer(a.expression).toLocaleString(langue, { maximumFractionDigits: 12, useGrouping: false })
    },
    statistiques: {
        icone: 'statistiques',
        outil: () => definirOutil('statistiques', { valeurs: { type: 'array', items: { type: 'number' } } }, ['valeurs']),
        executer: (a, langue) => {
            const s = Statistiques.calculer(a.valeurs);
            const f = {};
            for (const [cle, v] of Object.entries(s)) {
                f[cle] = formaterNombre(v, langue);
            }
            return t('statistiques.resultat', f);
        }
    },
    tirage: {
        icone: 'de',
        outil: () => definirOutil('tirage', {
            elements: { type: 'array', items: { type: 'string' } },
            groupes: { type: 'integer' },
            nombre: { type: 'integer' }
        }, ['elements']),
        executer: (a) => {
            const elements = (a.elements || []).map(String).filter(Boolean);
            if (!elements.length) {
                throw new Error(t('tirage.invalide'));
            }
            if (a.groupes > 1) {
                return Tirage.repartir(elements, Math.min(a.groupes, elements.length))
                    .map((g, i) => t('tirage.groupe', { numero: i + 1, membres: g.join(', ') })).join(' ; ');
            }
            const ordre = Tirage.melanger(elements);
            return a.nombre > 0
                ? t('tirage.tires', { liste: ordre.slice(0, a.nombre).join(', ') })
                : t('tirage.ordre', { liste: ordre.join(', ') });
        }
    },
    calendrier: {
        icone: 'calendrier',
        outil: () => definirOutil('calendrier', { date: { type: 'string' }, jours: { type: 'integer' }, fin: { type: 'string' } }, ['date']),
        executer: (a, langue) => Calendrier.repondre(a, langue)
    },
    compteur: {
        icone: 'compteur',
        outil: () => definirOutil('compteur', { texte: { type: 'string' } }, ['texte']),
        executer: a => t('compteur.resultat', Compteur.compter(a.texte))
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = { Calcul, Calendrier, Compteur, Tirage, Statistiques, OUTILS_LOCAUX };
}
