/*
 * tools/calcul/formel.js
 * Calcul formel de l'outil calcul : équations, factorisation, dérivées,
 * primitives, limites, suites et tableaux de variations, par Giac (Xcas).
 *
 * Giac pèse 19 Mo : il tourne dans un worker (formel-worker.js), lancé au
 * premier usage, et arrêté si un calcul dure trop.
 * Appelé par outils.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

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

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Formel;
}
