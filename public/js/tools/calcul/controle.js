/*
 * tools/calcul/controle.js
 * Contrôle des numéros SIREN, SIRET (clé de Luhn) et IBAN.
 *
 * L'outil controle est retiré depuis le 11/10/2026 (commentaire dans
 * outils.js) ; l'objet reste, couvert par ses tests, pour le remettre.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

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

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Controle;
}
