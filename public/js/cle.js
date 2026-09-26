/*
 * cle.js
 * Écran de la clé : vérification auprès d'Albert, puis enregistrement.
 *
 * Une clé refusée n'est jamais enregistrée. La clé déjà enregistrée est
 * revérifiée au démarrage par chargerModeles (reglages.js).
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/** Clé acceptée par Albert, en attente du clic sur "Commencer". */
let cleAcceptee = null;

/**
 * Vérifie la clé saisie auprès d'Albert et, si elle est acceptée, active "Commencer".
 *
 * Une clé refusée n'est pas gardée : la boîte reste ouverte avec le message.
 *
 * @returns {Promise<void>}
 */
async function validerCle() {
    const cle = $('cle').value.trim();
    const bouton = $('form-cle').querySelector('button[type="submit"]');
    bouton.disabled = true;
    messageCle(t('cle.verification'), false);
    try {
        const liste = await Albert.modeles(cle);
        if (liste.length) {
            modelesDispo = liste;
            afficherModeles();
        }
    } catch (err) {
        const echec = messageEchec(err);
        messageCle(echec.texte, true, echec.lien);
        return;
    } finally {
        bouton.disabled = false;
    }
    messageCle('', false);
    cleAcceptee = cle;
    $('cle').value = '';
    $('dialogue-cle').close();
    /* À l'écran une coche seule ; le lecteur d'écran lit "Clé acceptée". */
    const coche = document.createElement('span');
    coche.setAttribute('aria-hidden', 'true');
    coche.textContent = '✓';
    const texte = document.createElement('span');
    texte.className = 'visuellement-cache';
    texte.textContent = t('cle.acceptee');
    $('etat-cle').replaceChildren(coche, texte);
    $('commencer').disabled = false;
}

/**
 * Enregistre la clé acceptée et ouvre le chat.
 */
function commencer() {
    if (!cleAcceptee) {
        return;
    }
    /* Cible pleine : le réglage n'a pas bougé, la case doit le dire. */
    if (!changerPartage(!$('partage-accueil').checked)) {
        $('partage-accueil').checked = !partage;
        toast(t('toast.partage-impossible'));
    }
    reglages.cle = cleAcceptee;
    cleAcceptee = null;
    /* L'accueil revient ainsi à zéro si on quitte plus tard. */
    $('commencer').disabled = true;
    $('etat-cle').textContent = '';
    ecrire('cle', reglages.cle);
    afficherReglages();
    afficher();
}

$('commencer').addEventListener('click', commencer);

$('form-cle').addEventListener('submit', (e) => {
    e.preventDefault();
    validerCle();
});

/* La boîte de saisie s'ouvre depuis l'accueil et se ferme une fois la clé acceptée. */
$('ouvrir-cle').addEventListener('click', () => {
    $('dialogue-cle').showModal();
    $('cle').focus();
});

$('annuler-cle').addEventListener('click', () => {
    $('dialogue-cle').close();
});
