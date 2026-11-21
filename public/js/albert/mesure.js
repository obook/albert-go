/*
 * albert/mesure.js
 * Ce qu'une réponse a coûté : jetons envoyés par origine (sources, compétences,
 * discussion, consigne), jetons reçus, part de la capacité du modèle, durées.
 *
 * Sert à comprendre une réponse lente. Les jetons de chaque origine sont estimés
 * sur la longueur du texte (CARACTERES_PAR_JETON), puis ramenés au total
 * qu'Albert renvoie dans usage quand il le donne. conversation/chronometre.js
 * affiche le résultat ; app.js le garde avec la réponse.
 * Complète l'objet Albert d'albert.js, chargé avant lui.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Albert, {
    /** Origines du texte envoyé, dans l'ordre d'affichage quand deux parts sont égales. */
    ORIGINES_ENVOI: ['sources', 'competences', 'discussion', 'consigne'],

    /**
     * Pourcentage entier d'une valeur dans un total.
     *
     * @param {number} valeur - Partie.
     * @param {number} total - Tout ; 0 donne 0 %.
     * @returns {number} Pourcentage arrondi.
     */
    pourcent(valeur, total) {
        return total > 0 ? Math.round(valeur / total * 100) : 0;
    },

    /**
     * Jetons envoyés, répartis par origine.
     *
     * @param {Object<string, number>} caracteres - Caractères par origine (clés de ORIGINES_ENVOI).
     * @param {?number} lus - Jetons lus selon Albert (usage.prompt_tokens), ou null.
     * @returns {{total: number, estime: boolean, parts: {origine: string, jetons: number, pourcent: number}[]}}
     *     Total (exact si Albert l'a donné), et parts non nulles de la plus grande à la plus petite.
     */
    partsEnvoi(caracteres, lus) {
        const tailles = this.ORIGINES_ENVOI.map((origine) => caracteres[origine] || 0);
        const somme = tailles.reduce((a, b) => a + b, 0);
        const estime = typeof lus !== 'number';
        const total = estime ? Math.round(somme / this.CARACTERES_PAR_JETON) : lus;
        const parts = this.ORIGINES_ENVOI.map((origine, i) => ({
            origine: origine,
            /* Règle de trois sur les caractères : le total réel garde ses proportions. */
            jetons: somme > 0 ? Math.round(tailles[i] / somme * total) : 0,
            pourcent: this.pourcent(tailles[i], somme)
        })).filter((part) => part.jetons > 0);
        parts.sort((a, b) => b.jetons - a.jetons);
        return { total: total, estime: estime, parts: parts };
    },

    /**
     * Mesure d'une réponse, à garder avec elle.
     *
     * Plusieurs appels (outils) : la répartition est celle du dernier, qui a écrit la
     * réponse ; les jetons reçus et la durée d'Albert s'additionnent.
     *
     * @param {Object} donnees - Ce que app.js a relevé.
     * @param {Object<string, number>} donnees.caracteres - Caractères envoyés par origine.
     * @param {{usage: ?Object, duree: number}[]} donnees.appels - Un élément par appel à Albert.
     * @param {number} donnees.rechercheMs - Recherche dans les sources avant l'envoi, 0 sans elle.
     * @param {number} donnees.totalMs - Durée totale, de l'envoi à la réponse.
     * @param {?number} donnees.contexte - Capacité du modèle en jetons, ou null.
     * @returns {Object} Mesure : envoi, recus, capacite, appels, durees.
     */
    mesurer({ caracteres, appels, rechercheMs, totalMs, contexte }) {
        const dernier = appels.at(-1) || {};
        const lus = dernier.usage && typeof dernier.usage.prompt_tokens === 'number' ? dernier.usage.prompt_tokens : null;
        const envoi = this.partsEnvoi(caracteres, lus);
        let recus = 0;
        let albertMs = 0;
        for (const appel of appels) {
            recus += (appel.usage && appel.usage.completion_tokens) || 0;
            albertMs += appel.duree || 0;
        }
        /* Le reste du temps : outils exécutés entre deux appels. Un seul appel : rien que la mise en forme. */
        const outilsMs = appels.length > 1 ? Math.max(0, totalMs - rechercheMs - albertMs) : 0;
        const durees = [
            { nom: 'recherche', ms: rechercheMs },
            { nom: 'albert', ms: albertMs },
            { nom: 'outils', ms: outilsMs }
        ].filter((duree) => duree.ms > 0).map((duree) => ({ ...duree, pourcent: this.pourcent(duree.ms, totalMs) }));
        return {
            envoi: envoi,
            recus: appels.some((appel) => appel.usage) ? recus : null,
            capacite: contexte ? this.pourcent(envoi.total, contexte) : null,
            appels: appels.length,
            totalMs: totalMs,
            durees: durees
        };
    }
});
