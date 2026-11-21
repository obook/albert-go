/*
 * tools/calcul/formel-worker.js
 * Giac, le moteur de calcul formel de Xcas, hors du fil de la page : une
 * commande reçue, un résultat rendu. Lancé par Formel (calcul.js).
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

/* La version dans l'adresse : le cache du navigateur garde les 19 Mo tant qu'elle ne change pas. */
const GIAC = '../../../vendor/giac/giacwasm.js?v=1.9.0';

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
