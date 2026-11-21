/*
 * tools/calcul/calendrier.js
 * Outil calendrier : date du jour, jours fériés (Alsace-Moselle comprise),
 * jours ouvrés, écart entre deux dates et échéances. Le modèle ne connaît
 * pas la date du jour : elle vient d'ici.
 *
 * Appelé par outils.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

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

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Calendrier;
}
