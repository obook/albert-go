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
 * Crée un bouton de copie, par défaut "Copier la réponse".
 *
 * @param {string} texte - Texte brut à copier.
 * @param {string} [libelle] - Libellé du bouton.
 * @param {string} [message] - Toast affiché après la copie.
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonCopier(texte, libelle = t('reponse.copier'), message = t('toast.reponse-copiee')) {
    const bouton = boutonAction(ICONES.copier, libelle);
    bouton.addEventListener('click', () => {
        navigator.clipboard.writeText(texte).then(() => {
            bouton.innerHTML = ICONES.copie;
            toast(message);
            setTimeout(() => {
                bouton.innerHTML = ICONES.copier;
            }, 1500);
        /* Refusée en navigation privée ou hors HTTPS : sans ce toast, rien ne le dit. */
        }).catch(() => toast(t('toast.copie-refusee')));
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
 * @param {Array<Object>} recherches - Recherches { mots, moteur, sources } de cette réponse.
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonRecherches(note, recherches) {
    /* Le moteur de la réponse, pas celui réglé depuis : une conversation
       rouverte doit citer la source qui a servi. Avant, rien ne le notait. */
    const choisi = (recherches.find(r => r && r.moteur) || {}).moteur || reglages.fournisseur;
    /* Le bouton dit où on a cherché : W pour un wiki, globe pour le reste. */
    const moteur = Recherche.MOTEURS[choisi] || Services.TABLE[choisi] || Recherche.MOTEURS.wikipedia;
    const bouton = boutonAction(moteur.wiki ? ICONES.wikipedia : ICONES.globe,
        t('reponse.recherches', { nom: moteur.nom }));
    bouton.setAttribute('aria-expanded', 'false');
    bouton.addEventListener('click', () => {
        note.hidden = !note.hidden;
        bouton.setAttribute('aria-expanded', String(!note.hidden));
    });
    return bouton;
}

/**
 * Crée le bouton qui déplie la trace d'un outil.
 *
 * @param {HTMLElement} note - Ligne grise de la trace, repliée au départ.
 * @param {string} icone - SVG pris dans ICONES.
 * @param {string} libelle - Libellé du bouton.
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonTrace(note, icone, libelle) {
    const bouton = boutonAction(icone, libelle);
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
 * @param {Array<Object>} recherches - Recherches { mots, moteur, sources }.
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
            /* Le numéro est celui cité dans la réponse. Les conversations
               enregistrées avant la numérotation n'en ont pas. */
            lien.textContent = (source.numero ? '[' + source.numero + '] ' : '') + (source.titre || source.url);
            ligne.append(lien);
        }
        note.append(ligne);
    }
    return note;
}

/**
 * Crée la pastille "IA" d'une réponse, lue seulement par les lecteurs d'écran.
 *
 * @returns {HTMLSpanElement} La pastille.
 */
function pastilleIA() {
    const pastille = document.createElement('span');
    pastille.className = 'visuellement-cache';
    pastille.textContent = 'IA';
    return pastille;
}

/**
 * Fait défiler le fil jusqu'à la bulle d'un élément.
 *
 * "nearest" montre le bas de la bulle tant qu'elle tient à l'écran, puis
 * garde son début en haut : "end" cachait le début d'une longue réponse.
 *
 * @param {HTMLElement} element - Élément de la bulle, ou la bulle elle-même.
 */
function suivreBulle(element) {
    element.closest('li')?.scrollIntoView({ block: 'nearest' });
}

/**
 * Dévoile le texte d'une réponse par tranches, puis affiche le rendu.
 *
 * Albert renvoie tout d'un bloc : seul l'affichage est étalé. La coupe
 * suit le temps écoulé, car un onglet en arrière-plan bride setTimeout à
 * une seconde. `aria-busy` évite au lecteur d'écran de relire à chaque pas.
 * Le fil suit la bulle qui grandit, sans jamais cacher son début.
 *
 * @param {HTMLElement} element - Conteneur de la réponse.
 * @param {string} texte - Réponse en Markdown.
 * @param {boolean} images - true si la réponse a cherché des images Commons.
 * @returns {Promise<void>} Terminée après le rendu final.
 */
async function devoiler(element, texte, images) {
    if (texte.length < 40 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return Rendu.afficher(element, texte, images);
    }
    element.setAttribute('aria-busy', 'true');
    let part = 0, debut = performance.now();
    while (part < 1) {
        element.textContent = texte.slice(0, Math.ceil(texte.length * part));
        suivreBulle(element);
        await new Promise(resoudre => setTimeout(resoudre, INTERVALLE_DEVOILEMENT));
        part = (performance.now() - debut) / DUREE_DEVOILEMENT;
    }
    await Rendu.afficher(element, texte, images);
    suivreBulle(element);
    element.removeAttribute('aria-busy');
}

/**
 * Crée la bulle d'une réponse, ou d'une variante si un titre est donné.
 *
 * @param {string} texte - Texte en Markdown.
 * @param {?string} titre - Titre de la variante ("Plus courte"...), ou null.
 * @param {string} langue - Code de la langue, pour la lecture à voix haute.
 * @param {boolean} [animer] - true pour dévoiler le texte au lieu de l'afficher d'un coup.
 * @param {Array<Object>} [recherches] - Recherches { mots, moteur, sources } faites pour cette réponse.
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
    /* Images Commons montrées seulement si l'outil d'images a servi à cette réponse. */
    const imagesCherchees = (recherches || []).some(r => r && r.image_commons);
    if (animer) {
        devoiler(contenu, texte, imagesCherchees);
    } else {
        Rendu.afficher(contenu, texte, imagesCherchees);
    }

    const actions = document.createElement('div');
    actions.className = 'actions-reponse';
    actions.append(boutonCopier(texte));
    if (typeof speechSynthesis !== 'undefined') {
        actions.append(boutonLire(contenu, langue));
    }
    carte.append(contenu);
    /* Une icône par outil local qui a servi. */
    for (const [nom, local] of Object.entries(OUTILS_LOCAUX)) {
        const lignes = (recherches || []).filter(r => r && r[nom]).map(r => r[nom]);
        if (lignes.length) {
            const note = document.createElement('p');
            note.className = 'note calculs';
            note.textContent = t('reponse.note-' + nom, { lignes: lignes.join(' ; ') });
            note.hidden = true;
            carte.append(note);
            actions.append(boutonTrace(note, ICONES[local.icone], t('reponse.' + nom)));
        }
    }
    const images = (recherches || []).filter(r => r && r.image_commons).map(r => r.image_commons);
    if (images.length) {
        const note = document.createElement('p');
        note.className = 'note calculs';
        note.textContent = t('reponse.note-images', { lignes: images.join(' ; ') });
        note.hidden = true;
        carte.append(note);
        actions.append(boutonTrace(note, ICONES.image, t('reponse.images')));
    }
    const cherchees = (recherches || []).filter(r => r && !r.image_commons && !Object.keys(OUTILS_LOCAUX).some(nom => r[nom]));
    if (cherchees.length) {
        const note = elementRecherches(cherchees);
        note.hidden = true;
        carte.append(note);
        actions.append(boutonRecherches(note, cherchees));
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
 * @param {Array<Object>} [recherches] - Recherches { mots, moteur, sources } faites pour cette réponse.
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
        suivreBulle(li);
        return li;
    }
    const bulles = variantes.map(v => bulleReponse(v.texte, v.titre, langue, animer));
    $('fil').append(...bulles);
    /* Montrer le début de la première variante, pas la fin de la dernière. */
    bulles[0].scrollIntoView({ block: 'start' });
    return bulles[0];
}
