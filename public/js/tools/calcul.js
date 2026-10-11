/*
 * tools/calcul.js
 * Outils locaux du modèle : calcul (math.js, avec facteurs premiers, PGCD, PPCM, statistiques, moyenne
 * pondérée et dérivée), calendrier (jours ouvrés, fériés et échéances), compteur (mots, lettres, lisibilité), tirage.
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

const Controle = {
    /**
     * Clé de Luhn, celle du SIREN et du SIRET.
     *
     * @param {string} chiffres - Chiffres seuls.
     * @returns {boolean} true si la clé est bonne.
     */
    luhn(chiffres) {
        let somme = 0;
        [...chiffres].reverse().forEach((c, rang) => {
            const v = Number(c) * (rang % 2 ? 2 : 1);
            somme += v > 9 ? v - 9 : v;
        });
        return somme % 10 === 0;
    },

    /**
     * Vérifie la clé d'un SIREN (9 chiffres), d'un SIRET (14) ou d'un IBAN.
     *
     * Une bonne clé dit que le numéro est bien recopié, pas qu'il existe.
     *
     * @param {string} numero - Numéro, espaces, points et tirets admis.
     * @returns {{type: string, valide: boolean}} Type reconnu et clé bonne ou non.
     */
    verifier(numero) {
        const brut = String(numero).replace(/[\s.-]/g, '').toUpperCase();
        if (/^\d{9}$/.test(brut)) {
            return { type: 'SIREN', valide: this.luhn(brut) };
        }
        if (/^\d{14}$/.test(brut)) {
            /* Les établissements de La Poste ont leur règle : somme des chiffres multiple de 5. */
            const poste = brut.startsWith('356000000') && [...brut].reduce((s, c) => s + Number(c), 0) % 5 === 0;
            return { type: 'SIRET', valide: poste || this.luhn(brut) };
        }
        if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(brut)) {
            /* Norme ISO 13616 : les quatre premiers caractères à la fin, A = 10... Z = 35, reste 1 modulo 97. */
            const chiffres = (brut.slice(4) + brut.slice(0, 4)).replace(/[A-Z]/g, l => l.charCodeAt(0) - 55);
            return { type: 'IBAN', valide: BigInt(chiffres) % 97n === 1n };
        }
        throw new Error(t('controle.invalide'));
    }
};

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

