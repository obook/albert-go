/*
 * reglages.js
 * Boîte de réglages : modèle, température, contexte, voix, mode partagé,
 * bouton "Réglages conseillés". Et le choix de la langue, ici aussi bien
 * que dans l'en-tête : c'est le même réglage.
 *
 * Chaque changement est enregistré tout de suite (ecrire, stockage.js)
 * et répercuté par afficherReglages (affichage.js).
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
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
    return 'images/moteurs/' + id + '.png';
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
 * Charge la liste réelle des modèles au démarrage. Serveur, relais ou Albert
 * injoignable : la liste de secours reste. En ligne, une clé refusée
 * (révoquée, expirée) est effacée et l'écran de la clé revient.
 *
 * @returns {Promise<void>}
 */
async function chargerModeles() {
    if (!Albert.pret()) {
        return;
    }
    try {
        const liste = await Albert.modeles();
        if (!liste.length) {
            return;
        }
        modelesDispo = liste;
        afficherModeles();
        afficherReglages();
    } catch (err) {
        if (err.status === 401 || err.status === 403) {
            if (Albert.cle) {
                Albert.cle = null;
                ecrire('cle', null);
                afficher();
                placerVolet();
            }
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

$('top-k').addEventListener('input', () => {
    reglages.topK = parseInt($('top-k').value, 10);
    ecrire('top-k', String(reglages.topK));
    afficherReglages();
});

$('echanges').addEventListener('input', () => {
    reglages.echanges = parseInt($('echanges').value, 10);
    ecrire('echanges', String(reglages.echanges));
    afficherReglages();
});

/* Faire défiler la carte, le pouce sur un curseur, changeait le réglage. */
for (const curseur of document.querySelectorAll('#reglages [type="range"]')) {
    annulerAuDefilement(curseur);
}

$('voix-en-ligne').addEventListener('change', () => {
    reglages.voixEnLigne = $('voix-en-ligne').checked;
    Lecture.enLigne = reglages.voixEnLigne;
    ecrire('voix-en-ligne', reglages.voixEnLigne ? 'oui' : 'non');
});

$('idees').addEventListener('change', () => {
    reglages.idees = $('idees').checked;
    ecrire('idees', reglages.idees ? 'oui' : 'non');
    afficherReglages();
});

for (const [nom, competence] of Object.entries(COMPETENCES)) {
    $(competence.cle).addEventListener('change', () => {
        reglages[nom] = $(competence.cle).checked;
        ecrire(competence.cle, reglages[nom] ? 'oui' : 'non');
    });
}

/* Compétences conseillées : toutes activées. */
$('competences-conseillees').addEventListener('click', () => {
    for (const [nom, competence] of Object.entries(COMPETENCES)) {
        reglages[nom] = true;
        ecrire(competence.cle, 'oui');
    }
    afficherReglages();
});

/* Un interrupteur par outil local, avec son icône. */
for (const [nom, local] of Object.entries(OUTILS_LOCAUX)) {
    const label = document.createElement('label');
    label.className = 'interrupteur';
    const caseOutil = document.createElement('input');
    caseOutil.type = 'checkbox';
    caseOutil.setAttribute('role', 'switch');
    caseOutil.setAttribute('aria-describedby', 'aide-outils');
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
$('cle-recherche').value = reglages.cleRecherche || '';

/** Cases des outils locaux et d'Internet, d'après reglages. */
function afficherOutils() {
    const cases = $('outils-locaux').querySelectorAll('input');
    Object.keys(OUTILS_LOCAUX).forEach((nom, i) => {
        cases[i].checked = reglages[nom];
    });
    $('recherche-reglage').checked = reglages.recherche;
}
afficherOutils();

/** Moteur coché qui demande une clé, s'il y en a un. */
function moteurAvecCle() {
    return reglages.fournisseurs.find(id => !Recherche.sansCle(id));
}

/** Met à jour le résumé et grise les moteurs qu'on ne peut plus cocher. */
function etatMoteurs() {
    const choisis = reglages.fournisseurs;
    const plein = choisis.length >= Recherche.MOTEURS_MAX;
    for (const caseMoteur of $('moteurs').querySelectorAll('input')) {
        /* ponytail: un seul champ de clé, donc un seul moteur à clé. */
        const cleEnTrop = !Recherche.sansCle(caseMoteur.value) && Boolean(moteurAvecCle());
        caseMoteur.disabled = !caseMoteur.checked && (plein || cleEnTrop);
    }
    $('moteur-choisi').replaceChildren(...(choisis.length
        ? choisis.flatMap(id => [logo(logoMoteur(id)), Recherche.MOTEURS[id].nom])
        : [t('reglages.moteur-aucun')]));
}

/** Affiche une carte à cocher par moteur, dans l'ordre de Recherche.MOTEURS. */
function afficherMoteurs() {
    const cartes = Object.keys(Recherche.MOTEURS).map(id => {
        const label = document.createElement('label');
        const caseMoteur = document.createElement('input');
        caseMoteur.type = 'checkbox';
        caseMoteur.value = id;
        caseMoteur.checked = reglages.fournisseurs.includes(id);
        label.append(caseMoteur, logo(logoMoteur(id)),
            elementTexte('strong', 'nom', Recherche.MOTEURS[id].nom),
            elementTexte('span', 'description', t('moteur.' + id)));
        return label;
    });
    $('moteurs').replaceChildren(...cartes);
    etatMoteurs();
    $('services-etat').textContent = Object.values(Services.TABLE).map(s => s.nom).join(', ');
}

/* Un moteur retiré du code laisserait un réglage enregistré sans carte. */
reglages.fournisseurs = reglages.fournisseurs.filter((id, rang, liste) => Recherche.MOTEURS[id] && liste.indexOf(id) === rang)
    .slice(0, Recherche.MOTEURS_MAX);
afficherMoteurs();

/* Seuls Google et Mojeek demandent une clé et un identifiant de moteur. */
function afficherCles() {
    $('cles-recherche').hidden = !moteurAvecCle();
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

/** Globe activé : les questions ont Internet jusqu'à ce qu'on le désactive, même après un rechargement
    (sur iPad, le navigateur recharge souvent un onglet resté en arrière-plan). */
let globeActif = lire('globe', 'non') === 'oui';

/* Réglages autorise la recherche, le globe l'active.
   Sans autorisation, ni globe ni suggestion "Faire une recherche" ; choix du
   moteur et clés fermés et grisés. Le globe n'existe que dans un module à fil. */
function afficherRecherche() {
    if (!reglages.recherche) {
        globeActif = false;
    }
    ecrire('globe', globeActif ? 'oui' : 'non');
    /* Premier appel avant modules.js, qui déclare outilActuel : la barre suit au démarrage. */
    const discussion = typeof outilActuel === 'undefined' || !!Albert.OUTILS[outilActuel].fil;
    $('recherche-web').hidden = !reglages.recherche || !discussion;
    $('recherche-web').setAttribute('aria-pressed', String(globeActif));
    for (const suggestion of document.querySelectorAll('.suggestion[data-recherche]')) {
        suggestion.hidden = !reglages.recherche;
    }
    $('choix-moteur').inert = !reglages.recherche;
    $('services-etat').inert = !reglages.recherche;
    $('cles-recherche').inert = !reglages.recherche;
    if (!reglages.recherche) {
        $('choix-moteur').open = false;
    }
}
afficherRecherche();

$('recherche-reglage').addEventListener('change', () => {
    reglages.recherche = $('recherche-reglage').checked;
    ecrire('recherche', reglages.recherche ? 'oui' : 'non');
    /* Recherche tout juste autorisée : on veut s'en servir, le globe est activé au retour. */
    globeActif = reglages.recherche;
    afficherRecherche();
});

/* Le globe active ou désactive Internet (recherche et images). */
$('recherche-web').addEventListener('click', () => {
    globeActif = !globeActif;
    afficherRecherche();
    toast(t(globeActif ? 'toast.recherche-activee' : 'toast.recherche-desactivee'));
});

/**
 * Enregistre les moteurs cochés. La clé est effacée si le moteur à clé change.
 *
 * @param {string[]} choisis - Clés de Recherche.MOTEURS.
 */
function choisirMoteurs(choisis) {
    const avant = moteurAvecCle();
    reglages.fournisseurs = choisis;
    ecrire('fournisseurs', choisis.join(','));
    if (moteurAvecCle() !== avant) {
        reglages.cleRecherche = null;
        $('cle-recherche').value = '';
        ecrire('cle-recherche', null);
    }
    afficherCles();
}

/* La liste reste ouverte : on y coche plusieurs moteurs. */
$('moteurs').addEventListener('change', () => {
    choisirMoteurs([...$('moteurs').querySelectorAll('input:checked')].map(c => c.value));
    etatMoteurs();
});

$('cle-recherche').addEventListener('change', () => {
    reglages.cleRecherche = $('cle-recherche').value.trim() || null;
    ecrire('cle-recherche', reglages.cleRecherche);
});

/* Outils conseillés : outils locaux et Internet activés, aucun moteur, voix de l'appareil seules. */
$('outils-conseilles').addEventListener('click', () => {
    for (const nom of Object.keys(OUTILS_LOCAUX)) {
        reglages[nom] = true;
        ecrire(nom, 'oui');
    }
    reglages.recherche = true;
    ecrire('recherche', 'oui');
    reglages.voixEnLigne = false;
    Lecture.enLigne = false;
    ecrire('voix-en-ligne', 'non');
    $('voix-en-ligne').checked = false;
    afficherOutils();
    choisirMoteurs([]);
    afficherMoteurs();
    afficherRecherche();
});

$('partage-reglage').addEventListener('change', () => {
    if (!changerPartage(!$('partage-reglage').checked)) {
        $('partage-reglage').checked = !partage;
        toast(t('toast.partage-impossible'));
    }
    afficherReglages();
});

/* Nom affiché dans les titres et l'onglet. Espaces insécables : pas de retour à la ligne. */
function afficherNom() {
    const nom = lire('nom', null) || 'Albert Go';
    document.title = nom;
    for (const titre of document.querySelectorAll('.marque')) {
        const outil = titre.querySelector('.outil-actif');
        titre.replaceChildren(nom.replace(/ /g, '\u00a0'));
        if (outil) {
            titre.append(outil);
        }
    }
}
$('nom-application').value = lire('nom', '');
afficherNom();

$('nom-application').addEventListener('input', () => {
    ecrire('nom', $('nom-application').value.trim() || null);
    afficherNom();
});

/* Application conseillée : nom par défaut, idées masquées, clé conservée. */
$('application-conseillee').addEventListener('click', () => {
    $('nom-application').value = '';
    ecrire('nom', null);
    afficherNom();
    reglages.idees = false;
    ecrire('idees', 'non');
    /* Retiré le 21/11/2026 : les voix en ligne sont dans la carte Outils.
    reglages.voixEnLigne = false;
    Lecture.enLigne = false;
    ecrire('voix-en-ligne', 'non');
    */
    /* Poste invité du kiosque : le mode partagé est imposé, son interrupteur est masqué. */
    if (!(Kiosque && Kiosque.role === 'eleve') && !changerPartage(false)) {
        toast(t('toast.partage-impossible'));
    }
    afficherReglages();
});

$('reglages-conseilles').addEventListener('click', () => {
    reglages.modele = Albert.CONSEILLES.modele;
    reglages.temperature = Albert.CONSEILLES.temperature;
    reglages.topK = Albert.CONSEILLES.topK;
    reglages.echanges = Albert.CONSEILLES.echanges;
    ecrire('modele', reglages.modele);
    ecrire('temperature', String(reglages.temperature));
    ecrire('top-k', String(reglages.topK));
    ecrire('echanges', String(reglages.echanges));
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
$('alerte-reglages').addEventListener('click', ouvrirReglages);

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
