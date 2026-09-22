/*
 * outils.js
 * Outils du menu : Discuter, Reformuler, Traduire (repris d'albert-droid), Corriger.
 *
 * Garde l'outil actif et les langues de Traduire. Les consignes système
 * sont dans public/prompts/<langue>/*.txt, lues au premier usage puis
 * gardées en mémoire. app.js s'en sert pour construire la requête.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/** Outil actif : clé de Albert.OUTILS. */
let outilActuel = lire('outil', 'discuter');
if (!Albert.OUTILS[outilActuel]) {
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

/**
 * Nom du module, première lettre en rouge comme le "t" de la marque.
 *
 * Les quatre outils se présentent comme une gamme : les noms module.* sont
 * courts, pour tenir sur une ligne d'en-tête de téléphone, là où outil.*
 * garde les verbes complets pour l'historique et les messages d'erreur.
 *
 * @param {string} outil - Clé de Albert.OUTILS.
 * @returns {Node[]} Initiale rouge puis reste du nom, pour replaceChildren.
 */
function nomModule(outil) {
    const nom = t('module.' + outil);
    const initiale = document.createElement('span');
    initiale.className = 'rouge';
    initiale.textContent = nom[0];
    return [initiale, document.createTextNode(nom.slice(1))];
}

/** Consignes déjà lues, par langue et par outil. */
const consignesLues = {};

/**
 * Consigne système de l'outil, lue dans son fichier au premier appel.
 *
 * @param {string} outil - Clé de Albert.OUTILS.
 * @returns {Promise<?string>} Texte de la consigne, ou null si l'outil n'en a pas.
 * @throws {Error} Si le fichier ne peut pas être lu.
 */
async function consigne(outil) {
    const fichier = Albert.OUTILS[outil].consigne;
    if (!fichier) {
        return null;
    }
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
    for (const bouton of document.querySelectorAll('[data-outil]')) {
        if (bouton.dataset.outil === outilActuel) {
            bouton.setAttribute('aria-current', 'true');
        } else {
            bouton.removeAttribute('aria-current');
        }
        bouton.querySelector('span')?.replaceChildren(...nomModule(bouton.dataset.outil));
    }
    $('outil-actif').replaceChildren(...nomModule(outilActuel));
    $('saisie').placeholder = t('invite.' + outilActuel);
    $('langues').hidden = outilActuel !== 'traduire';
}

/**
 * Change d'outil. La conversation en cours est gardée dans l'historique.
 *
 * @param {string} outil - Clé de Albert.OUTILS.
 */
function choisirOutil(outil) {
    if (outil === outilActuel) {
        return;
    }
    nouvelleConversation();
    outilActuel = outil;
    ecrire('outil', outil);
    afficherOutil();
}

afficherLangues();

for (const bouton of document.querySelectorAll('[data-outil]')) {
    bouton.addEventListener('click', () => {
        choisirOutil(bouton.dataset.outil);
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
