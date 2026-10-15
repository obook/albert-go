/*
 * modules.js
 * Modules du menu : Discuter, Reformuler, Traduire (repris d'albert-droid), Corriger, Rédiger.
 *
 * Garde l'outil actif et les langues de Traduire. Les consignes système
 * sont dans public/prompts/<langue>/*.txt, lues au premier usage puis
 * gardées en mémoire. app.js s'en sert pour construire la requête.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

/** Outil actif : clé de Albert.OUTILS. */
let outilActuel = lire('outil', 'discuter');
/* Module inconnu ou retiré du menu (bouton en commentaire dans index.html) : retour à Discussion. L'historique le rouvre encore. */
if (!Albert.OUTILS[outilActuel] || !(Albert.OUTILS[outilActuel].documents || document.querySelector('[data-outil="' + outilActuel + '"]'))) {
    outilActuel = 'discuter';
}

/**
 * Code de langue enregistré, ou le code de secours.
 *
 * Une version précédente enregistrait le nom en français ("Anglais") :
 * il ne fait plus partie des codes, on repart du secours.
 *
 * @param {string} nom - Nom de la donnée enregistrée.
 * @param {string} secours - Code à utiliser si la valeur lue est inconnue.
 * @returns {string} Code de langue.
 */
function langueLue(nom, secours) {
    const code = lire(nom, secours);
    return [Albert.LANGUE_AUTO, ...Albert.LANGUES].includes(code) ? code : secours;
}

/** Langues de Traduire : vers l'anglais depuis une interface française, et l'inverse. */
let langueSource = langueLue('langue-source', Albert.LANGUE_AUTO);
let langueCible = langueLue('langue-cible', I18n.langue === 'fr' ? 'en' : 'fr');

/** Consignes déjà lues, par langue et par outil. */
const consignesLues = {};

/**
 * Fichier de consigne de la langue de l'interface, lu une fois.
 *
 * @param {string} fichier - Nom du fichier dans public/prompts/<langue>/.
 * @param {string} outil - Clé de Albert.OUTILS, pour le message d'erreur.
 * @returns {Promise<string>} Texte du fichier.
 * @throws {Error} Si le fichier ne peut pas être lu.
 */
async function lireConsigne(fichier, outil) {
    const chemin = 'prompts/' + I18n.langue + '/' + fichier;
    if (!consignesLues[chemin]) {
        const res = await fetch(chemin);
        if (!res.ok) {
            throw new Error(t('erreur.consigne', { outil: t('outil.' + outil) }));
        }
        consignesLues[chemin] = await res.text();
    }
    return consignesLues[chemin];
}

/**
 * Consigne système de l'outil, lue dans son fichier au premier appel.
 *
 * @param {string} outil - Clé de Albert.OUTILS.
 * @param {string} [champ] - "consigne", ou "revue" pour la relecture de Rédiger.
 * @returns {Promise<?string>} Texte de la consigne, ou null si l'outil n'en a pas.
 * @throws {Error} Si le fichier ne peut pas être lu.
 */
async function consigne(outil, champ = 'consigne') {
    const fichier = Albert.OUTILS[outil][champ];
    if (!fichier) {
        return null;
    }
    let texte = await lireConsigne(fichier, outil);
    /* Projet : son complément suit la consigne de Discussion. */
    const complement = champ === 'consigne' && Albert.OUTILS[outil].complement;
    if (complement) {
        texte += '\n\n' + await lireConsigne(complement, outil);
    }
    /* Le modèle ne connaît ni la date, ni l'heure, ni son propre nom. Dans
       un module à fil, le Calendrier donne la date et l'heure : leur icône
       sous la réponse prouve qu'elles viennent de l'appareil. Ailleurs, ou
       Calendrier désactivé, elles partent avec la consigne. */
    const contexte = [];
    if (!Albert.OUTILS[outil].fil || !reglages.calendrier) {
        contexte.push(t('consigne.date', Calendrier.maintenant(I18n.langue)));
    }
    const modele = modeleActuel();
    contexte.push(t('consigne.contexte', { nom: modele.nom, reel: modele.reel }));
    return texte + '\n\n' + contexte.join(' ');
}

/**
 * Remplit une liste de langues, nommées dans la langue de l'interface.
 *
 * @param {HTMLSelectElement} liste - Liste à remplir.
 * @param {string[]} langues - Codes des langues proposées.
 * @param {string} choisie - Code de la langue sélectionnée.
 */
function remplirLangues(liste, langues, choisie) {
    const options = langues.map(code => new Option(t('langue.' + code), code, false, code === choisie));
    liste.replaceChildren(...options);
}

/**
 * Évite de traduire vers la langue de l'interface, qui est celle du texte
 * saisi le plus souvent : la cible prend alors la langue quittée.
 *
 * @param {string} quittee - Langue de l'interface avant le changement.
 */
function ajusterLangueCible(quittee) {
    if (langueCible !== I18n.langue) {
        return;
    }
    langueCible = quittee;
    ecrire('langue-cible', langueCible);
}

/**
 * Remplit les deux listes de Traduire.
 */
function afficherLangues() {
    remplirLangues($('langue-source'), [Albert.LANGUE_AUTO, ...Albert.LANGUES], langueSource);
    remplirLangues($('langue-cible'), Albert.LANGUES, langueCible);
}

/**
 * Met l'interface à jour pour l'outil actif : menu, titre, invite, langues.
 */
