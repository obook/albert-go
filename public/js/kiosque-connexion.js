/*
 * kiosque-connexion.js
 * Page /kiosque : langue de l'interface, formulaire du prof ou de l'élève
 * (?token=... dans le lien partagé), message d'erreur renvoyé par le serveur,
 * ou message seul pour l'invité qui vient de quitter la session (?quittee).
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Licence : GPL-3.0-or-later
 */
'use strict';

/** Codes d'erreur du serveur (serveur/serveur.py, _kiosque_post). */
const ERREURS_KIOSQUE = ['cle-requise', 'cle-refusee', 'aucune-session', 'code', 'action', 'terminee'];

(() => {
    let langue = null;
    try {
        langue = localStorage.getItem('albert-go.langue');
    } catch (err) {
        /* Stockage bloqué : langue du navigateur. */
    }
    I18n.definir(langue || I18n.defaut());
    I18n.appliquer();
    const params = new URLSearchParams(location.search);
    if (params.has('quittee')) {
        document.getElementById('kiosque-prof').hidden = true;
        document.getElementById('kiosque-quittee').hidden = false;
        return;
    }
    const token = params.get('token');
    const erreur = params.get('erreur');
    if (token) {
        document.getElementById('kiosque-prof').hidden = true;
        document.getElementById('kiosque-eleve').hidden = false;
        document.getElementById('token').value = token;
    }
    if (ERREURS_KIOSQUE.includes(erreur)) {
        document.getElementById(token ? 'erreur-eleve' : 'erreur-prof').textContent = t('kiosque.erreur.' + erreur);
    }
    document.getElementById(token ? 'code' : 'cle-api').focus();
})();
