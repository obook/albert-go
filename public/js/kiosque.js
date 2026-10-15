/*
 * kiosque.js
 * Le kiosque autour de l'interface : mode partagé forcé, réglages du prof
 * comme valeurs de départ des élèves, bandeau et déconnexion, retour à
 * /kiosque quand la session se termine. Rien à faire hors kiosque.
 *
 * SERVEUR vient de /serveur.js (serveur/serveur.py) : adresses réseau et
 * session de cette page. Absent hors serveur (tests).
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Repris de L'Atelier d'Albert (kiosque-garde.js, kiosque-niveau.js)
 * Licence : GPL-3.0-or-later
 */
'use strict';

/** Adresses réseau et session de cette page. */
const Serveur = typeof SERVEUR !== 'undefined' ? SERVEUR : { adresses: [], kiosque: null };
const Kiosque = Serveur.kiosque;

/** Réglages que le prof donne à ses élèves comme valeurs de départ. */
const REGLAGES_PARTAGES = ['modele', 'temperature', 'topK', 'echanges', 'recherche', 'calcul', 'tirage', 'calendrier', 'compteur', 'fournisseurs'];

/** Nom d'enregistrement quand il diffère du nom dans reglages (reglages.js). */
const NOMS_STOCKES = { topK: 'top-k' };

/** Sondage de la session, en millisecondes. */
const SONDAGE_KIOSQUE_MS = 20000;

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
    /* Poste partagé : conversations et bibliothèque restent dans l'onglet. En mémoire
       seulement : les données personnelles du prof, en localStorage, restent intactes. */
    partage = true;
    $('partage-reglage').closest('fieldset').hidden = true;

    if (Kiosque.role === 'eleve' && Kiosque.reglages) {
        /* Une fois par session : l'élève peut ensuite changer ses réglages. */
        let deja = null;
        try {
            deja = sessionStorage.getItem('albert-go.kiosque-reglages');
        } catch (err) {
            /* Stockage bloqué : les réglages du prof sont repris à chaque chargement. */
        }
        if (deja !== String(Kiosque.reglages.session)) {
            for (const [nom, valeur] of reglagesAppliques(Kiosque.reglages, Object.keys(Recherche.MOTEURS))) {
                reglages[nom] = valeur;
                ecrire(NOMS_STOCKES[nom] || nom, valeurStockee(valeur));
            }
            try {
                sessionStorage.setItem('albert-go.kiosque-reglages', String(Kiosque.reglages.session));
            } catch (err) {
                /* Stockage bloqué. */
            }
        }
    }

    if (Kiosque.role === 'enseignant') {
        const envoyer = () => fetch('/api/kiosque-reglages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reglagesProf(reglages))
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
        document.querySelector('.entete').after(bandeau);
    }

    $('deconnexion-kiosque').hidden = false;
    /* fetch et non un formulaire : la CSP de la page interdit l'envoi de formulaires (form-action 'none'). */
    $('deconnexion-kiosque').addEventListener('click', () => {
        fetch('/kiosque', { method: 'POST', body: new URLSearchParams({ action: 'logout' }), redirect: 'manual' })
            .catch(() => {})
            .finally(() => {
                location.href = '/kiosque';
            });
    });

    setInterval(() => {
        fetch('/api/kiosque-status').then(r => r.json()).then((statut) => {
            if (!statut.active) {
                location.href = '/kiosque?erreur=terminee';
            }
        }).catch(() => {
            /* Coupure réseau ponctuelle : on réessaie au tour suivant. */
        });
    }, SONDAGE_KIOSQUE_MS);
}

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = { reglagesProf, reglagesAppliques, valeurStockee };
}
