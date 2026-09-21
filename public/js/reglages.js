/*
 * reglages.js
 * Boîte de réglages : modèle, température, contexte, voix, mode partagé,
 * bouton "Réglages conseillés".
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
 * Charge la liste réelle des modèles au démarrage.
 *
 * Clé refusée (révoquée, expirée) : elle est effacée et l'écran de la clé
 * revient. Relais injoignable : la liste de secours reste.
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
    } catch (err) {
        if (err.status === 401 || err.status === 403) {
            reglages.cle = null;
            ecrire('cle', null);
            afficher();
            messageCle(err.message, true);
        }
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

$('recherche-reglage').checked = reglages.recherche;
$('fournisseur-recherche').value = reglages.fournisseur;
$('cle-recherche').value = reglages.cleRecherche || '';
/* Wikipédia ne demande ni clé ni identifiant de moteur. */
function afficherCles() {
    $('cles-recherche').hidden = reglages.fournisseur === 'wikipedia';
}
afficherCles();
/* Le moteur choisi par l'utilisateur remplace celui du code. */
$('cx-recherche').value = reglages.cx;
Recherche.CX = reglages.cx;

$('cx-recherche').addEventListener('change', () => {
    reglages.cx = $('cx-recherche').value.trim() || Recherche.CX;
    Recherche.CX = reglages.cx;
    $('cx-recherche').value = reglages.cx;
    ecrire('cx', reglages.cx);
});

$('recherche-reglage').addEventListener('change', () => {
    reglages.recherche = $('recherche-reglage').checked;
    ecrire('recherche', reglages.recherche ? 'oui' : 'non');
});

/* Chaque moteur a sa clé : on efface celle de l'autre en changeant. */
$('fournisseur-recherche').addEventListener('change', () => {
    reglages.fournisseur = $('fournisseur-recherche').value;
    reglages.cleRecherche = null;
    $('cle-recherche').value = '';
    ecrire('fournisseur', reglages.fournisseur);
    ecrire('cle-recherche', null);
    afficherCles();
});

$('cle-recherche').addEventListener('change', () => {
    reglages.cleRecherche = $('cle-recherche').value.trim() || null;
    ecrire('cle-recherche', reglages.cleRecherche);
});

$('partage-reglage').addEventListener('change', () => {
    changerPartage($('partage-reglage').checked);
    afficherReglages();
});

$('reglages-conseilles').addEventListener('click', () => {
    reglages.modele = Albert.CONSEILLES.modele;
    reglages.temperature = Albert.CONSEILLES.temperature;
    reglages.memoire = Albert.CONSEILLES.memoire;
    ecrire('modele', reglages.modele);
    ecrire('temperature', String(reglages.temperature));
    ecrire('memoire', reglages.memoire ? 'oui' : 'non');
    afficherReglages();
});

$('ouvrir-reglages').addEventListener('click', () => {
    $('reglages').showModal();
});

$('resume-reglages').addEventListener('click', () => {
    $('reglages').showModal();
});
