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

/**
 * Vérifie la clé saisie auprès d'Albert, puis l'enregistre si elle est acceptée.
 *
 * Une clé refusée n'est pas enregistrée : l'écran de la clé reste affiché.
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
    /* Cible pleine : le réglage n'a pas bougé, la case doit le dire. */
    if (!changerPartage($('partage-accueil').checked)) {
        $('partage-accueil').checked = partage;
        $('texte-partage-accueil').textContent = textePartage(partage);
        toast(t('toast.partage-impossible'));
    }
    reglages.cle = cle;
    ecrire('cle', reglages.cle);
    $('cle').value = '';
    afficherReglages();
    afficher();
}

$('form-cle').addEventListener('submit', (e) => {
    e.preventDefault();
    validerCle();
});

/* Le choix ne s'applique qu'à l'enregistrement : seul le texte suit la case. */
$('partage-accueil').addEventListener('change', () => {
    $('texte-partage-accueil').textContent = textePartage($('partage-accueil').checked);
});
