/*
 * kiosque.js
 * Le kiosque autour de l'interface : mode partagé forcé chez l'invité, réglages du prof
 * comme valeurs de départ des élèves, bandeau et déconnexion, retour à
 * /kiosque quand la session se termine. Rien à faire hors kiosque.
 *
 * SERVEUR vient de /serveur.js (serveur/serveur.py) : adresses réseau et
 * session de cette page. Absent hors serveur (tests).
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Repris de L'Atelier d'Albert (kiosque-garde.js, kiosque-niveau.js)
 * Licence : GPL-3.0-or-later
 */
'use strict';

/** Adresses réseau et session de cette page. */
const Serveur = typeof SERVEUR !== 'undefined' ? SERVEUR : { adresses: [], kiosque: null };
const Kiosque = Serveur.kiosque;

/** Réglages que le prof donne à ses élèves comme valeurs de départ. */
const REGLAGES_PARTAGES = ['modele', 'temperature', 'topK', 'echanges', 'recherche', 'calcul', 'tirage', 'calendrier', 'compteur', 'ecritureSoignee', 'styleDirect', 'sansRedite', 'fournisseurs', 'nom'];

/** Nom d'enregistrement quand il diffère du nom dans reglages (reglages.js). */
const NOMS_STOCKES = { topK: 'top-k', ecritureSoignee: 'ecriture-soignee', styleDirect: 'style-direct', sansRedite: 'sans-redite' };

/** Sondage de la session, en millisecondes. */
const SONDAGE_KIOSQUE_MS = 20000;

/**
 * Page où mènent "Quitter la session" et la fin de la session.
 *
 * @param {Object} session - Session de cette page (Serveur.kiosque).
 * @param {boolean} [terminee] - true si la session est finie ou fermée par le prof.
 * @returns {string} L'invité lit un message seul ; le prof retrouve son formulaire.
 */
function adresseDeSortie(session, terminee = false) {
    if (session.role === 'eleve') {
        return terminee ? '/kiosque?terminee' : '/kiosque?quittee';
    }
    return terminee ? '/kiosque?erreur=terminee' : '/kiosque';
}

/**
 * Réglages du prof à envoyer au serveur.
 *
 * @param {Object} r - Réglages de la page (stockage.js).
 * @returns {Object} Les seuls réglages partagés.
 */
function reglagesProf(r) {
    return Object.fromEntries(REGLAGES_PARTAGES.map(nom => [nom, r[nom]]));
}

/**
 * Réglages du prof à recopier chez l'élève.
 *
 * @param {Object} prof - Réglages reçus du serveur.
 * @param {string[]} moteursConnus - Moteurs de recherche de cette page.
 * @returns {Array<Array>} Paires [nom dans reglages, valeur].
 */
function reglagesAppliques(prof, moteursConnus) {
    return REGLAGES_PARTAGES.filter(nom => nom in prof).map(nom => [nom,
        nom === 'fournisseurs' ? prof[nom].filter(m => moteursConnus.includes(m)) : prof[nom]]);
}

/**
 * Réglages du prof à reprendre : tous à l'arrivée, ensuite ceux qu'il a changés.
 *
 * @param {Object} prof - Réglages reçus du serveur.
 * @param {Object|null} avant - Réglages reçus la fois précédente.
 * @returns {Object} Réglages à appliquer, l'élève garde ses choix sur les autres.
 */
function reglagesChanges(prof, avant) {
    if (!avant || avant.session !== prof.session) {
        return prof;
    }
    return Object.fromEntries(Object.entries(prof).filter(([nom, valeur]) =>
        JSON.stringify(valeur) !== JSON.stringify(avant[nom])));
}

/**
 * Valeur telle que stockage.js l'enregistre.
 *
 * @param {*} valeur - Booléen, liste ou nombre.
 * @returns {string} Texte enregistré.
 */
