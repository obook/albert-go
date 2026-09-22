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
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
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
