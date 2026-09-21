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

/* Dévoilement d'une réponse : durée totale et intervalle entre deux tranches. */
const DUREE_DEVOILEMENT = 600, INTERVALLE_DEVOILEMENT = 25;

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
    const bouton = boutonAction(ICONES.copier, t('reponse.copier'));
    bouton.addEventListener('click', () => {
        navigator.clipboard.writeText(texte).then(() => {
            bouton.innerHTML = ICONES.copie;
            toast(t('toast.reponse-copiee'));
            setTimeout(() => {
                bouton.innerHTML = ICONES.copier;
            }, 1500);
        });
    });
    return bouton;
}

/**
 * Crée le bouton qui montre les recherches faites pour une réponse.
 *
 * Sa seule présence dit que le modèle a cherché : sans lui, il a répondu
 * de mémoire. Le clic déplie les mots cherchés et les pages consultées.
 *
 * @param {HTMLElement} note - Ligne grise des recherches, repliée au départ.
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonRecherches(note) {
    /* Le bouton dit où on a cherché : W pour Wikipédia, globe pour le web. */
    const wiki = reglages.fournisseur === 'wikipedia';
    const bouton = boutonAction(wiki ? ICONES.wikipedia : ICONES.globe,
        t(wiki ? 'reponse.recherches-wikipedia' : 'reponse.recherches'));
    bouton.setAttribute('aria-expanded', 'false');
    bouton.addEventListener('click', () => {
        note.hidden = !note.hidden;
        bouton.setAttribute('aria-expanded', String(!note.hidden));
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
    return I18n.existe('langue.' + code) ? t('langue.' + code).toLowerCase() : code;
}

/**
 * Crée le bouton "Lire à voix haute".
 *
 * @param {HTMLElement} contenu - Réponse affichée à lire.
 * @param {string} langue - Code de la langue de la réponse ("fr", "ru"...).
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonLire(contenu, langue) {
    const bouton = boutonAction(ICONES.lire, t('reponse.lire'));
    bouton.addEventListener('click', async () => {
        await Lecture.voixPretes();
        if (!Lecture.disponible(langue)) {
            const nom = nomLangue(langue);
            toast(t(Lecture.enLigne ? 'toast.voix-absente-en-ligne' : 'toast.voix-absente', { langue: nom }));
            return;
        }
        Lecture.basculer(bouton, contenu, langue);
    });
    bouton.addEventListener('lecture-debut', () => {
        bouton.innerHTML = ICONES.arreter;
        bouton.setAttribute('aria-label', t('reponse.arreter-lecture'));
    });
    bouton.addEventListener('lecture-fin', () => {
        bouton.innerHTML = ICONES.lire;
        bouton.setAttribute('aria-label', t('reponse.lire'));
    });
    return bouton;
}

/**
 * Crée la ligne grise placée sous une réponse : mots cherchés, puis sources.
 *
 * Les adresses viennent du moteur, donc d'un tiers : elles passent par le même
 * contrôle que les liens d'une réponse avant de devenir cliquables.
 *
 * @param {Array<Object>} recherches - Recherches { mots, sources }.
 * @returns {HTMLParagraphElement} La ligne.
 */
function elementRecherches(recherches) {
    /* Les conversations enregistrées avant les sources n'ont que les mots. */
    const faites = recherches.map(r => (typeof r === 'string' ? { mots: r, sources: [] } : r));
    const note = document.createElement('p');
    note.className = 'note recherches';
    note.textContent = t('reponse.note-recherche', { mots: faites.map(r => r.mots).join(' ; ') });
    const sources = [];
    for (const recherche of faites) {
        for (const source of (recherche.sources || [])) {
            /* Deux recherches ramènent souvent la même page. */
            if (!Rendu.urlDangereuse('href', source.url) && !sources.some(s => s.url === source.url)) {
                sources.push(source);
            }
        }
    }
    if (sources.length) {
        const ligne = document.createElement('span');
        ligne.className = 'sources';
        ligne.append(t('reponse.sources'));
        for (const source of sources) {
            const lien = document.createElement('a');
            lien.href = source.url;
            lien.target = '_blank';
            lien.rel = 'noopener noreferrer';
            lien.textContent = source.titre || source.url;
            ligne.append(lien);
        }
        note.append(ligne);
    }
    return note;
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
 * Dévoile le texte d'une réponse par tranches, puis affiche le rendu.
 *
 * Albert renvoie tout d'un bloc : seul l'affichage est étalé. La coupe
 * suit le temps écoulé, car un onglet en arrière-plan bride setTimeout à
 * une seconde. `aria-busy` évite au lecteur d'écran de relire à chaque pas.
 *
 * @param {HTMLElement} element - Conteneur de la réponse.
 * @param {string} texte - Réponse en Markdown.
 * @returns {Promise<void>} Terminée après le rendu final.
 */
async function devoiler(element, texte) {
    if (texte.length < 40 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return Rendu.afficher(element, texte);
    }
    element.setAttribute('aria-busy', 'true');
    let part = 0, debut = performance.now();
    while (part < 1) {
        element.textContent = texte.slice(0, Math.ceil(texte.length * part));
        await new Promise(resoudre => setTimeout(resoudre, INTERVALLE_DEVOILEMENT));
        part = (performance.now() - debut) / DUREE_DEVOILEMENT;
    }
    await Rendu.afficher(element, texte);
    element.removeAttribute('aria-busy');
}

/**
 * Crée la bulle d'une réponse, ou d'une variante si un titre est donné.
 *
 * @param {string} texte - Texte en Markdown.
 * @param {?string} titre - Titre de la variante ("Plus courte"...), ou null.
 * @param {string} langue - Code de la langue, pour la lecture à voix haute.
 * @param {boolean} [animer] - true pour dévoiler le texte au lieu de l'afficher d'un coup.
 * @param {Array<Object>} [recherches] - Recherches { mots, sources } faites pour cette réponse.
 * @returns {HTMLLIElement} La bulle, pas encore ajoutée au fil.
 */
function bulleReponse(texte, titre, langue, animer = false, recherches = null) {
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
    if (animer) {
        devoiler(contenu, texte);
    } else {
        Rendu.afficher(contenu, texte);
    }

    const actions = document.createElement('div');
    actions.className = 'actions-reponse';
    actions.append(boutonCopier(texte));
    if (typeof speechSynthesis !== 'undefined') {
        actions.append(boutonLire(contenu, langue));
    }
    carte.append(contenu);
    if (recherches && recherches.length) {
        const note = elementRecherches(recherches);
        note.hidden = true;
        carte.append(note);
        actions.append(boutonRecherches(note));
    }
    carte.append(actions);
    li.append(pastilleIA(), carte);
    return li;
}

/**
 * Ajoute une réponse au fil : une bulle, ou une par variante avec Reformuler.
 *
 * @param {string} texte - Réponse du modèle.
 * @param {string} [langue] - Code de la langue de la réponse ; français par défaut.
 * @param {boolean} [animer] - true pour une réponse qui vient d'arriver ; false à la relecture.
 * @param {Array<Object>} [recherches] - Recherches { mots, sources } faites pour cette réponse.
 * @returns {HTMLLIElement} La première bulle ajoutée.
 */
function ajouterReponse(texte, langue = 'fr', animer = false, recherches = null) {
    let variantes = null;
    if (outilActuel === 'reformuler') {
        variantes = Albert.decouperVariantes(texte);
    }
    if (!variantes) {
        const li = bulleReponse(texte, null, langue, animer, recherches);
        $('fil').append(li);
        li.scrollIntoView({ block: 'end' });
        return li;
    }
    const bulles = variantes.map(v => bulleReponse(v.texte, v.titre, langue, animer));
    $('fil').append(...bulles);
    /* Montrer le début de la première variante, pas la fin de la dernière. */
    bulles[0].scrollIntoView({ block: 'start' });
    return bulles[0];
}
