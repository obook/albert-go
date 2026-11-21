/*
 * conversation/chronometre.js
 * Affiche ce qu'une réponse a coûté, pour comprendre une attente longue :
 * pendant l'attente, les jetons qu'Albert va lire ; sous la réponse, une icône
 * de chronomètre qui déplie le détail (envoi par origine, reçu, durées).
 *
 * Les chiffres viennent d'Albert.mesurer (albert/mesure.js), appelé par
 * demanderReponse (app.js). La trace est gardée dans les recherches de la
 * réponse : elle revient avec l'historique. bulleReponse (reponse.js) l'affiche.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

/**
 * Nombre écrit dans la langue de l'interface : 21 300, 21,300...
 *
 * @param {number} nombre - Nombre à écrire.
 * @returns {string} Le nombre formaté.
 */
function nombreLisible(nombre) {
    /* L'espace fine insécable du français disparaissait dans la ligne d'attente : insécable ordinaire. */
    return nombre.toLocaleString(I18n.langue).replace(/\p{Zs}/gu, String.fromCharCode(160));
}

/**
 * Secondes à une décimale, à partir de millisecondes.
 *
 * @param {number} ms - Durée en millisecondes.
 * @returns {string} Par exemple "21,4".
 */
function secondesLisibles(ms) {
    return (Math.round(ms / 100) / 10).toLocaleString(I18n.langue);
}

/**
 * Annonce, dans la carte d'attente, les jetons qu'Albert va lire et la part des sources.
 *
 * @param {Object<string, number>} caracteres - Caractères envoyés par origine.
 */
function annoncerLecture(caracteres) {
    const attente = document.querySelector('#fil li.en-attente .attente');
    if (!attente) {
        return;
    }
    const envoi = Albert.partsEnvoi(caracteres, null);
    const sources = envoi.parts.find((part) => part.origine === 'sources');
    const texte = sources
        ? t('mesure.lecture-sources', { jetons: nombreLisible(envoi.total), pourcent: sources.pourcent })
        : t('mesure.lecture', { jetons: nombreLisible(envoi.total) });
    let ligne = attente.querySelector('.lecture');
    if (!ligne) {
        ligne = document.createElement('span');
        ligne.className = 'lecture';
        attente.querySelector('.duree').before(ligne);
    }
    ligne.textContent = texte;
}

/**
 * Ligne d'une origine de l'envoi : nom, pourcentage, barre, jetons.
 *
 * @param {{origine: string, jetons: number, pourcent: number}} part - Part de Albert.partsEnvoi.
 * @returns {HTMLDivElement} La ligne.
 */
function lignePart(part) {
    const ligne = document.createElement('div');
    ligne.className = 'part';
    const nom = document.createElement('span');
    nom.textContent = t('mesure.' + part.origine);
    const pourcent = document.createElement('span');
    pourcent.className = 'pourcent';
    pourcent.textContent = part.pourcent + ' %';
    /* La barre double le pourcentage écrit à côté : cachée aux lecteurs d'écran. */
    const barre = document.createElement('meter');
    barre.min = 0;
    barre.max = 100;
    barre.value = part.pourcent;
    barre.setAttribute('aria-hidden', 'true');
    const jetons = document.createElement('span');
    jetons.className = 'jetons';
    jetons.textContent = nombreLisible(part.jetons);
    ligne.append(nom, pourcent, barre, jetons);
    return ligne;
}

/**
 * Paragraphe de texte simple.
 *
 * @param {string} texte - Contenu.
 * @returns {HTMLParagraphElement} Le paragraphe.
 */
function paragrapheMesure(texte) {
    const p = document.createElement('p');
    p.textContent = texte;
    return p;
}

/**
 * Détail d'une mesure, replié au départ, et l'icône qui le déplie.
 *
 * @param {Object} mesure - Mesure de Albert.mesurer.
 * @returns {{note: HTMLDivElement, bouton: HTMLButtonElement}} Détail et bouton.
 */
function traceMesure(mesure) {
    const note = document.createElement('div');
    note.className = 'note mesure';
    note.hidden = true;
    const envoi = mesure.envoi;
    const total = envoi.estime ? t('mesure.environ', { nombre: nombreLisible(envoi.total) }) : nombreLisible(envoi.total);
    let envoye = t('mesure.envoye', { jetons: total });
    if (mesure.capacite !== null) {
        envoye += ' ' + t('mesure.capacite', { pourcent: mesure.capacite });
    }
    note.append(paragrapheMesure(envoye));
    if (mesure.appels > 1) {
        note.append(paragrapheMesure(t('mesure.dernier-appel', { appels: mesure.appels })));
    }
    const parts = document.createElement('div');
    parts.className = 'parts';
    parts.append(...envoi.parts.map(lignePart));
    note.append(parts);
    if (mesure.recus !== null) {
        note.append(paragrapheMesure(t('mesure.recus', { jetons: nombreLisible(mesure.recus) })));
    }
    for (const duree of mesure.durees) {
        note.append(paragrapheMesure(t('mesure.duree', {
            nom: t('mesure.' + duree.nom),
            secondes: secondesLisibles(duree.ms),
            pourcent: duree.pourcent
        })));
    }
    note.append(paragrapheMesure(t('mesure.total', { secondes: secondesLisibles(mesure.totalMs) })));
    return { note: note, bouton: boutonTrace(note, ICONES.chronometre, t('mesure.bouton')) };
}
