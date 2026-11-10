/*
 * theme.js
 * Applique le thème mémorisé avant le premier affichage.
 *
 * Chargé dans <head>, sans attendre la page : évite un flash de l'autre
 * thème. La CSP interdit le script écrit dans la page, d'où ce fichier.
 * Le bouton de thème est géré par menu.js.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
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
} catch (err) {
    /* Stockage bloqué : on suit le thème du système. */
}

/* Un script perdu au lancement coupe une fonction sans rien dire (images.js sur le Pixel, 11/11/2026) :
   on recharge, au plus une fois par minute. Hors ligne, recharger n'afficherait plus rien. */
const CLE_RECHARGE = 'albert-go.recharge';
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
