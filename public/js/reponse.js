/*
 * reponse.js
 * Bulles des réponses d'Albert, avec leurs boutons Copier et Lire.
 *
 * Avec Reformuler, chaque variante ("### Plus courte"...) a sa propre bulle
 * et son propre bouton Copier. Appelé par ajouter (affichage.js).
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/**
 * Crée un petit bouton d'icône sous une réponse.
 *
 * @param {string} icone - SVG pris dans ICONES.
 * @param {string} libelle - Texte lu par les lecteurs d'écran et info-bulle.
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonAction(icone, libelle) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'bouton-action';
    bouton.innerHTML = icone;
    bouton.setAttribute('aria-label', libelle);
    bouton.title = libelle;
    return bouton;
}

/**
 * Crée le bouton "Copier la réponse".
 *
 * @param {string} texte - Texte brut à copier.
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonCopier(texte) {
    const bouton = boutonAction(ICONES.copier, 'Copier la réponse');
    bouton.addEventListener('click', () => {
        navigator.clipboard.writeText(texte).then(() => {
            bouton.innerHTML = ICONES.copie;
            toast('Réponse copiée.');
            setTimeout(() => {
                bouton.innerHTML = ICONES.copier;
            }, 1500);
        });
    });
    return bouton;
}

/**
 * Nom d'une langue en minuscules à partir de son code : "ru" donne "russe".
 *
 * @param {string} code - Code de langue.
 * @returns {string} Nom de la langue, ou le code s'il est inconnu.
 */
function nomLangue(code) {
    const nom = Object.keys(Albert.CODES_LANGUES).find(n => Albert.CODES_LANGUES[n] === code);
    return nom ? nom.toLowerCase() : code;
}

/**
 * Crée le bouton "Lire à voix haute".
 *
 * @param {HTMLElement} contenu - Réponse affichée à lire.
 * @param {string} langue - Code de la langue de la réponse ("fr", "ru"...).
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonLire(contenu, langue) {
    const bouton = boutonAction(ICONES.lire, 'Lire à voix haute');
    bouton.addEventListener('click', () => {
        if (!Lecture.disponible(langue)) {
            const nom = nomLangue(langue);
            if (Lecture.enLigne) {
                toast('Aucune voix en ' + nom + ' disponible dans ce navigateur.');
            } else {
                toast('Aucune voix en ' + nom + ' installée sur cet appareil. Les voix en ligne ne sont pas utilisées.');
            }
            return;
        }
        Lecture.basculer(bouton, contenu, langue);
    });
    bouton.addEventListener('lecture-debut', () => {
        bouton.innerHTML = ICONES.arreter;
        bouton.setAttribute('aria-label', 'Arrêter la lecture');
    });
    bouton.addEventListener('lecture-fin', () => {
        bouton.innerHTML = ICONES.lire;
        bouton.setAttribute('aria-label', 'Lire à voix haute');
    });
    return bouton;
}

/**
 * Crée la pastille "IA" placée à gauche d'une réponse.
 *
 * @returns {HTMLSpanElement} La pastille.
 */
function pastilleIA() {
    const pastille = document.createElement('span');
    pastille.className = 'pastille';
    pastille.textContent = 'IA';
    return pastille;
}

/**
 * Crée la bulle d'une réponse, ou d'une variante si un titre est donné.
 *
 * @param {string} texte - Texte en Markdown.
 * @param {?string} titre - Titre de la variante ("Plus courte"...), ou null.
 * @param {string} langue - Code de la langue, pour la lecture à voix haute.
 * @returns {HTMLLIElement} La bulle, pas encore ajoutée au fil.
 */
function bulleReponse(texte, titre, langue) {
    const li = document.createElement('li');
    li.className = 'assistant';
    const carte = document.createElement('div');
    carte.className = 'carte';
    if (titre) {
        const entete = document.createElement('p');
        entete.className = 'titre-variante';
        entete.textContent = titre;
        carte.append(entete);
    }
    const contenu = document.createElement('div');
    contenu.className = 'texte rendu';
    Rendu.afficher(contenu, texte);

    const actions = document.createElement('div');
    actions.className = 'actions-reponse';
    actions.append(boutonCopier(texte));
    if (typeof speechSynthesis !== 'undefined') {
        actions.append(boutonLire(contenu, langue));
    }
    carte.append(contenu, actions);
    li.append(pastilleIA(), carte);
    return li;
}

/**
 * Ajoute une réponse au fil : une bulle, ou une par variante avec Reformuler.
 *
 * @param {string} texte - Réponse du modèle.
 * @param {string} [langue] - Code de la langue de la réponse ; français par défaut.
 * @returns {HTMLLIElement} La première bulle ajoutée.
 */
function ajouterReponse(texte, langue = 'fr') {
    let variantes = null;
    if (outilActuel === 'reformuler') {
        variantes = Albert.decouperVariantes(texte);
    }
    if (!variantes) {
        const li = bulleReponse(texte, null, langue);
        $('fil').append(li);
        li.scrollIntoView({ block: 'end' });
        return li;
    }
    const bulles = variantes.map(v => bulleReponse(v.texte, v.titre, langue));
    $('fil').append(...bulles);
    /* Montrer le début de la première variante, pas la fin de la dernière. */
    bulles[0].scrollIntoView({ block: 'start' });
    return bulles[0];
}
