/*
 * cle.js
 * Version en ligne, écran de la clé : vérification auprès d'Albert, enregistrement,
 * puis le chat. Sur un serveur d'Albert Go, l'écran ne s'affiche pas (Albert.pret).
 *
 * Une clé refusée n'est jamais enregistrée. La clé déjà enregistrée est
 * revérifiée au démarrage par chargerModeles (reglages.js).
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

/**
 * Vérifie la clé saisie auprès d'Albert. Acceptée, elle est enregistrée et
 * le chat s'ouvre ; refusée, la boîte se ferme et un toast dit pourquoi.
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
        /* Copie hors de l'adresse officielle : la boîte reste, avec le lien vers la bonne. */
        if (echec.lien) {
            messageCle(echec.texte, true, echec.lien);
        } else {
            messageCle('', false);
            $('dialogue-cle').close();
            toast(echec.texte);
        }
        return;
    } finally {
        bouton.disabled = false;
    }
    /* Cible pleine : le réglage n'a pas bougé, la case doit le dire. */
    if (!changerPartage(!$('partage-accueil').checked)) {
        $('partage-accueil').checked = !partage;
        toast(t('toast.partage-impossible'));
    }
    messageCle('', false);
    $('cle').value = '';
    Albert.cle = cle;
    ecrire('cle', cle);
    afficherReglages();
    /* Ferme aussi la boîte. */
    afficher();
    placerVolet();
    $('bienvenue-cle').showModal();
}

$('form-cle').addEventListener('submit', (e) => {
    e.preventDefault();
    validerCle();
});

/* La boîte de saisie s'ouvre depuis l'accueil et se ferme après la vérification. */
$('ouvrir-cle').addEventListener('click', () => {
    $('dialogue-cle').showModal();
    $('cle').focus();
});

$('annuler-cle').addEventListener('click', () => {
    $('dialogue-cle').close();
});
