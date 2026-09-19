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
    arreter: '<svg class="plein" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
    lune: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>',
    soleil: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    systeme: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>'
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
    $('chat').hidden = !connecte;
    $('saisie-zone').hidden = !connecte;
    for (const id of ['ouvrir-reglages', 'nouvelle', 'nouvelle-entete', 'resume-reglages', 'menu-outils', 'menu-historique', 'changer-cle']) {
        $(id).hidden = !connecte;
    }
    if (connecte) {
        focusSaisie();
    } else {
        $('cle').focus();
    }
}

/**
 * Remet le curseur dans le champ de saisie, sauf sur écran tactile :
 * le clavier virtuel s'ouvrirait et cacherait la réponse.
 */
function focusSaisie() {
    if (!matchMedia('(pointer: coarse)').matches) {
        $('saisie').focus();
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
    if (actif) {
        return 'À la fermeture de l\'onglet, la clé et les conversations seront effacées.';
    }
    return 'À la fermeture de l\'onglet, la clé et les conversations seront conservées.';
}

/**
 * Texte de l'interrupteur de contexte.
 *
 * @param {boolean} actif - Interrupteur activé.
 * @returns {string} Texte à afficher.
 */
function texteMemoire(actif) {
    if (actif) {
        return 'Envoyé à Albert : toute la conversation.';
    }
    return 'Envoyé à Albert : la dernière question seulement.';
}

/**
 * Met à jour les réglages affichés, le résumé du menu et la jauge.
 */
function afficherReglages() {
    const modele = modeleActuel();
    const pourcent = Albert.occupation(dernierUsage, modele.contexte);

    let contexte = 'sans contexte';
    if (reglages.memoire) {
        contexte = pourcent === null ? 'contexte complet' : 'contexte ' + pourcent + ' %';
    }
    /* Virgule décimale : 0,2 et non 0.2. */
    const temperature = reglages.temperature.toFixed(1).replace('.', ',');
    $('resume-reglages').textContent = modele.nom + ', température ' + temperature + ', ' + contexte;
    $('jauge-niveau').style.width = (pourcent || 0) + '%';
    $('jauge-niveau').classList.toggle('pleine', pourcent !== null && pourcent >= 80);

    $('memoire-reglage').checked = reglages.memoire;
    $('texte-memoire').textContent = texteMemoire(reglages.memoire);
    $('voix-en-ligne').checked = reglages.voixEnLigne;
    $('partage-accueil').checked = partage;
    $('texte-partage-accueil').textContent = textePartage(partage);
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
 * @param {string} texte - Texte brut de la réponse.
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
 * Crée le bouton "Lire à voix haute".
 *
 * @param {HTMLElement} contenu - Réponse affichée à lire.
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonLire(contenu) {
    const bouton = boutonAction(ICONES.lire, 'Lire à voix haute');
    bouton.addEventListener('click', () => {
        if (!Lecture.disponible()) {
            if (Lecture.enLigne) {
                toast('Aucune voix française disponible dans ce navigateur.');
            } else {
                toast('Aucune voix française installée sur cet appareil. Les voix en ligne ne sont pas utilisées.');
            }
            return;
        }
        Lecture.basculer(bouton, contenu);
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
 * Ajoute un message au fil de conversation.
 *
 * @param {string} role - "user" pour une question, "assistant" pour une réponse.
 * @param {string} texte - Texte du message (Markdown pour une réponse).
 * @returns {HTMLLIElement} L'élément ajouté.
 */
function ajouter(role, texte) {
    const li = document.createElement('li');
    li.className = role;
    if (role === 'assistant') {
        const carte = document.createElement('div');
        carte.className = 'carte';
        const contenu = document.createElement('div');
        contenu.className = 'texte rendu';
        Rendu.afficher(contenu, texte);

        const actions = document.createElement('div');
        actions.className = 'actions-reponse';
        actions.append(boutonCopier(texte));
        if (typeof speechSynthesis !== 'undefined') {
            actions.append(boutonLire(contenu));
        }
        carte.append(contenu, actions);
        li.append(pastilleIA(), carte);
    } else {
        const qui = document.createElement('span');
        qui.className = 'visuellement-cache';
        qui.textContent = 'Vous : ';
        li.append(qui, texte);
    }
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
        duree.textContent = Math.round((Date.now() - debut) / 1000) + ' s';
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
    $('toast').textContent = texte;
    $('toast').classList.add('visible');
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
 * @param {string} texte - Message, ou chaîne vide pour effacer.
 * @param {boolean} erreur - true pour l'afficher comme une erreur.
 */
function messageCle(texte, erreur) {
    $('message-cle').textContent = texte;
    $('message-cle').classList.toggle('erreur', erreur);
}

/**
 * Écrit un message dans la ligne d'état sous la saisie.
 *
 * @param {string} texte - Message, ou chaîne vide pour effacer.
 * @param {boolean} [erreur] - true pour l'afficher comme une erreur.
 */
function etat(texte, erreur) {
    $('etat').textContent = texte;
    $('etat').classList.toggle('erreur', !!erreur);
}
