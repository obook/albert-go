/*
 * outils.js
 * Outils du menu : Discuter, Reformuler, Traduire (repris d'albert-droid).
 *
 * Garde l'outil actif et les langues de Traduire. Les consignes système
 * sont dans public/prompts/*.txt, lues au premier usage puis gardées en
 * mémoire. app.js s'en sert pour construire la requête.
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

/** Langues de Traduire. */
let langueSource = lire('langue-source', Albert.LANGUE_AUTO);
let langueCible = lire('langue-cible', 'Anglais');

/** Consignes déjà lues, par outil. */
const consignesLues = {};

/**
 * Consigne système de l'outil, lue dans son fichier au premier appel.
 *
 * @param {string} outil - Clé de Albert.OUTILS.
 * @returns {Promise<?string>} Texte de la consigne, ou null pour Discuter.
 * @throws {Error} Si le fichier ne peut pas être lu.
 */
async function consigne(outil) {
    const fichier = Albert.OUTILS[outil].consigne;
    if (!fichier) {
        return null;
    }
    if (!consignesLues[outil]) {
        const res = await fetch(fichier);
        if (!res.ok) {
            throw new Error('Consigne de l\'outil ' + Albert.OUTILS[outil].nom + ' introuvable.');
        }
        consignesLues[outil] = await res.text();
    }
    return consignesLues[outil];
}

/**
 * Remplit une liste de langues.
 *
 * @param {HTMLSelectElement} liste - Liste à remplir.
 * @param {string[]} langues - Langues proposées.
 * @param {string} choisie - Langue sélectionnée.
 */
function remplirLangues(liste, langues, choisie) {
    const options = langues.map(langue => new Option(langue, langue, false, langue === choisie));
    liste.replaceChildren(...options);
}

/**
 * Met l'interface à jour pour l'outil actif : menu, invite, choix des langues.
 */
function afficherOutil() {
    for (const bouton of document.querySelectorAll('[data-outil]')) {
        if (bouton.dataset.outil === outilActuel) {
            bouton.setAttribute('aria-current', 'true');
        } else {
            bouton.removeAttribute('aria-current');
        }
    }
    $('saisie').placeholder = Albert.OUTILS[outilActuel].invite;
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

remplirLangues($('langue-source'), [Albert.LANGUE_AUTO, ...Albert.LANGUES], langueSource);
remplirLangues($('langue-cible'), Albert.LANGUES, langueCible);

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
