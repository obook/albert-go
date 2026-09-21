/*
 * stockage.js
 * Premier script de l'interface : garde contre le cadrage, stockage, état partagé.
 *
 * Les scripts de l'interface sont des scripts classiques qui partagent
 * leurs variables globales. Ordre de chargement (index.html) :
 *   stockage.js -> affichage.js -> reponse.js -> reglages.js -> historique.js
 *   -> outils.js -> menu.js -> piece-jointe.js -> cle.js -> app.js
 * Ce fichier définit $, lire, ecrire, reglages, conversation et historique.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/**
 * Raccourci pour document.getElementById.
 *
 * @param {string} id - Identifiant de l'élément.
 * @returns {?HTMLElement} L'élément, ou null.
 */
const $ = (id) => document.getElementById(id);

/* Langue de l'interface, avant le premier texte affiché : celle du
   navigateur au premier lancement, puis celle choisie dans les réglages. */
try {
    I18n.definir(localStorage.getItem('albert-go.langue') || I18n.defaut());
} catch (e) {
    I18n.definir(I18n.defaut());
}

/*
Dans le cadre d'un autre site : un lien seul, puis arrêt (SECURITE.md, E2).
Pages ne permet pas l'en-tête X-Frame-Options.
Les scripts suivants échouent alors dès leur premier accès au DOM.
*/
if (window.top !== window.self) {
    const lien = document.createElement('a');
    lien.href = location.href;
    lien.target = '_top';
    lien.textContent = t('erreur.hors-cadre');
    const paragraphe = document.createElement('p');
    paragraphe.className = 'hors-cadre';
    paragraphe.append(lien);
    document.body.replaceChildren(paragraphe);
    throw new Error('Albert Go ne s\'affiche pas dans le cadre d\'un autre site.');
}

/* Données effacées à la fermeture de l'onglet en mode partagé. */
const SENSIBLES = ['cle', 'cle-recherche', 'historique', 'conversations'];

/** Mode partagé : clé, questions et conversations en sessionStorage. */
let partage = false;

/**
 * Stockage à utiliser pour une donnée.
 *
 * @param {string} nom - Nom de la donnée, sans préfixe.
 * @returns {Storage} sessionStorage pour une donnée sensible en mode partagé, sinon localStorage.
 */
function stockage(nom) {
    if (partage && SENSIBLES.includes(nom)) {
        return sessionStorage;
    }
    return localStorage;
}

/**
 * Lit une donnée enregistrée.
 *
 * @param {string} nom - Nom de la donnée, sans le préfixe "albert-go.".
 * @param {?string} defaut - Valeur si rien n'est enregistré.
 * @returns {?string} Valeur lue, ou defaut.
 */
function lire(nom, defaut) {
    /* Le stockage peut être bloqué (navigation privée). */
    try {
        const valeur = stockage(nom).getItem('albert-go.' + nom);
        if (valeur === null) {
            return defaut;
        }
        return valeur;
    } catch (e) {
        return defaut;
    }
}

/**
 * Enregistre une donnée, ou l'efface si la valeur est null.
 *
 * @param {string} nom - Nom de la donnée, sans le préfixe "albert-go.".
 * @param {?string} valeur - Valeur à enregistrer, ou null pour effacer.
 */
function ecrire(nom, valeur) {
    try {
        if (valeur === null) {
            stockage(nom).removeItem('albert-go.' + nom);
        } else {
            stockage(nom).setItem('albert-go.' + nom, valeur);
        }
    } catch (e) {
        /* Stockage bloqué : la valeur est perdue au rechargement. */
    }
}

/* Mode partagé activé par défaut ; à désactiver sur un poste personnel. */
partage = lire('partage', 'oui') === 'oui';

/* Une ancienne version rangeait la clé dans localStorage : on l'efface. */
if (partage) {
    for (const nom of SENSIBLES) {
        try {
            localStorage.removeItem('albert-go.' + nom);
        } catch (e) {
            /* Stockage bloqué. */
        }
    }
}

