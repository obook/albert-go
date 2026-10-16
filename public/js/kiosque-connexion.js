/*
 * kiosque-connexion.js
 * Page /kiosque : langue de l'interface, formulaire du prof ou de l'élève
 * (?token=... dans le lien partagé), message d'erreur renvoyé par le serveur,
 * ou message seul pour l'invité qui a quitté la session (?quittee) ou dont la
 * session est terminée (?terminee).
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
    const fin = ['quittee', 'terminee'].find(f => params.has(f));
    if (fin) {
        document.getElementById('kiosque-prof').hidden = true;
        document.getElementById('kiosque-fin').hidden = false;
        document.getElementById('titre-fin').textContent = t('kiosque.' + fin);
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
    /* Albert met quelques secondes à vérifier la clé : le bouton le montre. */
    const bouton = document.querySelector('#kiosque-prof button');
    document.querySelector('#kiosque-prof form').addEventListener('submit', () => {
        bouton.disabled = true;
        bouton.setAttribute('aria-busy', 'true');
        bouton.textContent = t('cle.verification');
        document.getElementById('erreur-prof').textContent = '';
    });
    /* Retour arrière : la page reviendrait du cache avec le bouton figé. */
    window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
})();
