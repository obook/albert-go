/*
 * reglages.js
 * Boîte de réglages : modèle, température, contexte, voix, mode partagé.
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
 * Affiche une carte par modèle dans la liste des réglages.
 */
function afficherModeles() {
    const cartes = modelesDispo.map(m => {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'modele';
        radio.value = m.id;
        label.append(radio,
            elementTexte('strong', 'nom', m.nom),
            elementTexte('span', 'type', m.type),
            elementTexte('span', 'description', m.description),
            elementTexte('span', 'detail', 'Alias : ' + m.id),
            elementTexte('span', 'detail', 'Modèle : ' + m.reel));
        return label;
    });
    $('modeles').replaceChildren(...cartes);
}

/**
 * Charge la liste réelle des modèles. En cas d'échec, la liste de secours reste.
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
    } catch (e) {
        /* On garde la liste de secours. */
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

$('partage-reglage').addEventListener('change', () => {
    changerPartage($('partage-reglage').checked);
});

$('ouvrir-reglages').addEventListener('click', () => {
    $('reglages').showModal();
});

$('resume-reglages').addEventListener('click', () => {
    $('reglages').showModal();
});