/*
Mode partagé. Le navigateur restaure sessionStorage quand on rouvre un onglet
fermé : il faut effacer. Mais pagehide ne distingue pas fermeture et
rechargement. Donc pagehide pose seulement une marque, et le chargement
suivant décide : rechargement, on garde tout ; sinon, on efface.
Onglet masqué au pagehide : sans doute gelé par une extension, pas de marque.
*/
const MARQUE_FERMETURE = 'albert-go.fermeture';

window.addEventListener('pagehide', () => {
    if (partage && document.visibilityState === 'visible') {
        try {
            sessionStorage.setItem(MARQUE_FERMETURE, 'oui');
        } catch (e) {
            /* Stockage bloqué : rien à effacer plus tard. */
        }
    }
});

/**
 * Indique si la page vient d'être rechargée (F5, Ctrl+R, tirer pour rafraîchir).
 *
 * @returns {boolean} true pour un rechargement.
 */
function estRechargement() {
    const navigation = performance.getEntriesByType('navigation')[0];
    return !!navigation && navigation.type === 'reload';
}

try {
    if (sessionStorage.getItem(MARQUE_FERMETURE)) {
        sessionStorage.removeItem(MARQUE_FERMETURE);
        if (partage && !estRechargement()) {
            for (const nom of SENSIBLES) {
                ecrire(nom, null);
            }
        }
    }
} catch (e) {
    /* Stockage bloqué. */
}

/**
 * Active ou désactive le mode partagé, en déplaçant les données sensibles.
 *
 * @param {boolean} actif - true pour le mode partagé.
 */
function changerPartage(actif) {
    const valeurs = SENSIBLES.map(nom => lire(nom, null));
    for (const nom of SENSIBLES) {
        ecrire(nom, null);
    }
    partage = actif;
    ecrire('partage', actif ? 'oui' : 'non');
    SENSIBLES.forEach((nom, i) => {
        if (valeurs[i] !== null) {
            ecrire(nom, valeurs[i]);
        }
    });
}

/**
 * Température enregistrée, ramenée aux bornes du curseur.
 *
 * @returns {number} Température entre 0 et 1, ou la valeur conseillée.
 */
function temperatureLue() {
    const valeur = parseFloat(lire('temperature', ''));
    if (!Number.isFinite(valeur)) {
        return Albert.CONSEILLES.temperature;
    }
    return Math.min(1, Math.max(0, valeur));
}

/** Réglages de l'utilisateur, lus au démarrage. */
const reglages = {
    cle: lire('cle', null),
    modele: lire('modele', Albert.CONSEILLES.modele),
    /* Une valeur illisible donnerait NaN, envoyé en "temperature": null. */
    temperature: temperatureLue(),
    memoire: lire('memoire', Albert.CONSEILLES.memoire ? 'oui' : 'non') === 'oui',
    langue: I18n.langue,
    voixEnLigne: lire('voix-en-ligne', 'non') === 'oui',
    recherche: lire('recherche', 'non') === 'oui',
    fournisseur: lire('fournisseur', 'wikipedia'),
    cx: lire('cx', Recherche.CX),
    cleRecherche: lire('cle-recherche', null)
};
if (typeof Lecture !== 'undefined') {
    Lecture.enLigne = reglages.voixEnLigne;
}

/** Modèles proposés : liste de secours tant que /v1/models n'a pas répondu. */
let modelesDispo = Albert.MODELES;

/**
 * Modèle choisi dans les réglages.
 *
 * @returns {Object} Le modèle choisi, ou le premier de la liste s'il n'existe plus.
 */
function modeleActuel() {
    return modelesDispo.find(m => m.id === reglages.modele) || modelesDispo[0];
}

/** Messages de la conversation en cours : { role, content, affiche? } (affiche : texte de la bulle). */
let conversation = [];

/** Questions posées, la plus récente en premier. */
let historique = [];
try {
    historique = JSON.parse(lire('historique', '[]'));
} catch (e) {
    /* Historique illisible : on repart de zéro. */
}
if (!Array.isArray(historique)) {
    historique = [];
}

/** Position dans l'historique pendant le rappel : -1 pour la saisie en cours. */
let position = -1;

/** Saisie en cours, gardée pendant qu'on parcourt l'historique. */
let brouillon = '';
