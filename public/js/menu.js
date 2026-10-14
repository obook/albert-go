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
    light: { cle: 'light', icone: 'lune', suivant: 'dark' },
    dark: { cle: 'dark', icone: 'soleil', suivant: 'system' },
    system: { cle: 'system', icone: 'systeme', suivant: 'light' }
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
    const libelle = document.createElement('span');
    libelle.textContent = t('theme.' + actuel.cle);
    $('theme').innerHTML = ICONES[actuel.icone];
    $('theme').append(libelle);
    $('theme').setAttribute('aria-label', t('theme.' + actuel.cle + '.aria'));
}

$('ouvrir-menu').addEventListener('click', () => {
    /* Grand écran : le bouton replie ou déplie la colonne, et s'en souvient. */
    if (GRAND_ECRAN.matches) {
        /* Bouton masqué pendant le glissement (0.2s, entete.css), puis fondu. */
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
            $('ouvrir-menu').animate({ opacity: [0, 0, 1] }, 400);
        }
        if ($('menu').open) {
            $('menu').close();
            ecrire('volet', 'replie');
        } else {
            montrerVolet();
            ecrire('volet', null);
        }
        rangerBouton();
        return;
    }
    $('recherche-historique').value = '';
    afficherHistorique();
    $('menu').showModal();
    $('ouvrir-menu').setAttribute('aria-expanded', 'true');
});

$('menu').addEventListener('close', () => {
    $('ouvrir-menu').setAttribute('aria-expanded', 'false');
});

/*
Phase de capture : le menu se ferme avant l'action.
Sinon, en se fermant, il reprendrait le focus à la boîte qui s'ouvre.
Le thème et la suppression d'une conversation le laissent ouvert, pour
enchaîner les clics ; leur boîte s'ouvre par-dessus le volet.
*/
const GARDENT_LE_VOLET = ['theme', 'supprimer-conversation'];

/* Grand écran : le volet reste ouvert à gauche, sans fond (entete.css). */
const GRAND_ECRAN = matchMedia('(min-width: 64rem)');

/**
 * Affiche le volet en colonne, sans lui donner le focus.
 */
function montrerVolet() {
    const avant = document.activeElement;
    afficherHistorique();
    $('menu').show();
    $('ouvrir-menu').setAttribute('aria-expanded', 'true');
    /* show() prend le focus : on le rend. */
    if (avant && avant !== document.body) {
        avant.focus();
    } else {
        document.activeElement.blur();
    }
}

/**
 * Range le bouton du volet : à gauche du titre du volet ouvert en colonne,
 * dans l'en-tête sinon (entete.css). Le déplacer lui fait perdre le focus.
 */
function rangerBouton() {
    const bouton = $('ouvrir-menu');
    const avaitLeFocus = document.activeElement === bouton;
    if (GRAND_ECRAN.matches && $('menu').open) {
        document.querySelector('.volet-contenu').prepend(bouton);
    } else {
        document.querySelector('.entete').prepend(bouton);
    }
    if (avaitLeFocus) {
        bouton.focus();
    }
}

/**
 * Ouvre le volet en colonne sur grand écran, le referme sinon.
 * Sans clé, l'accueil s'affiche volet fermé.
 */
function placerVolet() {
    /* Pas de glissement ici (chargement, changement de format) : seul le bouton anime. */
    document.body.classList.add('sans-glisse');
    if ($('menu').open) {
        $('menu').close();
    }
    if (GRAND_ECRAN.matches && reglages.cle && lire('volet', null) !== 'replie') {
        montrerVolet();
    }
    rangerBouton();
    /* Lire une taille calcule les styles tant que les transitions sont coupées. */
    void document.body.offsetWidth;
    document.body.classList.remove('sans-glisse');
}
GRAND_ECRAN.addEventListener('change', placerVolet);
placerVolet();

$('menu').addEventListener('click', (e) => {
    const bouton = e.target.closest('button');
    if (GRAND_ECRAN.matches) {
        /* Colonne : choisir un module, une nouvelle discussion, une ligne d'historique (discussions et
           Imprimerie, Nouveau document compris), Partager ou À propos la replie, comme son bouton.
           Imprimerie la garde ouverte pour sa liste. */
        const replie = ['nouvelle', 'ouvrir-partage', 'ouvrir-info'];
        if (bouton && (bouton.dataset.outil || replie.includes(bouton.id) || bouton.classList.contains('titre-conversation'))) {
            $('ouvrir-menu').click();
        }
        return;
    }
    const clicSurLeFond = e.target === $('menu');
    const garde = bouton && GARDENT_LE_VOLET.some(nom => bouton.id === nom || bouton.classList.contains(nom));
    if (clicSurLeFond || (bouton && !garde)) {
        $('menu').close();
    }
}, true);

/* Grand écran : un clic au centre replie les deux colonnes, comme leurs boutons. Une sélection de texte ne compte pas. */
$('principal').addEventListener('click', () => {
    if (!GRAND_ECRAN.matches || getSelection().toString()) {
        return;
    }
    if ($('menu').open) {
        $('ouvrir-menu').click();
    }
    if ($('bibliotheque').open) {
        $('ouvrir-bibliotheque').click();
    }
});

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
        toast(t('toast.adresse-copiee'));
    }).catch(() => toast(t('toast.copie-refusee')));
});

$('adresse-partage').addEventListener('focus', () => {
    $('adresse-partage').select();
});

/**
 * Texte de la version pour "À propos" : commit et date dans la langue affichée.
 *
 * @returns {string} Par exemple "96941b9 du 19/09/2026 13:20".
 */
function texteVersion() {
    if (!VERSION.date) {
        return VERSION.commit;
    }
    const date = I18n.dateHeure(new Date(VERSION.date));
    return t('version.format', { commit: VERSION.commit, date: date });
}

/**
 * "appel" ou "appels" selon la règle de la langue : 1,3 appel en français, 1.3 calls en anglais.
 *
 * @param {number} nombre - Nombre affiché.
 * @returns {string} Le mot accordé.
 */
function motAppel(nombre) {
    return t(new Intl.PluralRules(I18n.langue).select(nombre) === 'one' ? 'info.appel' : 'info.appels.pluriel');
}

$('ouvrir-info').addEventListener('click', () => {
    $('version').textContent = texteVersion();
    /* Affiché tant que les stats ne sont pas arrivées, et gardé si elles échouent. */
    $('appels').textContent = t('info.appels-hs');
    $('appels').hidden = false;
    Albert.appels().then(({ total, parHeure }) => {
        const h = Math.round(parHeure * 10) / 10;
        $('appels').textContent = t('info.appels', {
            n: total.toLocaleString(I18n.langue),
            h: h.toLocaleString(I18n.langue),
            motN: motAppel(total),
            motH: motAppel(h)
        });
    }).catch(() => {});
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
    placerVolet();
    toast(t('toast.cle-effacee'));
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
