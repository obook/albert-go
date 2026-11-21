/*
 * tools/calcul/calcul.js
 * Outils locaux du modèle : calcul (math.js, avec facteurs premiers, PGCD, PPCM, statistiques, moyenne
 * pondérée et dérivée ; calcul formel par Giac), calendrier (jours ouvrés, fériés et échéances), compteur (mots, lettres, lisibilité), tirage.
 * Là où les modèles se trompent ; tout reste dans le navigateur.
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

/* Calcul formel : Giac dans un worker (formel-worker.js), lancé au premier usage. */
const Formel = {
    /** Adresse du worker, relative à la page. */
    WORKER: 'js/tools/calcul/formel-worker.js',

    /** Temps laissé à un calcul. Giac ne s'interrompt pas : passé ce délai, le worker est arrêté. */
    DELAI_MS: 10000,

    /** Temps laissé au chargement de Giac (19 Mo la première fois). */
    DELAI_CHARGEMENT_MS: 60000,

    /** Début d'une commande Xcas citée dans calcul.formel. */
    COMMANDE: /^\s*(solve|factor|expand|simplify|diff|integrate|limit|sum|binomial|binomial_cdf|normald_cdf|rsolve|tabvar)\s*\(/,

    /**
     * Lance le worker s'il ne tourne pas.
     *
     * @returns {Promise<Worker>} Résolue quand Giac est prêt.
     */
    demarrer() {
        this._pret ??= new Promise((resoudre, rejeter) => {
            const worker = new Worker(this.WORKER);
            const echouer = () => {
                clearTimeout(minuterie);
                this.arreter();
                rejeter(new Error(t('calcul.indisponible')));
            };
            const minuterie = setTimeout(echouer, this.DELAI_CHARGEMENT_MS);
            worker.onerror = echouer;
            worker.onmessage = (e) => {
                if (!e.data.pret) {
                    echouer();
                    return;
                }
                clearTimeout(minuterie);
                resoudre(worker);
            };
            this._worker = worker;
        });
        return this._pret;
    },

    /** Arrête le worker ; le prochain calcul en relance un. */
    arreter() {
        this._worker?.terminate();
        this._worker = this._pret = undefined;
    },

    /**
     * Passe une commande à Giac. Les appels se suivent un à un : le délai ne
     * compte que le calcul demandé.
     *
     * @param {string} commande - Commande Xcas, par exemple "factor(x^2 - 5x + 6)".
     * @returns {Promise<string>} Résultat au format Xcas.
     */
    calculer(commande) {
        const suite = (this._file || Promise.resolve()).then(() => this._lancer(commande));
        this._file = suite.catch(() => {});
        return suite;
    },

    /** Début d'une demande de tableau de variations. */
    TABLEAU: /^\s*tabvar\s*\(/,

    /* Retiré le 21/11/2026 : appelée par les seuls tests, qui enchaînent eux-mêmes les deux appels.
    async varier(commande) {
        return this.tableau(await this.sortieTableau(commande));
    },
    */

    /**
     * Sortie LaTeX de Giac pour un tableau de variations, lue par tableau() et lecture().
     * derive=1 : dérivée première seule, sur tout le domaine ; sans lui, Giac réduit
     * une fonction impaire à x >= 0.
     *
     * @param {string} commande - Par exemple "tabvar(x^3 - 3x)".
     * @returns {Promise<string>} Sortie LaTeX de Giac.
     */
    sortieTableau(commande) {
        const entiere = /derive\s*=/.test(commande) ? commande : commande.replace(/\)\s*$/, ', derive=1)');
        return this.calculer('latex(' + entiere + ')');
    },

    /** Lignes x, y' et y de cette sortie, case par case ; la première case de la ligne x est la variable. */
    _lignesTableau(latex) {
        const corps = /\\begin\{array\}\{c*\}([\s\S]*?)\\end\{array\}/.exec(latex);
        const lignes = corps ? corps[1].split('\\\\').map(ligne => ligne.split('&').map(c => c.trim()
            .replace(/\\mathrm\{inv\}\\left\(([^()]*)\\right\)/g, '\\frac{1}{$1}').replace(/e\^\{1\}/g, 'e'))) : [];
        if (lignes.length < 3) {
            throw new Error(t('calcul.invalide'));
        }
        return lignes;
    },

    /**
     * Le tableau en trois lignes de texte, pour le modèle : sur le tableau
     * LaTeX, aux valeurs sur trois étages, il confond maximum et minimum.
     *
     * @param {string} latex - Sortie de sortieTableau().
     * @returns {string} Lignes x, f' et f ; "||" à une valeur interdite.
     */
    lecture(latex) {
        const [[variable, ...x], [, ...derivee], [, ...f]] = this._lignesTableau(latex);
        const barre = j => /\|\|/.test(derivee[j] || '');
        return [
            variable + ' : ' + x.filter((c, j) => c && !(barre(j) && barre(j - 1))).join(' ; '),
            'f\'(' + variable + ') : ' + derivee.map((c, j) => (barre(j) ? (barre(j - 1) ? '' : '||')
                : (j > 0 && j < derivee.length - 1 && /^[+\-0]$/.test(c) ? c : ''))).filter(Boolean).join(' ; '),
            'f(' + variable + ') : ' + f.map((c, j) => (barre(j) && barre(j + 1) ? c + ' ||' : c.replace('\\nearrow', '↗').replace('\\searrow', '↘'))).join(' ')
        ].join('\n');
    },

    /**
     * Met le tableau de Giac à la façon du lycée : signes et zéros de la
     * dérivée, valeurs de f en haut ou en bas selon les flèches, double barre
     * à une valeur interdite (que Giac donne en deux colonnes).
     *
     * @param {string} latex - Sortie de latex(tabvar(...)) : trois lignes x, y' et y.
     * @returns {string} Tableau au format array de LaTeX.
     */
    tableau(latex) {
        const [[variable, ...x], [, ...derivee], [, ...f]] = this._lignesTableau(latex);
        const barre = j => j >= 0 && /\|\|/.test(derivee[j]) && /\|\|/.test(derivee[j + 1] || '');
        const fleche = j => (/\\(ne|se)arrow/.exec(f[j] || '') || [])[1];
        /* Une valeur va en haut après une montée ou avant une descente, en bas dans l'autre cas. */
        const hauteur = (j) => {
            const haut = fleche(j - 1) === 'ne' || fleche(j + 1) === 'se';
            const bas = fleche(j - 1) === 'se' || fleche(j + 1) === 'ne';
            if (fleche(j) || haut === bas) {
                return 'milieu';
            }
            return haut ? 'haut' : 'bas';
        };
        const etage = nom => f.map((c, j) => (hauteur(j) === nom ? c : ''));
        const rangees = [
            [variable, ...x.map((c, j) => (barre(j - 1) ? '' : c))],
            ['f\'(' + variable + ')', ...derivee.map((c, j) => (j > 0 && j < derivee.length - 1 && /^[+\-0]$/.test(c) ? c : ''))],
            ['', ...etage('haut')],
            ['f(' + variable + ')', ...etage('milieu')],
            ['', ...etage('bas')]
        ].map(rangee => rangee.join(' & '));
        const colonnes = x.map((c, j) => 'c' + (barre(j) ? '||' : '')).join('');
        /* arraystretch : sans lui, les filets collent aux lignes. */
        return ('\\def\\arraystretch{1.4}\\begin{array}{c|' + colonnes + '} ' + rangees[0] + ' \\\\ \\hline ' + rangees[1] + ' \\\\ \\hline '
            + rangees[2] + ' \\\\ ' + rangees[3] + ' \\\\ ' + rangees[4] + ' \\end{array}').replace(/ +/g, ' ');
    },

    /**
     * Envoie une commande au worker et attend son résultat. Trop long : le worker est
     * arrêté (Giac ne s'interrompt pas), le calcul suivant en relance un.
     *
     * @param {string} commande - Commande Xcas.
     * @returns {Promise<string>} Résultat au format Xcas, ou une erreur traduite.
     */
    async _lancer(commande) {
        const worker = await this.demarrer();
        return new Promise((resoudre, rejeter) => {
            const minuterie = setTimeout(() => {
                this.arreter();
                rejeter(new Error(t('calcul.long')));
            }, this.DELAI_MS);
            worker.onmessage = (e) => {
                clearTimeout(minuterie);
                const resultat = e.data.resultat;
                if (typeof resultat === 'string' && !resultat.startsWith('GIAC_ERROR')) {
                    resoudre(resultat);
                } else {
                    rejeter(new Error(t('calcul.invalide')));
                }
            };
            worker.postMessage(String(commande));
        });
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. Les morceaux de
   tools/calcul/ y sont chargés ici ; leurs objets deviennent globaux, comme
   dans la page, pour que outils.js les trouve. */
if (typeof module !== 'undefined') {
    const Calendrier = require('./calendrier.js');
    const Controle = require('./controle.js');
    const Compteur = require('./compteur.js');
    const Tirage = require('./tirage.js');
    const { Facteurs, Statistiques } = require('./nombres.js');
    Object.assign(globalThis, { Calcul, Formel, Calendrier, Compteur, Controle, Tirage, Statistiques, Facteurs });
    const { OUTILS_LOCAUX, definirOutil } = require('./outils.js');
    module.exports = { Calcul, Formel, Calendrier, Compteur, Controle, Tirage, Statistiques, Facteurs, OUTILS_LOCAUX, definirOutil };
}
