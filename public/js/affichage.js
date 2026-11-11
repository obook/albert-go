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
 * Licence : GPL-3.0-or-later
 */
'use strict';

/* Icônes fixes, jamais du texte du modèle : innerHTML est sans risque ici. */
const ICONES = {
    copier: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
    copie: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    /* Format du fichier en lettres : deux flèches de téléchargement se confondraient. */
    svg: '<svg class="lettre" viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" textLength="23" lengthAdjust="spacingAndGlyphs">SVG</text></svg>',
    png: '<svg class="lettre" viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" textLength="23" lengthAdjust="spacingAndGlyphs">PNG</text></svg>',
    /* La réponse en fichier : une page au coin plié, avec l'initiale du format (W pour Word, O pour OpenDocument). */
    docx: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h9l5 5v15H5Z"/><path d="M14 2v5h5"/><text x="12" y="19" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor" stroke="none">W</text></svg>',
    odt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h9l5 5v15H5Z"/><path d="M14 2v5h5"/><text x="12" y="19" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor" stroke="none">O</text></svg>',
    pdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h9l5 5v15H5Z"/><path d="M14 2v5h5"/><text x="12" y="19" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none">PDF</text></svg>',
    /* Même icône que le bouton de la bibliothèque, dans l'en-tête. */
    /* bookmark-plus de Lucide : l'icône de la bibliothèque marque déjà les sources d'une réponse. */
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z"/><path d="M12 7v6M9 10h6"/></svg>',
    bibliotheque: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16M10 4v16M15 5l4 15M3 20h18"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 18l5-5 4 4 3-3 4 4"/></svg>',
    telecharger: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    lire: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    /* Lucide : pencil, rotate-ccw, chevron-left, chevron-right. */
    modifier: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5Z"/><path d="m15 5 4 4"/></svg>',
    regenerer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    precedente: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    suivante: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    revoir: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M8.5 11l1.8 1.8 3.2-3.3"/></svg>',
    arreter: '<svg class="plein" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
    calculatrice: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/>'
        + '<path d="M8 7h8M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/></svg>',
    calendrier: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/>'
        + '<path d="M4 10h16M8 3v4M16 3v4"/></svg>',
    compteur: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4 8 20M16 4l-2 16M4.5 9h15M4 15h15"/></svg>',
    /* Bouclier coché : clé de contrôle d'un SIRET ou d'un IBAN. */
    controle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z"/>'
        + '<path d="M9 12l2 2 4-4"/></svg>',
    de: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/>'
        + '<path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/></svg>',
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

/** Minuteur qui masque le toast. */
let minuteurToast = null;

/**
 * Affiche l'écran de la clé ou celui de la conversation.
 */
function afficher() {
    const connecte = Albert.pret();
    $('accueil').hidden = connecte;
    const redaction = outilActuel === 'rediger';
    $('chat').hidden = !connecte || redaction;
    $('saisie-zone').hidden = !connecte || redaction;
    $('redaction').hidden = !connecte || !redaction;
    for (const id of ['ouvrir-reglages', 'nouvelle', 'resume-reglages', 'trait-outils', 'menu-outils', 'menu-projets', 'trait-historique', 'menu-historique', 'titre-entete']) {
        $(id).hidden = !connecte;
    }
    /* Clé de l'utilisateur : en ligne seulement. */
    for (const id of ['trait-cle', 'changer-cle', 'note-cle']) {
        $(id).hidden = !Albert.cle;
    }
    if (connecte) {
        if ($('dialogue-cle').open) {
            $('dialogue-cle').close();
        }
        focusSaisie();
    } else {
        /* Écran de la clé : effacement à la fermeture toujours proposé par défaut. */
        $('partage-accueil').checked = false;
    }
    /* Sans clé, ni volet ni bouton de bibliothèque. */
    placerBibliotheque();
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
 * Texte de l'interrupteur de conservation : activé, clé et conversations restent après la fermeture.
 *
 * @param {boolean} actif - Interrupteur activé.
 * @returns {string} Texte à afficher.
 */
function textePartage(actif) {
    return Albert.texte(actif ? 'partage.actif' : 'partage.inactif');
}

/**
 * Met à jour les réglages affichés, le résumé du menu et la jauge.
 */
function afficherReglages() {
    const modele = modeleActuel();
    /* Consommation de la dernière réponse, gardée avec la conversation. */
    const derniere = conversation.findLast(m => m.usage);
    const pourcent = Albert.occupation(derniere && derniere.usage, modele.contexte);

    let contexte = t('contexte.sans');
    if (reglages.echanges >= Albert.ECHANGES_TOUS) {
        contexte = pourcent === null ? t('contexte.complet') : t('contexte.pourcent', { pourcent: pourcent });
    } else if (reglages.echanges > 0) {
        contexte = tn('contexte.echanges', reglages.echanges, { n: reglages.echanges });
    }
    /* Virgule décimale en français, point en anglais. */
    const temperature = reglages.temperature.toLocaleString(I18n.langue, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    $('resume-reglages').textContent = t('reglages.resume',
        { modele: modele.nom, temperature: temperature, contexte: contexte });
    /* Jauge de contexte mise de côté, à revoir (avec index.html).
    $('jauge-niveau').style.width = (pourcent || 0) + '%';
    $('jauge-niveau').classList.toggle('pleine', pourcent !== null && pourcent >= 80);
    */

    $('echanges').value = reglages.echanges;
    $('aide-echanges').textContent = t(Albert.cleAideEchanges(reglages.echanges), { n: reglages.echanges });
    $('voix-en-ligne').checked = reglages.voixEnLigne;
    $('idees').checked = reglages.idees;
    document.querySelector('.bienvenue').hidden = !reglages.idees;
    for (const [nom, competence] of Object.entries(COMPETENCES)) {
        $(competence.cle).checked = reglages[nom];
    }
    $('partage-reglage').checked = !partage;
    $('texte-partage-reglage').textContent = textePartage(!partage);
    $('temperature').value = reglages.temperature;
    $('valeur-temperature').textContent = temperature;
    $('aide-temperature').textContent = t(reglages.temperature > 1 ? 'reglages.aide-temperature-haute' : 'reglages.aide-temperature');
    $('top-k').value = reglages.topK;
    $('aide-top-k').textContent = t(Albert.cleAideTopK(reglages.topK), { k: reglages.topK });
    $('modele-choisi').replaceChildren(logo(Albert.logoEditeur(modele.reel)), modele.nom + ' (' + modele.id + ')');
    const radio = [...document.querySelectorAll('input[name="modele"]')].find(r => r.value === modele.id);
    if (radio) {
        radio.checked = true;
    }
    /* La part des documents dépend du contexte du modèle. */
    afficherDocuments();
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
 * Logo décoratif d'un modèle ou d'un moteur : le nom suit juste après.
 *
 * @param {string} src - Chemin de l'image.
 * @returns {HTMLImageElement} L'image.
 */
function logo(src) {
    const image = document.createElement('img');
    image.className = 'logo';
    image.src = src;
    image.alt = '';
    return image;
}

/**
 * Affiche l'attente d'une réponse : trois points, secondes écoulées et,
 * passé 20 puis 60 s, un message annoncé aux lecteurs d'écran.
 *
 * @param {string} [demande] - Texte de la demande, à rappeler là où sa bulle n'est pas affichée (Imprimerie).
 * @returns {Function} Fonction qui retire l'attente.
 */
function ajouterAttente(demande = '') {
    const li = document.createElement('li');
    /* en-attente : dans Projet, le document reste affiché tant que la suite n'est pas arrivée (conversation.css). */
    li.className = 'assistant en-attente';
    const attente = document.createElement('div');
    attente.className = 'carte attente';
    const points = document.createElement('span');
    points.className = 'points';
    points.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
    const duree = document.createElement('span');
    duree.className = 'duree';
    /* Écrit dès le début : la carte grandissait à la première seconde, sous la saisie. */
    duree.textContent = t('duree', { secondes: 0 });
    const palier = document.createElement('span');
    palier.className = 'palier';
    palier.setAttribute('aria-live', 'polite');
    const pastille = pastilleIA();
    [pastille, points, duree].forEach(e => e.setAttribute('aria-hidden', 'true'));
    attente.append(points, palier, duree);
    if (demande) {
        /* Après les points, sur une seule ligne : le reste est coupé (conversation.css). */
        const rappel = document.createElement('span');
        rappel.className = 'demande';
        rappel.textContent = demande;
        points.after(rappel);
    }
    li.append(pastille, attente);
    $('fil').append(li);
    li.scrollIntoView({ block: 'end' });

    const debut = Date.now();
    const minuteur = setInterval(() => {
        const secondes = Math.round((Date.now() - debut) / 1000);
        duree.textContent = t('duree', { secondes });
        const message = secondes >= 60 ? t('attente.longue') : secondes >= 20 ? t('attente.lente') : '';
        /* Réécrire le même texte chaque seconde ferait répéter le lecteur d'écran. */
        if (palier.textContent !== message) {
            palier.textContent = message;
        }
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
 * @param {boolean} [jusquAuSuivant] - Garder le message jusqu'au prochain toast.
 */
function toast(texte, jusquAuSuivant) {
    const boite = $('toast');
    /* Rouvert dans la couche du dessus : sinon une boîte modale et son fond flou le couvrent. */
    boite.togglePopover?.(false);
    boite.togglePopover?.(true);
    boite.textContent = texte;
    boite.classList.add('visible');
    clearTimeout(minuteurToast);
    if (jusquAuSuivant) {
        return;
    }
    /* Un message long reste plus longtemps. */
    const duree = Math.max(2000, texte.length * 60);
    minuteurToast = setTimeout(() => {
        $('toast').classList.remove('visible');
    }, duree);
}

/**
 * Rend à un curseur sa valeur quand le contact du doigt devient un défilement.
 *
 * Chrome déplace le curseur dès le contact, avant de savoir ce que sera le geste.
 *
 * @param {HTMLInputElement} curseur - Curseur à protéger.
 */
function annulerAuDefilement(curseur) {
    let avant = curseur.value;
    curseur.addEventListener('pointerdown', () => {
        avant = curseur.value;
    });
    curseur.addEventListener('pointercancel', () => {
        curseur.value = avant;
        /* Pour que l'écouteur du curseur enregistre la valeur revenue. */
        curseur.dispatchEvent(new Event('input'));
    });
}

/**
 * Écrit un message sous le champ de la clé.
 *
 * Le lien est ajouté à la fin, sous le nom "Albert Go", suivi du point final.
 *
 * @param {string} texte - Message ou chaîne vide pour effacer.
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
 * @param {string} texte - Message ou chaîne vide pour effacer.
 * @param {boolean} [erreur] - true pour l'afficher comme une erreur.
 * @param {boolean} [succes] - true pour l'afficher en vert.
 */
function etat(texte, erreur, succes) {
    const ligne = $('etat');
    ligne.textContent = texte;
    ligne.classList.toggle('erreur', !!erreur);
    ligne.classList.toggle('succes', !!succes);
}
