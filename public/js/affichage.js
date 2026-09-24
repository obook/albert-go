/*
 * affichage.js
 * Affichage de l'interface : écrans, résumé des réglages, fil, toast.
 *
 * Ne fait que construire et mettre à jour le DOM. Les réponses passent
 * par rendu.js ; la lecture à voix haute par lecture.js.
 * Utilise l'état défini dans stockage.js.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/* Icônes fixes, jamais du texte du modèle : innerHTML est sans risque ici. */
const ICONES = {
    copier: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
    copie: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    lire: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    revoir: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M8.5 11l1.8 1.8 3.2-3.3"/></svg>',
    arreter: '<svg class="plein" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
    /* Globe : recherche sur le web. */
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/>'
        + '<path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z"/></svg>',
    /* W de Wikipédia plutôt que son logo : une marque, illisible à 17 px.
       La police trace la lettre, qui est pleine, d'où la classe "lettre". */
    wikipedia: '<svg class="lettre" viewBox="0 0 24 24" aria-hidden="true">'
        + '<text x="12" y="18.5" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif"'
        + ' font-size="19" font-weight="700">W</text></svg>',
    lune: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>',
    soleil: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    systeme: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    points: '<svg class="plein" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>'
};

/** Consommation du dernier échange, pour la jauge de contexte. */
let dernierUsage = null;

/** Minuteur qui masque le toast. */
let minuteurToast = null;

/**
 * Affiche l'écran de la clé ou celui de la conversation.
 */
function afficher() {
    const connecte = !!reglages.cle;
    $('form-cle').hidden = connecte;
    const redaction = outilActuel === 'rediger';
    $('chat').hidden = !connecte || redaction;
    $('saisie-zone').hidden = !connecte || redaction;
    $('redaction').hidden = !connecte || !redaction;
    for (const id of ['ouvrir-reglages', 'nouvelle', 'resume-reglages', 'menu-outils', 'menu-historique', 'changer-cle']) {
        $(id).hidden = !connecte;
    }
    if (connecte) {
        focusSaisie();
    } else {
        /* Écran de la clé : effacement à la fermeture toujours proposé par défaut. */
        $('partage-accueil').checked = true;
        $('texte-partage-accueil').textContent = textePartage(true);
        $('cle').focus();
    }
}

/**
 * Anime l'en-tête pendant qu'Albert est interrogé : un reflet parcourt la barre.
 *
 * @param {boolean} actif - true pendant une requête.
 */
function interroger(actif) {
    document.body.classList.toggle('interroge', actif);
}

/**
 * Indique si l'appareil se pilote au doigt.
 *
 * @returns {boolean} true sur un écran tactile.
 */
function ecranTactile() {
    return matchMedia('(pointer: coarse)').matches;
}

/**
 * Remet le curseur dans le champ de saisie, sauf sur écran tactile :
 * le clavier virtuel s'ouvrirait et cacherait la réponse.
 */
function focusSaisie() {
    if (!ecranTactile()) {
        $(outilActuel === 'rediger' ? 'notes' : 'saisie').focus();
    }
}

/*
Texte des interrupteurs : il décrit l'état actuel. Le début reste le même
pour que le lecteur d'écran annonce toujours le même nom, suivi de l'état.
*/

/**
 * Texte de l'interrupteur d'effacement à la fermeture.
 *
 * @param {boolean} actif - Interrupteur activé.
 * @returns {string} Texte à afficher.
 */
function textePartage(actif) {
    return t(actif ? 'partage.actif' : 'partage.inactif');
}

/**
 * Texte de l'interrupteur de contexte.
 *
 * @param {boolean} actif - Interrupteur activé.
 * @returns {string} Texte à afficher.
 */
function texteMemoire(actif) {
    return t(actif ? 'memoire.actif' : 'memoire.inactif');
}

/**
 * Met à jour les réglages affichés, le résumé du menu et la jauge.
 */