/**
 * Définition d'un outil pour le champ "tools" de l'API.
 *
 * @param {string} nom - Nom de l'outil, préfixe de ses textes dans langues/*.js.
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
const formaterNombre = (v, langue) => v.toLocaleString(langue, { maximumSignificantDigits: Calcul.CHIFFRES, useGrouping: false });

/* Le nom sert de réglage, de clé de stockage et de préfixe i18n. */
const OUTILS_LOCAUX = {
    /* Une expression math.js ; ou des entiers à décomposer avec leur PGCD et
       leur PPCM, que math.js ne décompose pas ; ou une série statistique,
       aux conventions du lycée que math.js ne suit pas (écart-type sur n,
       quartiles pris dans la série). */
    calcul: {
        icone: 'calculatrice',
        outil: () => definirOutil('calcul', {
            expression: { type: 'string' },
            nombres: { type: 'array', items: { type: 'integer' } },
            valeurs: { type: 'array', items: { type: 'number' } },
            coefficients: { type: 'array', items: { type: 'number' } },
            derivee: { type: 'string' }
        }, []),
        executer: async (a, langue) => {
            if (Array.isArray(a.nombres) && a.nombres.length) {
                return Facteurs.decrire(a.nombres.map(Number));
            }
            if (Array.isArray(a.valeurs) && a.valeurs.length && Array.isArray(a.coefficients) && a.coefficients.length) {
                const { moyenne, total } = Statistiques.ponderer(a.valeurs, a.coefficients);
                return t('calcul.ponderee', { moyenne: formaterNombre(moyenne, langue), total: formaterNombre(total, langue) });
            }
            if (a.derivee) {
                await Calcul.charger();
                return 'd/dx (' + a.derivee + ') = ' + Calcul.deriver(a.derivee);
            }
            if (Array.isArray(a.valeurs) && a.valeurs.length) {
                const f = {};
                for (const [cle, v] of Object.entries(Statistiques.calculer(a.valeurs))) {
                    f[cle] = formaterNombre(v, langue);
                }
                return t('calcul.statistiques', f);
            }
            await Calcul.charger();
            const resultat = Calcul.evaluer(a.expression);
            return a.expression + ' = ' + (typeof resultat === 'number'
                ? resultat.toLocaleString(langue, { maximumSignificantDigits: Calcul.CHIFFRES, useGrouping: false })
                : resultat);
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
            /* Sans nombre, le premier tiré est nommé : le modèle oublie souvent
               nombre pour "un nom parmi", et répondait par toute la liste. */
            return a.nombre > 0
                ? t('tirage.tires', { liste: ordre.slice(0, a.nombre).join(', ') })
                : t('tirage.ordre', { liste: ordre.join(', '), premier: ordre[0] });
        }
    },
    calendrier: {
        icone: 'calendrier',
        outil: () => definirOutil('calendrier', {
            date: { type: 'string' }, jours: { type: 'integer' }, mois: { type: 'integer' }, report: { type: 'boolean' },
            heures: { type: 'number' }, fin: { type: 'string' },
            ouvres: { type: 'boolean' }, feries: { type: 'integer' }, alsace_moselle: { type: 'boolean' }
        }, []),
        executer: (a, langue) => Calendrier.repondre(a, langue)
    },
    compteur: {
        icone: 'compteur',
        outil: () => definirOutil('compteur', {
            texte: { type: 'string' }, lettre: { type: 'string' }, epeler: { type: 'boolean' },
            anagramme: { type: 'string' }, lisibilite: { type: 'boolean' }
        }, ['texte']),
        executer: (a, langue) => {
            const compte = Compteur.compter(a.texte);
            const lignes = [t('compteur.resultat', {
                ...compte,
                motMots: tn('compteur.mots', compte.mots),
                motCaracteres: tn('compteur.caracteres', compte.caracteres)
            })];
            if (a.lettre) {
                lignes.push(t('compteur.occurrences', { lettre: String(a.lettre).trim(), nombre: Compteur.occurrences(a.texte, a.lettre) }));
            }
            if (a.epeler) {
                lignes.push(t('compteur.epele', Compteur.epeler(a.texte)));
            }
            if (a.anagramme) {
                const [un, deux] = [Compteur.trier(a.texte), Compteur.trier(a.anagramme)];
                lignes.push(t(un === deux ? 'compteur.anagramme-oui' : 'compteur.anagramme-non', { un: un, deux: deux }));
            }
            if (a.lisibilite) {
                const mesures = Compteur.lisibilite(a.texte);
                lignes.push(t('compteur.mesures', {
                    ...mesures,
                    moyenne: mesures.moyenne.toLocaleString(langue, { maximumFractionDigits: 1 }),
                    seuilPhrase: Compteur.PHRASE_LONGUE,
                    seuilMot: Compteur.MOT_LONG
                }));
            }
            return lignes.join(' ');
        }
    }
    /* Contrôle SIRET et IBAN, retiré le 2026-10-11.
    , controle: {
        icone: 'controle',
        outil: () => definirOutil('controle', { numero: { type: 'string' } }, ['numero']),
        executer: (a) => {
            const { type, valide } = Controle.verifier(a.numero);
            return t(valide ? 'controle.valide' : 'controle.faux', { type: type, numero: String(a.numero).trim() });
        }
    }
    */
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = { Calcul, Calendrier, Compteur, Controle, Tirage, Statistiques, Facteurs, OUTILS_LOCAUX, definirOutil };
}
