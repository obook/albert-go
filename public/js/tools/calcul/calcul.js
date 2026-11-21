/*
 * tools/calcul/calcul.js
 * Calcul numérique de l'outil calcul : expressions math.js, en degrés, et dérivées.
 *
 * Les outils locaux du modèle font ce sur quoi les modèles se trompent, sans
 * rien envoyer hors du navigateur. Un fichier par outil dans tools/calcul/ :
 *   calcul.js (ce fichier), formel.js (Giac), calendrier.js, controle.js,
 *   compteur.js, tirage.js, nombres.js (facteurs et statistiques),
 *   outils.js (définitions pour le modèle, chargé en dernier).
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

/* Angles en degrés, comme en classe. Le presque zéro est ramené à zéro : sin(180) = 0. */
const RAD = Math.PI / 180;
const net = v => (Math.abs(v) < 1e-12 ? 0 : v);

const Calcul = {
    /** Chiffres significatifs des résultats : le maximum affiché par la NumWorks. */
    CHIFFRES: 10,

    /** Adresse de math.js, relative à la page ; chargé au premier calcul. */
    MATHJS: 'vendor/mathjs/math.js',

    /**
     * Charge math.js au premier calcul : 175 ko compressés que la plupart des
     * questions n'utilisent pas. Déjà là dans les tests Node.
     *
     * @returns {Promise<void>} Résolue quand la variable globale math existe.
     */
    charger() {
        if (typeof math !== 'undefined') {
            return Promise.resolve();
        }
        this._chargement ??= new Promise((resoudre, rejeter) => {
            const script = document.createElement('script');
            script.src = this.MATHJS;
            script.onload = resoudre;
            script.onerror = rejeter;
            document.head.append(script);
        });
        return this._chargement;
    },

    /**
     * Instance de math.js réglée pour la classe : angles en degrés, log
     * décimal et ln népérien, pgcd et ppcm en français, racine d'un négatif
     * impossible (predictable) ; les complexes restent possibles quand
     * l'expression écrit i, pour la Terminale. Les fonctions qui touchent
     * au parseur lui-même sont coupées, comme le demande la page Security de
     * math.js : l'expression vient du modèle.
     *
     * @param {boolean} [radians] - true pour les courbes : sin(x) en radians, comme au lycée.
     * @returns {Function} evaluate de cette instance.
     */
    moteur(radians = false) {
        const cle = radians ? '_evaluerRadians' : '_evaluer';
        if (this[cle]) {
            return this[cle];
        }
        const m = math.create(math.all);
        m.config({ predictable: true });
        const evaluer = m.evaluate;
        const interdit = () => {
            throw new Error(t('calcul.invalide'));
        };
        const degres = radians ? {} : {
            sin: x => net(Math.sin(x * RAD)),
            cos: x => net(Math.cos(x * RAD)),
            tan: x => net(Math.sin(x * RAD)) / net(Math.cos(x * RAD)),
            asin: x => Math.asin(x) / RAD,
            acos: x => Math.acos(x) / RAD,
            atan: x => Math.atan(x) / RAD
        };
        m.import({
            ...degres,
            ln: x => Math.log(x),
            log: x => Math.log10(x),
            pgcd: m.gcd,
            ppcm: m.lcm,
            import: interdit,
            createUnit: interdit,
            reviver: interdit,
            evaluate: interdit,
            parse: interdit,
            compile: interdit,
            simplify: interdit,
            derivative: interdit,
            resolve: interdit
        }, { override: true });
        this[cle] = evaluer;
        return evaluer;
    },

    /**
     * Évalue une expression avec math.js (voir moteur). Le point est le
     * séparateur décimal, la virgule sépare les arguments : pgcd(84, 126).
     *
     * @param {string} expression - Par exemple "(12.5 + 3) * sin(30)".
     * @returns {number|string} Nombre arrondi à CHIFFRES chiffres significatifs, ou
     *     texte pour une fraction, une unité, une matrice.
     */
    evaluer(expression) {
        let resultat;
        try {
            resultat = this.moteur()(String(expression));
        } catch (err) {
            throw new Error(t('calcul.invalide'));
        }
        if (typeof resultat === 'number') {
            if (!Number.isFinite(resultat)) {
                throw new Error(t('calcul.invalide'));
            }
            return Number(resultat.toPrecision(this.CHIFFRES));
        }
        /* Rien à montrer (expression vide) ou une fonction définie par l'expression. */
        if (resultat === undefined || typeof resultat === 'function') {
            throw new Error(t('calcul.invalide'));
        }
        return math.format(resultat, { precision: this.CHIFFRES });
    },

    /**
     * Dérive une expression par rapport à x.
     *
     * Instance à part, en radians. ln népérien et log décimal, comme dans evaluer.
     *
     * @param {string} expression - Par exemple "x^3 + ln(x)".
     * @returns {string} La dérivée, au format math.js.
     */
    deriver(expression) {
        if (!this._formel) {
            const m = math.create(math.all);
            const outils = { m: m, parse: m.parse, derivative: m.derivative };
            const interdit = () => {
                throw new Error(t('calcul.invalide'));
            };
            /* Mêmes coupures que moteur. */
            m.import(Object.fromEntries(['import', 'createUnit', 'reviver', 'evaluate', 'parse', 'compile', 'simplify',
                'derivative', 'resolve'].map(nom => [nom, interdit])), { override: true });
            this._formel = outils;
        }
        const { m, parse, derivative } = this._formel;
        const appel = (nom, args) => new m.FunctionNode(nom, args);
        const est = (n, nom, arite) => n.isFunctionNode && n.fn.name === nom && n.args.length === arite;
        const dix = n => n.isConstantNode && n.value === 10;
        try {
            /* math.js écrit log(x) pour ln et log(x, 10) pour log. */
            const entree = parse(String(expression)).transform(n => (est(n, 'ln', 1) ? appel('log', n.args)
                : (est(n, 'log', 1) ? appel('log', [n.args[0], new m.ConstantNode(10)]) : n)));
            return derivative(entree, 'x').transform(n => (est(n, 'log', 1) ? appel('ln', n.args)
                : (est(n, 'log', 2) && dix(n.args[1]) ? appel('log', [n.args[0]]) : n))).toString();
        } catch (err) {
            throw new Error(t('calcul.invalide'));
        }
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. Les morceaux de
   tools/calcul/ y sont chargés ici ; leurs objets deviennent globaux, comme
   dans la page, pour que outils.js les trouve. */
if (typeof module !== 'undefined') {
    const Formel = require('./formel.js');
    const Calendrier = require('./calendrier.js');
    const Controle = require('./controle.js');
    const Compteur = require('./compteur.js');
    const Tirage = require('./tirage.js');
    const { Facteurs, Statistiques } = require('./nombres.js');
    Object.assign(globalThis, { Calcul, Formel, Calendrier, Compteur, Controle, Tirage, Statistiques, Facteurs });
    const { OUTILS_LOCAUX, definirOutil } = require('./outils.js');
    module.exports = { Calcul, Formel, Calendrier, Compteur, Controle, Tirage, Statistiques, Facteurs, OUTILS_LOCAUX, definirOutil };
}