function afficherOutil() {
    /* Imprimerie n'a pas de bouton : c'est le titre de sa section qui porte la marque du module actif. */
    const imprimerie = $('menu-projets').querySelector('summary');
    if (Albert.OUTILS[outilActuel].documents) {
        imprimerie.setAttribute('aria-current', 'true');
    } else {
        imprimerie.removeAttribute('aria-current');
    }
    for (const bouton of document.querySelectorAll('[data-outil]')) {
        if (bouton.dataset.outil === outilActuel) {
            bouton.setAttribute('aria-current', 'true');
        } else {
            bouton.removeAttribute('aria-current');
        }
        /* Noms courts (module.*), pour tenir sur une ligne d'en-tête de téléphone. */
        const nom = bouton.querySelector('span');
        if (nom) {
            nom.textContent = t('module.' + bouton.dataset.outil);
        }
    }
    $('outil-actif').textContent = t('module.' + outilActuel);
    afficherCourante();
    /* Seule Discussion a les outils, recherche comprise (outils-modele.js). */
    afficherRecherche();
    $('langues').hidden = outilActuel !== 'traduire';
    /* Projet prend plusieurs fichiers d'un coup. */
    $('fichier').multiple = !!Albert.OUTILS[outilActuel].documents;
    /* Le CSS n'affiche la bienvenue que dans Chat. */
    $('chat').dataset.module = outilActuel;
    /* Le volet de la bibliothèque n'existe que dans Discussion et Imprimerie. */
    placerBibliotheque();
}

/* Ce qu'affichait chaque outil dans cet onglet (conversation, saisie, notes de Rédiger), retrouvé au retour. */
const laisseParOutil = {};

/**
 * Change d'outil. La conversation en cours est gardée dans l'historique,
 * et celle laissée plus tôt dans l'outil choisi revient.
 *
 * @param {string} outil - Clé de Albert.OUTILS.
 */
function choisirOutil(outil) {
    if (outil === outilActuel) {
        return;
    }
    laisseParOutil[outilActuel] = { id: conversationId, saisie: $('saisie').value, notes: $('notes').value };
    const laisse = laisseParOutil[outil];
    const entree = laisse && conversations.find(c => c.id === laisse.id);
    if (entree) {
        rouvrirConversation(entree);
    } else {
        nouvelleConversation();
        outilActuel = outil;
        ecrire('outil', outil);
        afficherOutil();
        /* Fil ou écran Rédiger. Pas dans afficherOutil : un changement de langue recocherait l'écran de la clé. */
        afficher();
    }
    /* Sans passage précédent, la saisie suit : on peut taper puis choisir l'outil. */
    if (laisse) {
        $('saisie').value = laisse.saisie;
        $('notes').value = laisse.notes;
    }
}

afficherLangues();

for (const bouton of document.querySelectorAll('[data-outil]')) {
    bouton.addEventListener('click', () => {
        choisirOutil(bouton.dataset.outil);
    });
}

/** Variantes lues dans public/exemples (promesses, par fichier), et dernière proposée. */
const exemplesLus = {};
const dernierExemple = {};

/**
 * Exemple tiré dans exemples/<langue>/<nom>.txt, jamais deux fois de suite le même.
 * Fichier absent ou illisible : l'exemple des fichiers de langue.
 *
 * @param {string} cle - Clé de l'exemple : "bienvenue.exemple-corriger" lit corriger.txt, "projet.exemple-courrier" projet-courrier.txt.
 * @param {string} langue - Code de langue du fichier.
 * @returns {Promise<string>} Texte à mettre dans la saisie.
 */
async function exempleFichier(cle, langue) {
    const chemin = 'exemples/' + langue + '/' + cle.replace('bienvenue.exemple-', '').replace('projet.exemple-', 'projet-') + '.txt';
    if (!exemplesLus[chemin]) {
        exemplesLus[chemin] = fetch(chemin)
            .then(res => (res.ok ? res.text() : ''))
            .then(texte => Albert.variantes(texte))
            .catch(() => []);
    }
    const liste = await exemplesLus[chemin];
    if (!liste.length) {
        return I18n.TEXTES[langue][cle];
    }
    dernierExemple[chemin] = Albert.autreVariante(liste, dernierExemple[chemin]);
    return dernierExemple[chemin];
}

/* Suggestions du chat vide : ouvrir le module s'il y en a un, puis préremplir un exemple. */
for (const bouton of document.querySelectorAll('.suggestion')) {
    bouton.addEventListener('click', async () => {
        if (bouton.dataset.module) {
            choisirOutil(bouton.dataset.module);
        }
        const champ = $(outilActuel === 'rediger' ? 'notes' : 'saisie');
        const cle = bouton.dataset.exemple;
        /* Traduire vers la langue de l'interface : l'exemple est pris dans une autre langue. */
        const autreLangue = outilActuel === 'traduire' && langueCible === I18n.langue;
        champ.value = await exempleFichier(cle, autreLangue ? (langueCible === 'en' ? 'fr' : 'en') : I18n.langue);
        /* "Faire une recherche" active le globe, s'il ne l'est pas déjà. */
        if (bouton.dataset.recherche !== undefined && !globeActif) {
            $('recherche-web').click();
        }
        champ.focus();
        /* Rédiger propose son courrier à chaque frappe : l'exemple le déclenche tout de suite. */
        if (outilActuel === 'rediger') {
            champ.dispatchEvent(new Event('input'));
        }
    });
}

$('langue-source').addEventListener('change', () => {
    langueSource = $('langue-source').value;
    ecrire('langue-source', langueSource);
});

$('langue-cible').addEventListener('change', () => {
    langueCible = $('langue-cible').value;
    ecrire('langue-cible', langueCible);
});