function afficherReglages() {
    const modele = modeleActuel();
    const pourcent = Albert.occupation(dernierUsage, modele.contexte);

    let contexte = t('contexte.sans');
    if (reglages.memoire) {
        contexte = pourcent === null ? t('contexte.complet') : t('contexte.pourcent', { pourcent: pourcent });
    }
    /* Virgule décimale en français, point en anglais. */
    const temperature = reglages.temperature.toLocaleString(I18n.langue, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    $('resume-reglages').textContent = t('reglages.resume',
        { modele: modele.nom, temperature: temperature, contexte: contexte });
    $('jauge-niveau').style.width = (pourcent || 0) + '%';
    $('jauge-niveau').classList.toggle('pleine', pourcent !== null && pourcent >= 80);

    $('memoire-reglage').checked = reglages.memoire;
    $('texte-memoire').textContent = texteMemoire(reglages.memoire);
    $('voix-en-ligne').checked = reglages.voixEnLigne;
    $('partage-reglage').checked = partage;
    $('texte-partage-reglage').textContent = textePartage(partage);
    $('temperature').value = reglages.temperature;
    $('valeur-temperature').textContent = temperature;
    $('modele-choisi').textContent = modele.nom + ' (' + modele.id + ')';
    const radio = [...document.querySelectorAll('input[name="modele"]')].find(r => r.value === modele.id);
    if (radio) {
        radio.checked = true;
    }
}

/**
 * Ajoute un message au fil de conversation.
 *
 * @param {string} role - "user" pour une question, "assistant" pour une réponse.
 * @param {string} texte - Texte du message (Markdown pour une réponse).
 * @param {string} [langue] - Langue d'une réponse de Traduire ("ru"...), pour la lecture.
 * @param {boolean} [animer] - true pour dévoiler une réponse qui vient d'arriver.
 * @param {Array<Object>} [recherches] - Recherches { mots, sources } faites pour cette réponse.
 * @returns {HTMLLIElement} L'élément ajouté (la première bulle pour des variantes).
 */
function ajouter(role, texte, langue, animer = false, recherches = null) {
    if (role === 'assistant') {
        return ajouterReponse(texte, langue, animer, recherches);
    }
    const li = document.createElement('li');
    li.className = role;
    const qui = document.createElement('span');
    qui.className = 'visuellement-cache';
    qui.textContent = t('vous');
    li.append(qui, texte);
    $('fil').append(li);
    li.scrollIntoView({ block: 'end' });
    return li;
}

/**
 * Affiche l'attente d'une réponse : trois points et secondes écoulées.
 *
 * @returns {Function} Fonction qui retire l'attente.
 */
function ajouterAttente() {
    const li = document.createElement('li');
    li.className = 'assistant';
    li.setAttribute('aria-hidden', 'true');
    const attente = document.createElement('div');
    attente.className = 'carte attente';
    const points = document.createElement('span');
    points.className = 'points';
    points.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
    const duree = document.createElement('span');
    duree.className = 'duree';
    attente.append(points, duree);
    li.append(pastilleIA(), attente);
    $('fil').append(li);
    li.scrollIntoView({ block: 'end' });

    const debut = Date.now();
    const minuteur = setInterval(() => {
        duree.textContent = t('duree', { secondes: Math.round((Date.now() - debut) / 1000) });
    }, 1000);
    return () => {
        clearInterval(minuteur);
        li.remove();
    };
}

/**
 * Affiche un court message sous l'en-tête.
 *
 * @param {string} texte - Message à afficher.
 */
function toast(texte) {
    const boite = $('toast');
    boite.textContent = texte;
    boite.classList.add('visible');
    clearTimeout(minuteurToast);
    /* Un message long reste plus longtemps. */
    const duree = Math.max(2000, texte.length * 60);
    minuteurToast = setTimeout(() => {
        $('toast').classList.remove('visible');
    }, duree);
}

/**
 * Écrit un message sous le champ de la clé.
 *
 * Le lien est ajouté à la fin, sous le nom "Albert Go", suivi du point final.
 *
 * @param {string} texte - Message, ou chaîne vide pour effacer.
 * @param {boolean} erreur - true pour l'afficher comme une erreur.
 * @param {string} [lien] - Adresse d'un lien ajouté après le texte.
 */
function messageCle(texte, erreur, lien) {
    $('message-cle').textContent = texte;
    if (lien) {
        const ancre = document.createElement('a');
        ancre.href = lien;
        ancre.textContent = 'Albert Go';
        ancre.target = '_blank';
        ancre.rel = 'noopener noreferrer';
        $('message-cle').append(ancre, '.');
    }
    $('message-cle').classList.toggle('erreur', erreur);
}

/**
 * Écrit un message dans la ligne d'état sous la saisie.
 *
 * @param {string} texte - Message, ou chaîne vide pour effacer.
 * @param {boolean} [erreur] - true pour l'afficher comme une erreur.
 */
function etat(texte, erreur) {
    const ligne = $('etat');
    ligne.textContent = texte;
    ligne.classList.toggle('erreur', !!erreur);
}
