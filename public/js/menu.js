/*
 * menu.js
 * Menu latéral : historique, thème, partage, à propos.
 *
 * Même organisation que le menu d'albert-droid. Les entrées "Nouvelle
 * conversation", "Historique" et "Réglages" sont gérées par app.js,
 * historique.js et reglages.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
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
    /* Barres du système (application installée) : la couleur de fond du thème affiché. */
    const fond = getComputedStyle(document.documentElement).getPropertyValue('--fond').trim();
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
        meta.content = fond;
    }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', afficherTheme);

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
    afficherHistorique();
    montrerSansFocus($('menu'));
    $('ouvrir-menu').setAttribute('aria-expanded', 'true');
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
 * Fait une action sur la colonne sans la faire glisser : seul le bouton anime.
 *
 * @param {Function} action - Ouverture ou fermeture du volet.
 */
function sansGlissement(action) {
    document.body.classList.add('sans-glisse');
    action();
    /* Lire une taille calcule les styles tant que les transitions sont coupées. */
    void document.body.offsetWidth;
    document.body.classList.remove('sans-glisse');
}

/**
 * Ouvre le volet en colonne sur grand écran, le referme sinon.
 * Sans clé, l'accueil s'affiche volet fermé.
 * Sans glissement : chargement, changement de format.
 */
function placerVolet() {
    sansGlissement(() => {
        if ($('menu').open) {
            $('menu').close();
        }
        if (GRAND_ECRAN.matches && Albert.pret() && lire('volet', null) !== 'replie') {
            montrerVolet();
        }
        rangerBouton();
    });
}
GRAND_ECRAN.addEventListener('change', placerVolet);
placerVolet();

$('menu').addEventListener('click', (e) => {
    const bouton = e.target.closest('button');
    /* Colonne du grand écran : elle ne se replie que par son bouton (demande du 21/11/2026). */
    if (GRAND_ECRAN.matches) {
        /* Retiré le 21/11/2026 : choisir un module, une nouvelle discussion, une ligne d'historique (discussions et
           Imprimerie, Nouveau document compris), Réglages (et le résumé qui les ouvre), Partager ou À propos
           repliait la colonne.
        const boites = ['ouvrir-reglages', 'resume-reglages', 'ouvrir-partage', 'ouvrir-empreinte', 'ouvrir-info'];
        if (bouton && boites.includes(bouton.id)) {
            sansGlissement(() => $('ouvrir-menu').click());
        } else if (bouton && (bouton.dataset.outil || bouton.id === 'nouvelle' || bouton.classList.contains('titre-conversation'))) {
            $('ouvrir-menu').click();
        }
        */
        return;
    }
    const clicSurLeFond = e.target === $('menu');
    const garde = bouton && GARDENT_LE_VOLET.some(nom => bouton.id === nom || bouton.classList.contains(nom));
    if (clicSurLeFond || (bouton && !garde)) {
        $('menu').close();
    }
}, true);

/* Grand écran : un clic au centre replie la bibliothèque, comme son bouton. Une sélection de texte ne compte pas. */
$('principal').addEventListener('click', () => {
    if (!GRAND_ECRAN.matches || getSelection().toString()) {
        return;
    }
    /* Retiré le 21/11/2026 : le menu reste ouvert, il ne se replie que par son bouton.
    if ($('menu').open) {
        $('ouvrir-menu').click();
    }
    */
    if ($('bibliotheque').open) {
        $('ouvrir-bibliotheque').click();
    }
});

/**
 * Ouvre la boîte "Partager" avec l'adresse de la page et son QR code.
 *
 * Le QR code est calculé dans le navigateur (vendor/qrcode-generator).
 */
function ouvrirPartage() {
    /* Serveur : son adresse réseau (cartes physiques d'abord) et, en kiosque, le lien élève.
       En ligne, et pour l'application ou la clé USB hors kiosque (le serveur refuse alors
       les autres postes), l'adresse publique. */
    const base = Serveur.adresses[0] || location.origin;
    const portable = Serveur.portable && !Kiosque;
    let adresse = base + '/';
    if (Albert.EN_LIGNE || portable) {
        adresse = Albert.URL_PUBLIQUE;
    } else if (Kiosque && Kiosque.token) {
        adresse = base + '/kiosque?token=' + encodeURIComponent(Kiosque.token);
    }
    let texte = t('partage.texte');
    if (Albert.EN_LIGNE) {
        texte = t('partage.texte-en-ligne');
    } else if (Kiosque && Kiosque.code) {
        texte = t('kiosque.partage', { code: Kiosque.code });
    } else if (portable) {
        /* Le lien ne mène pas à cette application : le dire. */
        texte = t('partage.en-ligne');
    }
    $('texte-partage').textContent = texte;
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
    /* En ligne, charge du relais n8n : affichée tant que les stats ne sont pas arrivées et gardée si elles échouent. */
    $('appels').textContent = t('info.appels-hs');
    $('appels').hidden = !Albert.EN_LIGNE;
    (Albert.EN_LIGNE ? Albert.appels() : Promise.reject()).then(({ total, parHeure }) => {
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

$('ouvrir-empreinte').addEventListener('click', () => {
    const { kwh, kgco2, appels, renseignes, lus, ecrits, depuis } = Albert.empreinte;
    $('empreinte-depuis').textContent = tn('empreinte.depuis', appels, { heure: I18n.heure(depuis), n: appels });
    $('empreinte-chiffres').hidden = !appels;
    /* Les jetons viennent à chaque appel, l'empreinte pas toujours. */
    for (const ligne of document.querySelectorAll('#empreinte-chiffres .carbone')) {
        ligne.hidden = !renseignes;
    }
    $('empreinte-jetons').textContent = tn('empreinte.lus', lus, { n: Albert.jetons(lus, I18n.langue) })
        + ' · ' + tn('empreinte.ecrits', ecrits, { n: Albert.jetons(ecrits, I18n.langue) });
    $('empreinte-energie').textContent = t('empreinte.energie', { valeur: Albert.petiteUnite(kwh * 1000, 'Wh', I18n.langue) });
    $('empreinte-gaz').textContent = t('empreinte.gaz', { valeur: Albert.petiteUnite(kgco2 * 1000, 'g CO2eq', I18n.langue) });
    $('empreinte-telephone').textContent = Albert.recharge(kwh);
    const note = !renseignes ? t('empreinte.vide')
        : renseignes < appels ? t('empreinte.partielle', { n: renseignes, total: appels }) : '';
    $('empreinte-note').textContent = note;
    $('empreinte-note').hidden = !note;
    $('empreinte-source').hidden = !renseignes;
    $('empreinte').showModal();
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
    Albert.cle = null;
    ecrire('cle', null);
    /* Le bouton est dans les réglages : on les quitte avec la clé. */
    if ($('reglages').open) {
        $('reglages').close();
    }
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
