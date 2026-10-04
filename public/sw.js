/*
 * sw.js
 * Service worker : garde les fichiers de l'application dans le cache du
 * navigateur, pour que l'appli installée s'ouvre sans attendre le réseau
 * et reste utilisable hors connexion.
 *
 * Seuls les fichiers de l'application sont gardés : page, scripts, styles,
 * images, consignes. Aucune donnée de l'utilisateur, aucune requête vers
 * Albert ne passe par ce cache.
 *
 * Enregistré par app.js, sauf en local.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

const CACHE = 'albert-go';

/** Temps laissé au réseau pour rendre la page avant de servir celle du cache. */
const DELAI_PAGE_MS = 3000;

/**
 * Choisit comment servir une requête.
 *
 * @param {{method: string, url: string, cache: string, mode: string}} requete - Requête reçue.
 * @param {string} origine - Origine de l'application.
 * @returns {?string} "page", "version", "texte" ou "fichier" ; null pour laisser passer.
 */
function strategie(requete, origine) {
    const url = new URL(requete.url);
    /* Albert, le relais et les moteurs ne sont jamais gardés. no-store : la vérification de version (app.js). */
    if (requete.method !== 'GET' || url.origin !== origine || requete.cache === 'no-store') {
        return null;
    }
    if (requete.mode === 'navigate') {
        return 'page';
    }
    /* ?v=<commit> : à cette adresse, le fichier ne change plus. */
    if (url.searchParams.has('v')) {
        return 'version';
    }
    /* Consignes et exemples : petits, lus à l'usage, à jour dès que le réseau répond. */
    return url.pathname.endsWith('.txt') ? 'texte' : 'fichier';
}

/**
 * Garde une réponse réussie, et retire les autres versions du même fichier.
 *
 * @param {Cache} cache - Cache de l'application.
 * @param {Request|string} cle - Adresse sous laquelle garder la réponse.
 * @param {Response} reponse - Réponse du réseau.
 * @returns {Promise<void>}
 */
async function garder(cache, cle, reponse) {
    if (!reponse.ok || reponse.type !== 'basic') {
        return;
    }
    await cache.put(cle, reponse.clone());
    const adresse = new URL(typeof cle === 'string' ? cle : cle.url);
    for (const ancienne of await cache.keys()) {
        const autre = new URL(ancienne.url);
        if (autre.pathname === adresse.pathname && autre.search !== adresse.search) {
            await cache.delete(ancienne);
        }
    }
}

/**
 * Page : le réseau d'abord, pour partir sur la dernière version ; le cache s'il tarde ou manque.
 */
async function servirPage(evenement) {
    const cache = await caches.open(CACHE);
    /* Une seule page : même clé quelle que soit l'adresse demandée. */
    const cle = self.registration.scope;
    const reseau = fetch(evenement.request).then(async (reponse) => {
        await garder(cache, cle, reponse);
        return reponse;
    });
    const gardee = await cache.match(cle);
    if (!gardee) {
        return reseau;
    }
    evenement.waitUntil(reseau.catch(() => {}));
    const delai = new Promise(resolve => setTimeout(() => resolve(gardee), DELAI_PAGE_MS));
    return Promise.race([reseau.catch(() => gardee), delai]);
}

/**
 * Fichier daté par son commit : le cache d'abord, il ne changera pas.
 */
async function servirVersion(evenement) {
    const cache = await caches.open(CACHE);
    const gardee = await cache.match(evenement.request);
    if (gardee) {
        return gardee;
    }
    const reponse = await fetch(evenement.request);
    evenement.waitUntil(garder(cache, evenement.request, reponse));
    return reponse;
}

/**
 * Consigne ou exemple : le réseau d'abord, le cache hors connexion.
 */
async function servirTexte(evenement) {
    const cache = await caches.open(CACHE);
    try {
        const reponse = await fetch(evenement.request);
        evenement.waitUntil(garder(cache, evenement.request, reponse));
        return reponse;
    } catch (err) {
        const gardee = await cache.match(evenement.request);
        if (gardee) {
            return gardee;
        }
        throw err;
    }
}

/**
 * Image ou bibliothèque : le cache tout de suite, rafraîchi en arrière-plan pour la fois suivante.
 */
async function servirFichier(evenement) {
    const cache = await caches.open(CACHE);
    const gardee = await cache.match(evenement.request);
    const reseau = fetch(evenement.request).then(async (reponse) => {
        await garder(cache, evenement.request, reponse);
        return reponse;
    });
    if (!gardee) {
        return reseau;
    }
    evenement.waitUntil(reseau.catch(() => {}));
    return gardee;
}

const SERVIR = { page: servirPage, version: servirVersion, texte: servirTexte, fichier: servirFichier };

/* Sauté sous Node, où le fichier n'est chargé que pour ses tests. */
if (typeof ServiceWorkerGlobalScope !== 'undefined') {
    /* Une nouvelle version du service worker prend la main sans attendre la fermeture des onglets. */
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', evenement => evenement.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', (evenement) => {
        const choix = strategie(evenement.request, self.location.origin);
        if (choix) {
            evenement.respondWith(SERVIR[choix](evenement));
        }
    });
}

if (typeof module !== 'undefined') {
    module.exports = { strategie };
}
