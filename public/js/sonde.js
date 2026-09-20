/*
 * sonde.js
 * Relevé temporaire de la hauteur du viewport, pour un bug non reproduit.
 *
 * L'application installée s'est ouverte une fois avec une page plus haute
 * que l'écran, le bas de la saisie coupé. Non reproduit depuis. La sonde
 * garde les 20 derniers chargements dans localStorage, sous
 * "albert-go.sonde", à lire après coup.
 *
 * À SUPPRIMER une fois la cause établie : ce fichier, sa balise script dans
 * index.html, et la clé localStorage.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/** Clé du relevé. Hors de stockage.js : il doit survivre au mode partagé. */
const SONDE_CLE = 'albert-go.sonde';

/** Chargements gardés. */
const SONDE_MAX = 20;

/** Relevé du chargement courant, complété au fil des mesures. */
const releveCourant = {
    date: new Date().toISOString(),
    mode: matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'navigateur',
    ecran: screen.height,
    dpr: devicePixelRatio,
    mesures: []
};

/**
 * Ajoute une mesure de hauteur au relevé courant.
 *
 * @param {string} quand - Étiquette du moment ("chargement", "1s", "resize"...).
 */
function mesurerSonde(quand) {
    const html = document.documentElement;
    releveCourant.mesures.push({
        quand: quand,
        innerH: innerHeight,
        visuelH: Math.round(visualViewport.height),
        clientH: html.clientHeight,
        scrollH: html.scrollHeight
    });
    enregistrerSonde();
}

/**
 * Écrit le relevé courant dans localStorage, en tête de la liste.
 *
 * Le stockage plein ne doit pas casser la page : l'échec est ignoré.
 */
function enregistrerSonde() {
    try {
        const liste = JSON.parse(localStorage.getItem(SONDE_CLE) || '[]');
        if (liste[0] && liste[0].date === releveCourant.date) {
            liste[0] = releveCourant;
        } else {
            liste.unshift(releveCourant);
        }
        localStorage.setItem(SONDE_CLE, JSON.stringify(liste.slice(0, SONDE_MAX)));
    } catch (err) {
        /* Rien : la sonde ne doit jamais gêner l'application. */
    }
}

mesurerSonde('chargement');
/* Les barres système d'Android peuvent arriver après le premier rendu. */
setTimeout(() => mesurerSonde('1s'), 1000);
setTimeout(() => mesurerSonde('3s'), 3000);
addEventListener('resize', () => mesurerSonde('resize'));
