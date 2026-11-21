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
     * Dimanche de Pâques (calendrier grégorien, algorithme de Meeus).
     *
     * @param {number} annee - Année.
     * @returns {Date} Le dimanche de Pâques, à minuit heure locale.
     */
    paques(annee) {
        const a = annee % 19;
        const b = Math.floor(annee / 100);
        const c = annee % 100;
        const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
        const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - c % 4) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const n = h + l - 7 * m + 114;
        return new Date(annee, Math.floor(n / 31) - 1, n % 31 + 1);
    },

    /**
     * Jours fériés en France, dans l'ordre de l'année.
     *
     * Noms en français : ce sont des fêtes françaises, le modèle les traduit.
     *
     * @param {number} annee - Année, de 1900 à 2200.
     * @param {boolean} [alsace] - true pour ajouter les deux jours de l'Alsace-Moselle.
     * @returns {Array<[Date, string]>} Couples [date, nom].
     */
    feries(annee, alsace = false) {
        if (!Number.isInteger(annee) || annee < 1900 || annee > 2200) {
            throw new Error(t('calendrier.invalide'));
        }
        const p = this.paques(annee);
        const jour = (mois, j) => new Date(annee, mois - 1, j);
        const pascal = (ecart) => new Date(annee, p.getMonth(), p.getDate() + ecart);
        const liste = [[jour(1, 1), 'Jour de l\'an'], [pascal(1), 'Lundi de Pâques'], [jour(5, 1), 'Fête du Travail'],
            [jour(5, 8), 'Victoire 1945'], [pascal(39), 'Ascension'], [pascal(50), 'Lundi de Pentecôte'],
            [jour(7, 14), 'Fête nationale'], [jour(8, 15), 'Assomption'], [jour(11, 1), 'Toussaint'],
            [jour(11, 11), 'Armistice 1918'], [jour(12, 25), 'Noël']];
        if (alsace) {
            liste.push([pascal(-2), 'Vendredi saint, en Alsace-Moselle'], [jour(12, 26), 'Saint-Étienne, en Alsace-Moselle']);
        }
        return liste.sort((x, y) => x[0] - y[0]);
    },

    /**
     * Indique si une date est un jour ouvré : du lundi au vendredi, hors jour férié.
     *
     * @param {Date} date - Date à minuit.
     * @param {boolean} alsace - Jours fériés de l'Alsace-Moselle compris.
     * @returns {boolean} true pour un jour ouvré.
     */
    ouvre(date, alsace) {
        const jour = date.getDay();
        return jour !== 0 && jour !== 6
            && !this.feries(date.getFullYear(), alsace).some(([f]) => f.getTime() === date.getTime());
    },

    /* Au-delà de dix ans de jours ouvrés, la demande est une erreur. */
    OUVRES_MAX: 2600,

    /* Cent ans. */
    MOIS_MAX: 1200,

    /**
     * Répond à un appel : jour de la semaine, date décalée en jours ou en mois,
     * écart entre deux dates, en jours ou en jours ouvrés ; ou la liste des
     * jours fériés d'une année.
     *
     * @param {Object} demande - { date, jours?, mois?, report?, heures?, fin?, ouvres?, feries?, alsace_moselle? }.
     * @param {string} langue - Code de langue de l'interface.
     * @returns {string} Une ligne pour le modèle et pour la trace.
     */
    /**
     * Date et heure d'un instant, en toutes lettres dans la langue donnée.
     *
     * @param {string} langue - Code de langue.
     * @param {Date} [instant] - Maintenant par défaut.
     * @returns {{date: string, heure: string}} Par exemple "dimanche 27 septembre 2026" et "00:55:22 UTC+2".
     */
    maintenant(langue, instant = new Date()) {
        return {
            date: instant.toLocaleDateString(langue, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
            heure: instant.toLocaleTimeString(langue, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' })
        };
    },

    /**
     * Réponse de l'outil calendrier : jours fériés d'une année, écart entre deux dates,
     * ou date décalée d'un nombre de jours (ouvrés ou non).
     *
     * @param {Object} demande - Arguments de l'appel : date, fin, feries, alsace_moselle...
     * @param {string} langue - Langue des dates écrites.
     * @returns {string} Ligne de résultat pour le modèle.
     */
    repondre(demande, langue) {
        const format = new Intl.DateTimeFormat(langue, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        /* Sans date : aujourd'hui, à minuit comme une date lue. Le modèle ne
           connaît pas la date : elle vient d'ici, et l'icône le montre. */
        const maintenant = new Date();
        const alsace = demande.alsace_moselle === true;
        if (demande.feries !== undefined) {
            const liste = this.feries(Number(demande.feries), alsace).map(([date, nom]) => format.format(date) + ' (' + nom + ')');
            return t('calendrier.liste-feries', { annee: demande.feries, liste: liste.join(', ') });
        }
        const debut = demande.date
            ? this.lire(demande.date)
            : new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
        if (demande.fin) {
            const fin = this.lire(demande.fin);
            /* En UTC : un changement d'heure ne décale pas le compte. */
            const ecart = (Date.UTC(fin.getFullYear(), fin.getMonth(), fin.getDate())
                - Date.UTC(debut.getFullYear(), debut.getMonth(), debut.getDate())) / 86400000;
            if (demande.ouvres) {
                /* Les deux bornes comprises : "du 1er au 31 mai" compte tout le mois. */
                const [premier, dernier] = ecart < 0 ? [fin, debut] : [debut, fin];
                if (Math.abs(ecart) > this.OUVRES_MAX * 1.5) {
                    throw new Error(t('calendrier.invalide'));
                }
                let ouvres = 0;
                for (const d = new Date(premier); d <= dernier; d.setDate(d.getDate() + 1)) {
                    ouvres += this.ouvre(d, alsace) ? 1 : 0;
                }
                return tn('calendrier.ecart-ouvres', ouvres, { debut: format.format(premier), fin: format.format(dernier), jours: ouvres });
            }
            return tn('calendrier.ecart', ecart, { debut: format.format(debut), fin: format.format(fin), jours: ecart });
        }
        /* Échéance un samedi, un dimanche ou un jour férié : jour ouvré suivant. */
        const reporter = (date) => {
            if (!demande.report || this.ouvre(date, alsace)) {
                return '';
            }
            const suivant = new Date(date);
            do {
                suivant.setDate(suivant.getDate() + 1);
            } while (!this.ouvre(suivant, alsace));
            return ' ' + t('calendrier.reporte', { report: format.format(suivant) });
        };
        if (Number.isInteger(demande.mois) && demande.mois !== 0) {
            if (Math.abs(demande.mois) > this.MOIS_MAX) {
                throw new Error(t('calendrier.invalide'));
            }
            /* 31 janvier + 1 mois = 28 février. */
            const cible = new Date(debut.getFullYear(), debut.getMonth() + demande.mois, 1);
            cible.setDate(Math.min(debut.getDate(), new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate()));
            return tn('calendrier.decale-mois', demande.mois, { debut: format.format(debut), mois: demande.mois, date: format.format(cible) })
                + reporter(cible);
        }
        /* En heures : depuis maintenant, ou depuis minuit de la date donnée. */
        if (Number.isFinite(demande.heures) && demande.heures !== 0) {
            const base = demande.date ? debut : maintenant;
            const clair = (d) => {
                const m = this.maintenant(langue, d);
                return m.date + ', ' + m.heure;
            };
            return tn('calendrier.decale-heures', demande.heures, {
                debut: clair(base), heures: demande.heures, fin: clair(new Date(base.getTime() + demande.heures * 3600000))
            });
        }
        if (Number.isInteger(demande.jours) && demande.jours !== 0 && demande.ouvres) {
            if (Math.abs(demande.jours) > this.OUVRES_MAX) {
                throw new Error(t('calendrier.invalide'));
            }
            const pas = Math.sign(demande.jours);
            const d = new Date(debut);
            for (let reste = Math.abs(demande.jours); reste > 0;) {
                d.setDate(d.getDate() + pas);
                reste -= this.ouvre(d, alsace) ? 1 : 0;
            }
            return tn('calendrier.decale-ouvres', demande.jours, { debut: format.format(debut), jours: demande.jours, date: format.format(d) });
        }
        if (Number.isInteger(demande.jours) && demande.jours !== 0) {
            const decale = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + demande.jours);
            return tn('calendrier.decale', demande.jours, { debut: format.format(debut), jours: demande.jours, date: format.format(decale) })
                + reporter(decale);
        }
        if (!demande.date) {
            return t('calendrier.maintenant', this.maintenant(langue, maintenant));
        }
        return format.format(debut);
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. Les morceaux de
   tools/calcul/ y sont chargés ici ; leurs objets deviennent globaux, comme
   dans la page, pour que outils.js les trouve. */
if (typeof module !== 'undefined') {
    const Controle = require('./controle.js');
    const Compteur = require('./compteur.js');
    const Tirage = require('./tirage.js');
    const { Facteurs, Statistiques } = require('./nombres.js');
    Object.assign(globalThis, { Calcul, Formel, Calendrier, Compteur, Controle, Tirage, Statistiques, Facteurs });
    const { OUTILS_LOCAUX, definirOutil } = require('./outils.js');
    module.exports = { Calcul, Formel, Calendrier, Compteur, Controle, Tirage, Statistiques, Facteurs, OUTILS_LOCAUX, definirOutil };
}
