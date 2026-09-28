/*
 * reglages.js
 * Boîte de réglages : modèle, température, contexte, voix, mode partagé,
 * bouton "Réglages conseillés". Et le choix de la langue, ici aussi bien
 * que dans l'en-tête : c'est le même réglage.
 *
 * Chaque changement est enregistré tout de suite (ecrire, stockage.js)
 * et répercuté par afficherReglages (affichage.js).
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/**
 * Crée un élément avec une classe et un texte.
 *
 * @param {string} balise - Nom de la balise.
 * @param {string} classe - Classe CSS.
 * @param {string} texte - Contenu texte.
 * @returns {HTMLElement} L'élément créé.
 */
function elementTexte(balise, classe, texte) {
    const element = document.createElement(balise);
    element.className = classe;
    element.textContent = texte;
    return element;
}

/**
 * Logo d'un moteur, repris de son site.
 *
 * @param {string} id - Clé de Recherche.MOTEURS.
 * @returns {string} Chemin de l'image.
 */
function logoMoteur(id) {
    return 'images/moteurs/' + id + (id === 'data-gouv' ? '.svg' : '.png');
}

/**
 * Affiche une carte par modèle dans la liste des réglages.
 */
function afficherModeles() {
    const cartes = modelesDispo.map(m => {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'modele';
        radio.value = m.id;
        /* Un modèle hors de la liste connue n'a pas de description à lui. */
        const description = I18n.existe('modele.' + m.id) ? t('modele.' + m.id) : t('modele.inconnu');
        label.append(radio, logo(Albert.logoEditeur(m.reel)),
            elementTexte('strong', 'nom', m.nom),
            elementTexte('span', 'type', t('modele.type.' + m.type)),
            elementTexte('span', 'description', description),
            elementTexte('span', 'detail', t('reglages.alias', { id: m.id })),
            elementTexte('span', 'detail', t('reglages.modele-reel', { reel: m.reel })));
        return label;
    });
    $('modeles').replaceChildren(...cartes);
}

/**
 * Charge la liste réelle des modèles au démarrage.
 *
 * Clé refusée (révoquée, expirée) : elle est effacée et l'écran de la clé
 * revient. Relais injoignable : la liste de secours reste.
 *
 * @returns {Promise<void>}
 */
async function chargerModeles() {
    if (!reglages.cle) {
        return;
    }
    try {
        const liste = await Albert.modeles(reglages.cle);
        if (!liste.length) {
            return;
        }
        modelesDispo = liste;
        afficherModeles();
        afficherReglages();
    } catch (err) {
        if (err.status === 401 || err.status === 403) {
            reglages.cle = null;
            ecrire('cle', null);
            afficher();
            placerVolet();
            toast(err.message);
        }
    }
}

afficherModeles();

$('modeles').addEventListener('change', (e) => {
    reglages.modele = e.target.value;
    ecrire('modele', reglages.modele);
    afficherReglages();
});

/* Un clic referme la liste ; les flèches du clavier (detail 0) la laissent ouverte. */
$('modeles').addEventListener('click', (e) => {
    if (!e.detail || !e.target.closest('label')) {
        return;
    }
    $('choix-modele').open = false;
    $('modele-choisi').focus();
});

$('temperature').addEventListener('input', () => {
    reglages.temperature = parseFloat($('temperature').value);
    ecrire('temperature', String(reglages.temperature));
    afficherReglages();
});

$('memoire-reglage').addEventListener('change', () => {
    reglages.memoire = $('memoire-reglage').checked;
    ecrire('memoire', reglages.memoire ? 'oui' : 'non');
    afficherReglages();
});

$('voix-en-ligne').addEventListener('change', () => {
    reglages.voixEnLigne = $('voix-en-ligne').checked;
    Lecture.enLigne = reglages.voixEnLigne;
    ecrire('voix-en-ligne', reglages.voixEnLigne ? 'oui' : 'non');
});

/* Un interrupteur par outil local, avec son icône. */
for (const [nom, local] of Object.entries(OUTILS_LOCAUX)) {
    const label = document.createElement('label');
    label.className = 'interrupteur';
    const caseOutil = document.createElement('input');
    caseOutil.type = 'checkbox';
    caseOutil.setAttribute('role', 'switch');
    caseOutil.setAttribute('aria-describedby', 'aide-outils');
    caseOutil.checked = reglages[nom];
    caseOutil.addEventListener('change', () => {
        reglages[nom] = caseOutil.checked;
        ecrire(nom, reglages[nom] ? 'oui' : 'non');
    });
    const dessin = document.createElement('span');
    dessin.className = 'icone-outil';
    dessin.innerHTML = ICONES[local.icone];
    const texte = document.createElement('span');
    texte.dataset.t = 'reglages.' + nom;
    texte.textContent = t('reglages.' + nom);
    label.append(caseOutil, dessin, texte);
    $('outils-locaux').append(label);
}

