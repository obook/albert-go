/*
 * stockage.js
 * Premier script de l'interface : garde contre le cadrage, stockage, état partagé.
 *
 * Les scripts de l'interface sont des scripts classiques qui partagent
 * leurs variables globales. Ordre de chargement (index.html) :
 *   stockage.js -> affichage.js -> reponse.js -> reglages.js -> historique.js
 *   -> modules.js -> redaction.js -> menu.js -> piece-jointe.js -> cle.js -> app.js
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
} catch (err) {
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
    } catch (err) {
        return defaut;
    }
}

/**
 * Enregistre une donnée, ou l'efface si la valeur est null.
 *
 * @param {string} nom - Nom de la donnée, sans le préfixe "albert-go.".
 * @param {?string} valeur - Valeur à enregistrer, ou null pour effacer.
 * @returns {boolean} false si le stockage est bloqué ou plein.
 */
function ecrire(nom, valeur) {
    try {
        if (valeur === null) {
            stockage(nom).removeItem('albert-go.' + nom);
        } else {
            stockage(nom).setItem('albert-go.' + nom, valeur);
        }
        return true;
    } catch (err) {
        /* Stockage bloqué ou plein : la valeur est perdue au rechargement. */
        return false;
    }
}

/* Mode partagé activé par défaut ; à désactiver sur un poste personnel. */
partage = lire('partage', 'oui') === 'oui';

/* Une ancienne version rangeait la clé dans localStorage : on l'efface. */
if (partage) {
    for (const nom of SENSIBLES) {
        try {
            localStorage.removeItem('albert-go.' + nom);
        } catch (err) {
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
        } catch (err) {
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
} catch (err) {
    /* Stockage bloqué. */
}

/**
 * Active ou désactive le mode partagé, en déplaçant les données sensibles.
 *
 * Écrit dans la cible avant d'effacer la source : un historique volumineux
 * peut dépasser le quota de sessionStorage, et il serait alors perdu.
 *
 * @param {boolean} actif - true pour le mode partagé.
 * @returns {boolean} false si la cible a refusé les données, rien n'ayant bougé.
 */
function changerPartage(actif) {
    const valeurs = SENSIBLES.map(nom => lire(nom, null));
    const sources = SENSIBLES.map(nom => stockage(nom));
    partage = actif;
    const ecrites = [];
    for (const [i, nom] of SENSIBLES.entries()) {
        if (valeurs[i] === null) {
            continue;
        }
        if (!ecrire(nom, valeurs[i])) {
            /* Retour en arrière : la source a tout, la cible ne garde rien. */
            ecrites.forEach(rang => ecrire(SENSIBLES[rang], null));
            partage = !actif;
            return false;
        }
        ecrites.push(i);
    }
    SENSIBLES.forEach((nom, i) => {
        if (valeurs[i] !== null && sources[i] !== stockage(nom)) {
            sources[i].removeItem('albert-go.' + nom);
        }
    });
    ecrire('partage', actif ? 'oui' : 'non');
    return true;
}

/**
 * Température enregistrée, ramenée aux bornes du curseur.
 *
 * @returns {number} Température entre 0 et Albert.TEMPERATURE_MAX, ou la valeur conseillée.
 */
function temperatureLue() {
    const valeur = parseFloat(lire('temperature', ''));
    if (!Number.isFinite(valeur)) {
        return Albert.CONSEILLES.temperature;
    }
    return Math.min(Albert.TEMPERATURE_MAX, Math.max(0, valeur));
}

/**
 * Top-k enregistré, ramené aux bornes du curseur.
 *
 * @returns {number} Entier de 1 à Albert.TOP_K_SANS_LIMITE, ou la valeur conseillée.
 */
function topKLu() {
    const valeur = parseInt(lire('top-k', ''), 10);
    if (!Number.isFinite(valeur)) {
        return Albert.CONSEILLES.topK;
    }
    return Math.min(Albert.TOP_K_SANS_LIMITE, Math.max(1, valeur));
}

/**
 * Échanges relus, ramenés aux bornes du curseur.
 *
 * L'ancien interrupteur "mémoire" est repris : "non" valait aucun échange.
 *
 * @returns {number} Entier de 0 à Albert.ECHANGES_TOUS, ou la valeur conseillée.
 */
function echangesLus() {
    const valeur = parseInt(lire('echanges', ''), 10);
    if (!Number.isFinite(valeur)) {
        return lire('memoire', 'oui') === 'non' ? 0 : Albert.CONSEILLES.echanges;
    }
    return Math.min(Albert.ECHANGES_TOUS, Math.max(0, valeur));
}

/** Réglages de l'utilisateur, lus au démarrage. */
const reglages = {
    cle: lire('cle', null),
    modele: lire('modele', Albert.CONSEILLES.modele),
    /* Une valeur illisible donnerait NaN, envoyé en "temperature": null. */
    temperature: temperatureLue(),
    topK: topKLu(),
    echanges: echangesLus(),
    langue: I18n.langue,
    voixEnLigne: lire('voix-en-ligne', 'non') === 'oui',
    /* Internet, pour la recherche et les images Wikimedia. Ancien réglage images compris. */
    recherche: lire('recherche', 'non') === 'oui' || lire('images', 'non') === 'oui',
    /* Un interrupteur par outil local, activé par défaut. */
    ...Object.fromEntries(Object.keys(OUTILS_LOCAUX).map(nom => [nom, lire(nom, 'oui') === 'oui'])),
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
} catch (err) {
    /* Historique illisible : on repart de zéro. */
}
if (!Array.isArray(historique)) {
    historique = [];
}

/** Position dans l'historique pendant le rappel : -1 pour la saisie en cours. */
let position = -1;

/** Saisie en cours, gardée pendant qu'on parcourt l'historique. */
let brouillon = '';
