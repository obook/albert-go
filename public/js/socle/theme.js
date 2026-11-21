/*
 * theme.js
 * Applique le thème mémorisé avant le premier affichage.
 *
 * Chargé dans <head>, sans attendre la page : évite un flash de l'autre
 * thème. La CSP interdit le script écrit dans la page, d'où ce fichier.
 * Le bouton de thème est géré par menu.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

try {
    const theme = localStorage.getItem('albert-go.theme');
    if (theme) {
        document.documentElement.dataset.theme = theme;
    }
    /* Citations des réponses : réglage lu ici pour que les réponses rendues au lancement le suivent. */
    document.documentElement.classList.toggle('citations-visibles', localStorage.getItem('albert-go.citations') === 'oui');
} catch (err) {
    /* Stockage bloqué : on suit le thème du système. */
}

/* Un script perdu au lancement coupe une fonction sans rien dire (images.js sur le Pixel, 11/11/2026) :
   on recharge, au plus une fois par minute. Hors ligne, recharger n'afficherait plus rien. */
const CLE_RECHARGE = 'albert-go.recharge';
/* Retiré le 21/11/2026 : les scripts de l'interface arrivent après la lecture de la page (chargement.js).
addEventListener('error', (e) => {
    const src = e.target instanceof HTMLScriptElement && e.target.getAttribute('src');
    if (!src || !/^(js|vendor)\//.test(src) || document.readyState !== 'loading' || !navigator.onLine) {
        return;
    }
    try {
        if (Date.now() - Number(sessionStorage.getItem(CLE_RECHARGE)) < 60000) {
            return;
        }
        sessionStorage.setItem(CLE_RECHARGE, String(Date.now()));
    } catch (err) {
        return;
    }
    location.reload();
}, true);
*/
addEventListener('error', (e) => {
    const src = e.target instanceof HTMLScriptElement && e.target.getAttribute('src');
    if (!src || !/^(js|vendor)\//.test(src)) {
        return;
    }
    /* Scripts chargés plus tard, à la demande (Mermaid, pdf.js) : pas de rechargement. */
    const auLancement = document.readyState === 'loading' || 'lancement' in e.target.dataset;
    if (auLancement) {
        rechargerUneFois();
    }
}, true);

/* Écart minimal entre deux rechargements automatiques : une page toujours cassée ne boucle pas. */
const RECHARGE_MIN_MS = 60000;

/**
 * Recharge la page, au plus une fois par minute et seulement en ligne. Appelée aussi par chargement.js.
 *
 * @returns {boolean} true si la page recharge, false sinon (hors ligne, ou déjà fait depuis moins d'une minute).
 */
function rechargerUneFois() {
    if (!navigator.onLine) {
        return false;
    }
    try {
        if (Date.now() - Number(sessionStorage.getItem(CLE_RECHARGE)) < RECHARGE_MIN_MS) {
            return false;
        }
        sessionStorage.setItem(CLE_RECHARGE, String(Date.now()));
    } catch (err) {
        return false;
    }
    location.reload();
    return true;
}