/* Même globe que sous une réponse qui a cherché sur le web. */
$('recherche-reglage').insertAdjacentHTML('afterend', '<span class="icone-outil">' + ICONES.globe + '</span>');
$('recherche-web').innerHTML = ICONES.globe;
$('images-reglage').insertAdjacentHTML('afterend', '<span class="icone-outil">' + ICONES.image + '</span>');
$('images-reglage').checked = reglages.images;
$('images-reglage').addEventListener('change', () => {
    reglages.images = $('images-reglage').checked;
    ecrire('images', reglages.images ? 'oui' : 'non');
});
$('recherche-reglage').checked = reglages.recherche;
$('cle-recherche').value = reglages.cleRecherche || '';

/**
 * Affiche une carte par moteur : son nom, puis son domaine de recherche.
 *
 * L'ordre est celui de Recherche.MOTEURS.
 */
function afficherMoteurs() {
    const cartes = Object.keys(Recherche.MOTEURS).map(id => {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'moteur';
        radio.value = id;
        radio.checked = id === reglages.fournisseur;
        label.append(radio, logo(logoMoteur(id)),
            elementTexte('strong', 'nom', Recherche.MOTEURS[id].nom),
            elementTexte('span', 'description', t('moteur.' + id)));
        return label;
    });
    $('moteurs').replaceChildren(...cartes);
    $('moteur-choisi').replaceChildren(logo(logoMoteur(reglages.fournisseur)), Recherche.MOTEURS[reglages.fournisseur].nom);
}

/* Un moteur retiré du code laisserait un réglage enregistré sans carte. */
if (!Recherche.MOTEURS[reglages.fournisseur]) {
    reglages.fournisseur = 'wikipedia';
    ecrire('fournisseur', reglages.fournisseur);
}
afficherMoteurs();

/* Seuls Google et Mojeek demandent une clé et un identifiant de moteur. */
function afficherCles() {
    $('cles-recherche').hidden = Recherche.sansCle(reglages.fournisseur);
}
afficherCles();
/* Le moteur choisi par l'utilisateur remplace celui du code. */
$('cx-recherche').value = reglages.cx;
Recherche.CX = reglages.cx;

$('cx-recherche').addEventListener('change', () => {
    reglages.cx = $('cx-recherche').value.trim() || Recherche.CX;
    Recherche.CX = reglages.cx;
    $('cx-recherche').value = reglages.cx;
    ecrire('cx', reglages.cx);
});

/** Recherche demandée au globe pour la prochaine question seulement (app.js la remet à false). */
let rechercheUneFois = false;

/* Réglages autorise la recherche ; le globe s'en sert, question par question.
   Sans autorisation, ni globe ni suggestion "Faire une recherche" ; choix du
   moteur et clés fermés et grisés. Le globe n'existe que dans Discussion. */
function afficherRecherche() {
    if (!reglages.recherche) {
        rechercheUneFois = false;
    }
    /* Premier appel avant modules.js, qui déclare outilActuel : la barre suit au démarrage. */
    const discussion = typeof outilActuel === 'undefined' || outilActuel === 'discuter';
    $('recherche-web').hidden = !reglages.recherche || !discussion;
    $('recherche-web').setAttribute('aria-pressed', String(rechercheUneFois));
    for (const suggestion of document.querySelectorAll('.suggestion[data-recherche]')) {
        suggestion.hidden = !reglages.recherche;
    }
    $('choix-moteur').inert = !reglages.recherche;
    $('cles-recherche').inert = !reglages.recherche;
    if (!reglages.recherche) {
        $('choix-moteur').open = false;
    }
}
afficherRecherche();

$('recherche-reglage').addEventListener('change', () => {
    reglages.recherche = $('recherche-reglage').checked;
    ecrire('recherche', reglages.recherche ? 'oui' : 'non');
    /* Recherche tout juste activée : on veut s'en servir, le globe est allumé au retour. */
    rechercheUneFois = reglages.recherche;
    afficherRecherche();
});

