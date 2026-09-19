/*
 * menu.js
 * Menu latéral : historique, thème, partage, à propos, changement de clé.
 *
 * Même organisation que le menu d'albert-droid. Les entrées "Nouvelle
 * conversation", "Historique" et "Réglages" sont gérées par app.js,
 * historique.js et reglages.js.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/* Clair, puis sombre, puis système (sans data-theme : la CSS suit le système). */
const THEMES = {
    light: { icone: 'lune', nom: 'clair', suivant: 'dark' },
    dark: { icone: 'soleil', nom: 'sombre', suivant: 'system' },
    system: { icone: 'systeme', nom: 'du système', suivant: 'light' }
};

/**
 * Thème actif, lu sur la balise <html>.
 *
 * @returns {Object} Entrée de THEMES.
 */
function themeActuel() {
    return THEMES[document.documentElement.dataset.theme || 'system'];
}

/**
 * Met à jour l'icône et le texte du bouton de thème.
 */
function afficherTheme() {
    const actuel = themeActuel();
    $('theme').innerHTML = ICONES[actuel.icone] + '<span>Thème ' + actuel.nom + '</span>';
    $('theme').setAttribute('aria-label', 'Thème ' + actuel.nom + '. Passer en thème ' + THEMES[actuel.suivant].nom);
}

$('ouvrir-menu').addEventListener('click', () => {
    afficherHistorique();
    $('menu').showModal();
});

/*
Phase de capture : le menu se ferme avant l'action.
Sinon, en se fermant, il reprendrait le focus à la boîte qui s'ouvre.
Le thème le laisse ouvert, pour enchaîner les clics.
*/
$('menu').addEventListener('click', (e) => {
    const bouton = e.target.closest('button');
    const clicSurLeFond = e.target === $('menu');
    if (clicSurLeFond || (bouton && bouton.id !== 'theme')) {
        $('menu').close();
    }
}, true);

/**
 * Ouvre la boîte "Partager" avec l'adresse publique et son QR code.
 *
 * Toujours l'adresse publique : partager localhost n'aurait pas de sens.
 * Le QR code est calculé dans le navigateur (vendor/qrcode-generator).
 */
function ouvrirPartage() {
    const adresse = Albert.URL_PUBLIQUE;
    /* 0 : taille choisie par la bibliothèque ; M : 15 % de correction d'erreur. */
    const code = qrcode(0, 'M');
    code.addData(adresse);
    code.make();
    /* 8 pixels par case, marge blanche de 4 cases exigée par la norme QR. */
    $('qr-partage').src = code.createDataURL(8, 32);
    $('adresse-partage').value = adresse;
    $('partage').showModal();
}

$('ouvrir-partage').addEventListener('click', ouvrirPartage);

$('copier-adresse').addEventListener('click', () => {
    navigator.clipboard.writeText($('adresse-partage').value).then(() => {
        toast('Adresse copiée.');
    });
});

$('adresse-partage').addEventListener('focus', () => {
    $('adresse-partage').select();
});

$('ouvrir-info').addEventListener('click', () => {
    $('info').showModal();
});

$('changer-cle').addEventListener('click', () => {
    /* Sinon Échap reprendrait la réponse précédente. */
    $('confirmer-cle').returnValue = '';
    $('confirmer-cle').showModal();
});

$('confirmer-cle').addEventListener('close', () => {
    if ($('confirmer-cle').returnValue !== 'oui') {
        return;
    }
    reglages.cle = null;
    ecrire('cle', null);
    afficher();
});

$('theme').addEventListener('click', () => {
    const suivant = themeActuel().suivant;
    if (suivant === 'system') {
        delete document.documentElement.dataset.theme;
        ecrire('theme', null);
    } else {
        document.documentElement.dataset.theme = suivant;
        ecrire('theme', suivant);
    }
    afficherTheme();
});