function valeurStockee(valeur) {
    if (typeof valeur === 'boolean') {
        return valeur ? 'oui' : 'non';
    }
    return Array.isArray(valeur) ? valeur.join(',') : String(valeur);
}

/* Sauté sous Node, où le fichier n'est chargé que pour ses tests. */
if (typeof document !== 'undefined' && Kiosque) {
    if (Kiosque.role === 'eleve') {
        /* Poste invité : conversations et bibliothèque restent dans l'onglet. En mémoire
           seulement : les données du prof, en localStorage, restent intactes. Le poste maître garde son choix. */
        partage = true;
        $('partage-reglage').closest('fieldset').hidden = true;
        /* Volet fermé au démarrage (menu.js). Choix rangé dans l'onglet : le volet
           du prof, sur le même navigateur, garde le sien. */
        SENSIBLES.push('volet');
        ecrire('volet', 'replie');
    }

    /* Derniers réglages reçus du prof. */
    let recus = null;
    try {
        recus = JSON.parse(sessionStorage.getItem('albert-go.kiosque-reglages'));
    } catch (err) {
        /* Stockage bloqué : les réglages du prof sont repris à chaque chargement. */
    }

    /* Applique ce que le prof a changé ; true si un réglage a changé. */
    const appliquerReglagesProf = (prof) => {
        const paires = reglagesAppliques(reglagesChanges(prof, recus), Object.keys(Recherche.MOTEURS));
        for (const [nom, valeur] of paires) {
            reglages[nom] = valeur;
            ecrire(NOMS_STOCKES[nom] || nom, valeurStockee(valeur));
        }
        recus = prof;
        try {
            sessionStorage.setItem('albert-go.kiosque-reglages', JSON.stringify(prof));
        } catch (err) {
            /* Stockage bloqué. */
        }
        return paires.length > 0;
    };

    if (Kiosque.role === 'eleve' && Kiosque.reglages) {
        appliquerReglagesProf(Kiosque.reglages);
    }

    if (Kiosque.role === 'enseignant') {
        const envoyer = () => fetch('/api/kiosque-reglages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reglagesProf({ ...reglages, nom: lire('nom', '') }))
        }).catch(() => {});
        envoyer();
        $('reglages').addEventListener('close', envoyer);

        const bandeau = document.createElement('p');
        bandeau.className = 'bandeau-kiosque';
        const partager = document.createElement('button');
        partager.type = 'button';
        partager.className = 'bouton-texte outline';
        partager.textContent = t('menu.partager');
        partager.addEventListener('click', () => ouvrirPartage());
        bandeau.append(t('kiosque.bandeau', { code: Kiosque.code }), partager);
        document.querySelector('.entete').before(bandeau);
    }

    $('deconnexion-kiosque').hidden = false;
    /* fetch et non un formulaire : la CSP de la page interdit l'envoi de formulaires (form-action 'none'). */
    $('deconnexion-kiosque').addEventListener('click', () => {
        fetch('/kiosque', { method: 'POST', body: new URLSearchParams({ action: 'logout' }), redirect: 'manual' })
            .catch(() => {})
            .finally(() => {
                location.href = adresseDeSortie(Kiosque);
            });
    });

    setInterval(() => {
        fetch('/api/kiosque-status').then(r => r.json()).then((statut) => {
            if (!statut.active) {
                location.href = adresseDeSortie(Kiosque, true);
            } else if (statut.reglages && appliquerReglagesProf(statut.reglages)) {
                /* Réglages changés par le prof pendant la session : la page suit. */
                afficherOutils();
                afficherMoteurs();
                afficherRecherche();
                afficherReglages();
                afficherNom();
                $('nom-application').value = lire('nom', '');
            }
        }).catch(() => {
            /* Coupure réseau ponctuelle : on réessaie au tour suivant. */
        });
    }, SONDAGE_KIOSQUE_MS);
}

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = { reglagesProf, reglagesAppliques, reglagesChanges, valeurStockee, adresseDeSortie };
}