/* Le globe demande une recherche pour la prochaine question, et dit quel moteur servira. */
$('recherche-web').addEventListener('click', () => {
    rechercheUneFois = !rechercheUneFois;
    afficherRecherche();
    const nom = Recherche.MOTEURS[reglages.fournisseur].nom;
    toast(t(rechercheUneFois ? 'toast.recherche-activee' : 'toast.recherche-desactivee', { nom: nom }));
});

/* Chaque moteur a sa clé : on efface celle de l'autre en changeant. */
$('moteurs').addEventListener('change', (e) => {
    reglages.fournisseur = e.target.value;
    reglages.cleRecherche = null;
    $('cle-recherche').value = '';
    ecrire('fournisseur', reglages.fournisseur);
    ecrire('cle-recherche', null);
    afficherMoteurs();
    afficherCles();
});

/* Un clic referme la liste ; les flèches du clavier (detail 0) la laissent ouverte. */
$('moteurs').addEventListener('click', (e) => {
    if (!e.detail || !e.target.closest('label')) {
        return;
    }
    $('choix-moteur').open = false;
    $('moteur-choisi').focus();
});

$('cle-recherche').addEventListener('change', () => {
    reglages.cleRecherche = $('cle-recherche').value.trim() || null;
    ecrire('cle-recherche', reglages.cleRecherche);
});

$('partage-reglage').addEventListener('change', () => {
    if (!changerPartage(!$('partage-reglage').checked)) {
        $('partage-reglage').checked = !partage;
        toast(t('toast.partage-impossible'));
    }
    afficherReglages();
});

$('reglages-conseilles').addEventListener('click', () => {
    reglages.modele = Albert.CONSEILLES.modele;
    reglages.temperature = Albert.CONSEILLES.temperature;
    reglages.memoire = Albert.CONSEILLES.memoire;
    ecrire('modele', reglages.modele);
    ecrire('temperature', String(reglages.temperature));
    ecrire('memoire', reglages.memoire ? 'oui' : 'non');
    afficherReglages();
});

/**
 * Montre la langue affichée : son drapeau dans le volet, sa ligne en gras
 * dans le menu déroulant.
 *
 * Le drapeau du menu est recopié plutôt que réécrit : un seul exemplaire
 * de chaque dessin, dans index.html.
 */
function afficherLangue() {
    for (const bouton of document.querySelectorAll('[data-langue]')) {
        const choisie = bouton.dataset.langue === I18n.langue;
        bouton.setAttribute('aria-current', choisie ? 'true' : 'false');
        if (choisie) {
            $('langue-choisie').replaceChildren(bouton.querySelector('.drapeau').cloneNode(true));
        }
    }
}

/**
 * Change la langue de l'interface : la page entière est relue, listes comprises.
 *
 * Les consignes système et Wikipédia suivent au prochain envoi.
 *
 * @param {string} langue - Code de la langue choisie.
 */
function choisirLangue(langue) {
    if (langue === I18n.langue) {
        return;
    }
    const quittee = I18n.langue;
    reglages.langue = langue;
    ecrire('langue', langue);
    I18n.definir(langue);
    ajusterLangueCible(quittee);
    I18n.appliquer();
    afficherLangue();
    afficherModeles();
    afficherMoteurs();
    afficherReglages();
    afficherLangues();
    afficherOutil();
    afficherTheme();
    afficherHistorique();
}

afficherLangue();

for (const bouton of document.querySelectorAll('[data-langue]')) {
    bouton.addEventListener('click', () => {
        $('choix-langue').open = false;
        choisirLangue(bouton.dataset.langue);
    });
}

/* Un clic ailleurs referme le menu déroulant. */
document.addEventListener('click', (e) => {
    if ($('choix-langue').open && !e.target.closest('#choix-langue')) {
        $('choix-langue').open = false;
    }
});

const cartesReglages = [...document.querySelectorAll('#reglages .carte')];

/** Ouvre les réglages, toutes cartes fermées. */
function ouvrirReglages() {
    for (const carte of cartesReglages) {
        carte.open = false;
    }
    $('reglages').showModal();
}

$('ouvrir-reglages').addEventListener('click', ouvrirReglages);
$('resume-reglages').addEventListener('click', ouvrirReglages);

for (const carte of cartesReglages) {
    carte.addEventListener('toggle', () => {
        if (carte.open) {
            return;
        }
        /* Sinon la liste déroulante rouvre dépliée avec la carte. */
        for (const liste of carte.querySelectorAll('details[open]')) {
            liste.open = false;
        }
    });
}
