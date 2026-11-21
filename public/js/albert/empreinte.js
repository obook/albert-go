/*
 * albert/empreinte.js
 * Consommation des appels à Albert : part du contexte occupée, jetons lus et écrits,
 * énergie et carbone cumulés depuis l'ouverture de l'onglet.
 *
 * repondre (albert.js) note chaque appel ; menu.js affiche le cumul dans la boîte
 * Empreinte et app.js la part du contexte sous la saisie.
 * Complète l'objet Albert d'albert.js, chargé avant lui.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Albert, {
    /**
     * Part du contexte occupée par le dernier échange.
     *
     * @param {?Object} usage - Champ usage de la dernière réponse.
     * @param {?number} contexte - Taille du contexte du modèle, en jetons.
     * @returns {?number} Pourcentage entre 0 et 100, ou null si inconnu.
     */
    occupation(usage, contexte) {
        if (!usage || !contexte) {
            return null;
        }
        const jetons = usage.total_tokens || ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0));
        return Math.min(100, Math.round(jetons / contexte * 100));
    },

    /* Retiré le 21/11/2026 : le cumul repartait de zéro à chaque rechargement, même automatique.
    empreinte: { kwh: 0, kgco2: 0, appels: 0, renseignes: 0, lus: 0, ecrits: 0, depuis: new Date() },
    */

    /* Cumul gardé dans l'onglet (sessionStorage) : il survit aux rechargements, nouvelle version
       ou onglet rechargé par l'iPad, et repart de zéro à la fermeture de l'onglet. */
    CLE_EMPREINTE: 'albert-go.empreinte',

    /**
     * Empreinte gardée dans l'onglet, ou un cumul neuf.
     *
     * @returns {Object} Cumul : kwh, kgco2, appels, renseignes, lus, ecrits, depuis (Date).
     */
    empreinteGardee() {
        const neuve = { kwh: 0, kgco2: 0, appels: 0, renseignes: 0, lus: 0, ecrits: 0, depuis: new Date() };
        try {
            const gardee = JSON.parse(globalThis.sessionStorage.getItem(this.CLE_EMPREINTE));
            if (gardee) {
                return { ...neuve, ...gardee, depuis: new Date(gardee.depuis) };
            }
        } catch (err) {
            /* Stockage bloqué, ou absent sous Node : cumul neuf. */
        }
        return neuve;
    },

    /* Énergie d'une batterie de smartphone, en Wh : 4 000 mAh à 3,85 V. */
    TELEPHONE_WH: 15,

    /**
     * Ajoute l'empreinte d'un appel au cumul (valeur haute si Albert donne une fourchette).
     *
     * @param {?Object} usage - Champ usage de la réponse.
     */
    noterEmpreinte(usage) {
        /* Albert renvoie usage.impacts (nombres seuls) ; l'ancien usage.carbon donnait {min, max}. */
        const carbone = usage && (usage.impacts || usage.carbon);
        const haut = (x) => (x && typeof x === 'object' ? x.max : x);
        const kwh = carbone && haut(carbone.kWh);
        const kgco2 = carbone && haut(carbone.kgCO2eq);
        this.empreinte.appels++;
        this.empreinte.lus += (usage && usage.prompt_tokens) || 0;
        this.empreinte.ecrits += (usage && usage.completion_tokens) || 0;
        /* Certains appels n'en portent pas : ils comptent, sans chiffre. */
        if (typeof kwh === 'number' && typeof kgco2 === 'number') {
            this.empreinte.kwh += kwh;
            this.empreinte.kgco2 += kgco2;
            this.empreinte.renseignes++;
        }
        try {
            globalThis.sessionStorage.setItem(this.CLE_EMPREINTE, JSON.stringify(this.empreinte));
        } catch (err) {
            /* Stockage bloqué, ou absent sous Node : le cumul reste en mémoire. */
        }
    },

    /**
     * Grandeur lisible : l'unité, son millième sous 1, son millier au-dessus de 999.
     *
     * @param {number} valeur - Valeur dans l'unité (Wh, g CO2eq).
     * @param {string} unite - Unité, préfixée de "m" ou de "k".
     * @param {string} langue - Langue des nombres.
     * @returns {string} Par exemple "0,99 mWh" ou "1,2 kWh".
     */
    petiteUnite(valeur, unite, langue) {
        /* Arrondi avant le choix : 999,6 Wh s'écrirait sinon "1 000 Wh". */
        const arrondi = Number(valeur.toPrecision(2));
        let nombre = valeur;
        let prefixe = '';
        if (arrondi < 1) {
            nombre = valeur * 1000;
            prefixe = 'm';
        } else if (arrondi >= 1000) {
            nombre = valeur / 1000;
            prefixe = 'k';
        }
        /* Insécables : le nombre et son unité ne se séparent pas en fin de ligne. */
        return (nombre.toLocaleString(langue, { maximumSignificantDigits: 2 }) + ' ' + prefixe + unite).replace(/ /g, '\u00a0');
    },

    /**
     * Nombre de jetons, en milliers (k) au-dessus de 999.
     *
     * @param {number} n - Nombre de jetons.
     * @param {string} langue - Langue des nombres.
     * @returns {string} Par exemple "12,4 k".
     */
    jetons(n, langue) {
        return n > 999 ? (n / 1000).toLocaleString(langue, { maximumFractionDigits: 1 }) + '\u00a0k' : n.toLocaleString(langue);
    },

    /**
     * La même énergie en recharges de téléphone, en pourcentage sous une recharge.
     *
     * @param {number} kwh - Énergie, en kWh.
     * @returns {string} Par exemple "Soit 2,8 % d'une recharge de téléphone".
     */
    recharge(kwh) {
        const part = kwh * 1000 / this.TELEPHONE_WH;
        if (part < 1) {
            return t('empreinte.telephone-part', { part: part.toLocaleString(I18n.langue, { style: 'percent', maximumSignificantDigits: 2 }) });
        }
        return tn('empreinte.telephone', part, { n: part.toLocaleString(I18n.langue, { maximumFractionDigits: 1 }) });
    }
});

/* Empreinte rendue par Albert, cumulée dans l'onglet. */
Albert.empreinte = Albert.empreinteGardee();
