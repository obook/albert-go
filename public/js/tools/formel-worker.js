/*
 * tools/formel-worker.js
 * Giac, le moteur de calcul formel de Xcas, hors du fil de la page : une
 * commande reçue, un résultat rendu. Lancé par Formel (calcul.js).
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/* La version dans l'adresse : le service worker garde les 19 Mo une fois pour toutes. */
const GIAC = '../../vendor/giac/giacwasm.js?v=1.9.0';

/* La commande vient du modèle et Giac sait lire une adresse (read) : plus de
   réseau ici. Son WebAssembly est dans le fichier, il n'en a pas besoin. */
self.XMLHttpRequest = self.fetch = self.WebSocket = undefined;

self.Module = {
    print: () => {},
    printErr: () => {},
    onAbort: () => postMessage({ erreur: true }),
    onRuntimeInitialized() {
        const caseval = self.Module.cwrap('caseval', 'string', ['string']);
        self.onmessage = (e) => {
            try {
                /* Sans restart, une variable définie par un calcul resterait pour le suivant. */
                caseval('restart');
                postMessage({ resultat: caseval(e.data) });
            } catch (err) {
                postMessage({ erreur: true });
            }
        };
        postMessage({ pret: true });
    }
};

importScripts(GIAC);
