/*
 * socle/chargement.js
 * Dernier script écrit dans index.html : place le HTML de pages/, puis
 * charge les scripts de l'interface, dans l'ordre.
 *
 * index.html garde l'en-tête de la page et des emplacements
 * <div data-page="menu/volet"></div>. Chaque emplacement est remplacé par
 * le fichier pages/menu/volet.html ; un morceau peut contenir d'autres
 * emplacements (la boîte Réglages et ses cartes).
 *
 * Les scripts cherchent leurs éléments dès leur exécution : ils ne partent
 * qu'une fois tout le HTML en place. Pas de preload : WebKit garde l'échec
 * d'un script préchargé et le rechargement de theme.js ne réparait plus rien.
 * À la fin, <html data-pret> signale aux tests que la page est prête.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

/* Version des fichiers, lue dans l'adresse de ce script : ?v=<commit> à la publication. */
const VERSION_FICHIERS = new URL(document.currentScript.src).searchParams.get('v') || 'dev';

/* Scripts de l'interface, dans l'ordre d'exécution. L'ordre compte. */
const SCRIPTS = [
    'vendor/marked/marked.umd.js',
    'vendor/katex/katex.min.js',
    'vendor/katex/contrib/mhchem.min.js',
    'vendor/katex/auto-render.min.js',
    'vendor/qrcode-generator/qrcode.js',
    'js/rendu/rendu.js',
    'js/rendu/diagrammes.js',
    'js/rendu/courbes.js',
    'js/rendu/images.js',
    'js/rendu/export.js',
    'js/rendu/docx.js',
    'js/rendu/odt.js',
    'js/conversation/lecture.js',
    'js/socle/version.js',
    'js/albert.js',
    'js/albert/bibliotheque.js',
    'js/albert/courrier.js',
    'js/albert/empreinte.js',
    'js/albert/fichiers.js',
    'js/albert/historique.js',
    'js/albert/modeles.js',
    'js/albert/passages.js',
    'js/albert/reponses.js',
    /* Avant stockage.js : le réglage cx part de Recherche.CX. */
    'js/tools/calcul/calcul.js',
    'js/tools/recherche/recherche.js',
    'js/tools/recherche/commons.js',
    'js/tools/recherche/extraits.js',
    'js/tools/services/services.js',
    'js/tools/recherche/outils-modele.js',
    'js/socle/stockage.js',
    'js/bibliotheque/projet.js',
    'js/interface/affichage.js',
    /* Avant reglages.js : les réglages du prof sont recopiés avant que la boîte Réglages soit remplie. */
    'js/kiosque/kiosque.js',
    'js/conversation/reponse.js',
    'js/interface/reglages.js',
    'js/conversation/historique.js',
    'js/modules/modules.js',
    'js/modules/redaction.js',
    'js/interface/menu.js',
    'js/bibliotheque/piece-jointe.js',
    'js/interface/cle.js',
    'js/conversation/app.js',
];

/* Morceaux de pages/, tous demandés dès le départ : les cartes de Réglages n'attendent pas
   la boîte qui les contient. Un morceau oublié ici est demandé quand même, plus tard. */
const MORCEAUX = [
    'menu/volet',
    'menu/confirmer-suppression',
    'menu/partage',
    'menu/a-propos',
    'menu/empreinte',
    'bibliotheque/volet',
    'bibliotheque/aide',
    'bibliotheque/coller',
    'bibliotheque/guide',
    'conversation/accueil',
    'conversation/chat',
    'conversation/redaction',
    'conversation/saisie',
    'reglages/boite',
    'reglages/ia',
    'reglages/competences',
    'reglages/outils',
    'reglages/application',
    'cle/saisie',
    'cle/bienvenue',
    'cle/confirmer',
    'cle/absente',
];

/* Texte de chaque morceau déjà demandé : nom -> promesse du texte. */
const demandes = new Map();

/**
 * Adresse d'un fichier de la page, avec la version.
 *
 * @param {string} chemin - Chemin depuis public/.
 * @returns {string} Chemin suivi de ?v=<version>.
 */
function adresseFichier(chemin) {
    return chemin + '?v=' + VERSION_FICHIERS;
}

/**
 * Demande un morceau de pages/, une seule fois.
 *
 * @param {string} nom - Nom du morceau, par exemple "reglages/ia".
 * @returns {Promise<string>} Texte HTML du morceau.
 */
function demanderMorceau(nom) {
    if (!demandes.has(nom)) {
        const chemin = 'pages/' + nom + '.html';
        const texte = fetch(adresseFichier(chemin)).then((reponse) => {
            if (!reponse.ok) {
                throw new Error(chemin + ' : ' + reponse.status);
            }
            return reponse.text();
        });
        /* Échec lu plus tard par placerMorceaux : pas d'alerte "promesse rejetée" en attendant. */
        texte.catch(() => {});
        demandes.set(nom, texte);
    }
    return demandes.get(nom);
}

/**
 * Remplace chaque emplacement par son morceau de pages/, puis les emplacements de ce morceau.
 *
 * @param {ParentNode} racine - Page ou morceau où chercher les emplacements.
 * @returns {Promise<void>} Résolue quand tous les morceaux sont en place.
 */
async function placerMorceaux(racine) {
    const emplacements = [...racine.querySelectorAll('[data-page]')];
    await Promise.all(emplacements.map(async (emplacement) => {
        const texte = await demanderMorceau(emplacement.dataset.page);
        /* Contexte <body> : le HTML est lu comme s'il était écrit dans la page. */
        const plage = document.createRange();
        plage.selectNodeContents(document.body);
        const morceau = plage.createContextualFragment(texte);
        await placerMorceaux(morceau);
        emplacement.replaceWith(morceau);
    }));
}

/**
 * Ajoute les scripts à la page. async à false : chacun s'exécute après le précédent.
 * data-lancement : un script perdu fait recharger la page (theme.js).
 */
function chargerScripts() {
    for (const chemin of SCRIPTS) {
        const script = document.createElement('script');
        script.src = adresseFichier(chemin);
        script.async = false;
        script.dataset.lancement = '';
        document.body.append(script);
    }
    document.body.lastElementChild.addEventListener('load', () => {
        document.documentElement.dataset.pret = '';
    });
}

for (const nom of MORCEAUX) {
    demanderMorceau(nom);
}
placerMorceaux(document.body).then(chargerScripts, (err) => {
    console.error(err);
    rechargerUneFois();
});
