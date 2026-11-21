/*
 * bibliotheque/pause.js
 * Bouton de la bibliothèque dans la barre de saisie de Discussion, à côté du globe.
 *
 * En pause, les cases restent cochées mais aucune source ne part avec les questions :
 * demanderReponse et recevoirReponse (app.js), puis le résumé du volet (projet.js),
 * lisent sourcesEnvoyees() au lieu de documentsProjet. Imprimerie travaille à partir
 * des sources : le bouton n'y est pas et la pause n'y vaut pas.
 *
 * Chargé avant projet.js, qui l'appelle depuis afficherResumeSources.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

/** Pause demandée par le bouton, gardée d'une question et d'un rechargement à l'autre. */
let bibliothequeEnPause = lire('bibliotheque-pause', 'non') === 'oui';

/**
 * Nom d'une source dans une citation, le toast ou le bouton : sans extension ni numéro
 * de téléchargement, coupé à 30 caractères. Le nom entier se lit dans la colonne.
 *
 * @param {string} nom - Nom de la source.
 * @returns {string} Nom court.
 */
function nomCourt(nom) {
    const court = nom.replace(/\.\w{2,4}$/, '').replace(/[-_]\d{5,}$/, '');
    return court.length > 30 ? court.slice(0, 30).trimEnd() + '...' : court;
}

/**
 * Sources cochées, en noms courts : trois au plus, puis "et 3 autres".
 *
 * @returns {string} Les noms, séparés par des virgules.
 */
function nomsCoches() {
    const noms = documentsProjet.map(d => nomCourt(d.nom));
    if (noms.length <= 3) {
        return noms.join(', ');
    }
    return t('bibliotheque.et-autres', { noms: noms.slice(0, 2).join(', '), nombre: noms.length - 2 });
}

/**
 * Dit si la pause s'applique au module : partout sauf Imprimerie.
 *
 * @param {string} outil - Clé de Albert.OUTILS.
 * @returns {boolean} true si aucune source ne part.
 */
function pauseEffective(outil) {
    return bibliothequeEnPause && !Albert.OUTILS[outil].documents;
}

/**
 * Sources qui partent avec la question : les cochées, ou aucune en pause.
 *
 * @param {string} [outil] - Clé de Albert.OUTILS, le module affiché par défaut.
 * @returns {Object[]} Fichiers de la bibliothèque à envoyer.
 */
function sourcesEnvoyees(outil = outilActuel) {
    if (pauseEffective(outil)) {
        return [];
    }
    return documentsProjet;
}

/**
 * Enregistre la pause et met le bouton, le volet et le résumé à jour.
 *
 * @param {boolean} enPause - Nouvel état.
 */
function mettreEnPause(enPause) {
    bibliothequeEnPause = enPause;
    ecrire('bibliotheque-pause', enPause ? 'oui' : 'non');
    afficherResumeSources();
}

/* Retiré le 21/11/2026 : seul le bouton réactive la bibliothèque, cocher sert à préparer son travail.
function reprendreBibliotheque() {
    bibliothequeEnPause = false;
    ecrire('bibliotheque-pause', 'non');
}
*/

/** Bouton de la barre de saisie et liste du volet, d'après la pause et les sources cochées. */
function afficherPause() {
    /* Premier appel avant modules.js, qui déclare outilActuel. */
    const outil = typeof outilActuel === 'undefined' ? 'discuter' : outilActuel;
    const bouton = $('bibliotheque-saisie');
    const nombre = documentsProjet.length;
    const enPause = pauseEffective(outil);
    bouton.hidden = !Albert.OUTILS[outil].sources || !!Albert.OUTILS[outil].documents;
    /* Sans source cochée, rien à mettre en pause : le bouton ouvre la bibliothèque. */
    let libelle = t('bibliotheque.ouvrir');
    if (nombre === 0) {
        bouton.removeAttribute('aria-pressed');
    } else {
        bouton.setAttribute('aria-pressed', String(!enPause));
        libelle = t('saisie.bibliotheque', { noms: nomsCoches() });
    }
    bouton.setAttribute('aria-label', libelle);
    bouton.title = libelle;
    /* Le nombre montre ce qui partira avec la question. */
    bouton.querySelector('.nombre-sources').textContent = nombre && !enPause ? String(nombre) : '';
    $('groupe-sources').classList.toggle('en-pause', enPause);
    $('bibliotheque-pause').hidden = !enPause;
}

$('bibliotheque-saisie').addEventListener('click', () => {
    if (!documentsProjet.length) {
        $('ouvrir-bibliotheque').click();
        return;
    }
    mettreEnPause(!bibliothequeEnPause);
    const texte = bibliothequeEnPause ? t('toast.bibliotheque-desactivee')
        : t('toast.bibliotheque-activee', { noms: nomsCoches() });
    /* "Voir" ouvre la colonne, où se lit la liste complète ; déjà ouverte, elle le reste. */
    toast(texte, false, {
        libelle: t('toast.voir'),
        faire: () => {
            if (!$('bibliotheque').open) {
                $('ouvrir-bibliotheque').click();
            }
        }
    });
});
