/*
 * projet.js
 * Bibliothèque de fichiers déposés une fois, commune à Discussion et au
 * module Imprimerie (clé interne "projet") : chaque conversation ou document
 * coche ceux qu'il utilise ; un document d'Imprimerie se construit peu à peu.
 *
 * Garde la bibliothèque, les sources cochées et le nom du document affiché,
 * et tient leur volet à jour. La lecture des fichiers est dans
 * piece-jointe.js, l'envoi dans app.js, l'enregistrement et la liste des
 * documents dans historique.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

/** Bibliothèque : texte des fichiers déposés, commun à tous les documents : { nom, texte }. */
let bibliotheque = [];
try {
    bibliotheque = JSON.parse(lire('bibliotheque', '[]'));
} catch (err) {
    /* Données illisibles : on repart de zéro. */
}
if (!Array.isArray(bibliotheque)) {
    bibliotheque = [];
}

/** Noms des fichiers de la bibliothèque cochés pour la conversation ou le document affiché. */
let sourcesProjet = [];

/** Fichiers cochés, envoyés avec chaque question : tenus à jour par choisirSources. */
let documentsProjet = [];

/** Nom donné au projet affiché, ou '' : son titre sert alors de nom. */
let nomProjet = '';

/** Guides en cours de rédaction, par nom de source. */
const guidesEnCours = new Map();

/** Un guide à la fois : un lot de fichiers déposés ne lance pas autant de demandes d'un coup. */
let fileGuides = Promise.resolve();

/** Nom de la source dont le guide est affiché. */
let guideAffiche = '';

/** Très grand écran : la bibliothèque est une colonne à droite ; sinon un tiroir (entete.css). */
const COLONNE_SOURCES = matchMedia('(min-width: 80rem)');

/**
 * Affiche la bibliothèque en colonne, sans lui donner le focus.
 */
function montrerBibliotheque() {
    montrerSansFocus($('bibliotheque'));
    $('ouvrir-bibliotheque').setAttribute('aria-expanded', 'true');
}

/**
 * Place le volet de la bibliothèque selon le module et l'écran.
 *
 * Dans Discussion et Imprimerie, sur très grand écran : colonne fermée, sauf si elle a été dépliée.
 * Ailleurs, ou sur un écran plus étroit : volet fermé, le bouton de l'en-tête l'ouvre en tiroir.
 */
function placerBibliotheque() {
    /* Premier appel avant modules.js, qui déclare outilActuel. */
    const projet = Albert.pret() && typeof outilActuel !== 'undefined' && !!Albert.OUTILS[outilActuel].sources;
    $('ouvrir-bibliotheque').hidden = !projet;
    const volet = $('bibliotheque');
    const colonne = projet && COLONNE_SOURCES.matches && lire('bibliotheque-volet', null) === 'ouvert';
    const enColonne = volet.open && !volet.matches(':modal');
    /* Déjà en place : colonne voulue et affichée, ou tiroir laissé ouvert dans un module à sources. */
    if (colonne === enColonne && (projet || !volet.open)) {
        return;
    }
    /* La colonne glisse quand on entre dans un module à sources ou qu'on en sort (entete.css). */
    if (volet.open) {
        volet.close();
    }
    if (colonne) {
        montrerBibliotheque();
    }
}
COLONNE_SOURCES.addEventListener('change', placerBibliotheque);

$('ouvrir-bibliotheque').addEventListener('click', () => {
    if (!COLONNE_SOURCES.matches) {
        $('bibliotheque').showModal();
        $('ouvrir-bibliotheque').setAttribute('aria-expanded', 'true');
        return;
    }
    /* Colonne : le bouton la replie ou la déplie, et s'en souvient. */
    if ($('bibliotheque').open) {
        $('bibliotheque').close();
        ecrire('bibliotheque-volet', null);
    } else {
        montrerBibliotheque();
        ecrire('bibliotheque-volet', 'ouvert');
    }
});

$('bibliotheque').addEventListener('close', () => {
    $('ouvrir-bibliotheque').setAttribute('aria-expanded', 'false');
});

/* Tiroir : sa flèche et un clic sur le fond le referment. Colonne : sa flèche la replie comme le bouton de l'en-tête. */
$('bibliotheque').addEventListener('click', (e) => {
    if (e.target.closest('.fermer-bibliotheque') && !$('bibliotheque').matches(':modal')) {
        $('ouvrir-bibliotheque').click();
        return;
    }
    if (e.target === $('bibliotheque') || e.target.closest('.fermer-bibliotheque')) {
        $('bibliotheque').close();
    }
});

/* Aide d'une section du volet : son titre et son explication, dans la même boîte. */
for (const bouton of document.querySelectorAll('[data-aide]')) {
    bouton.addEventListener('click', () => {
        $('titre-aide').textContent = t(bouton.dataset.aide + '.titre');
        $('texte-aide').textContent = t('aide.' + bouton.dataset.aide, { nombre: Albert.VERSIONS_MAX });
        $('aide').showModal();
    });
}

/* Croix du bouton "Supprimer", celle de la pièce jointe. */
const ICONE_RETIRER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/**
 * Coche les sources du document affiché ; les fichiers envoyés suivent.
 *
 * @param {string[]} noms - Noms cochés ; ceux qui ont quitté la bibliothèque sont écartés.
 */
function choisirSources(noms) {
    sourcesProjet = noms.filter(nom => bibliotheque.some(d => d.nom === nom));
    documentsProjet = Albert.sourcesCochees(bibliotheque, sourcesProjet);
}

/**
 * Écrit la bibliothèque dans le stockage, selon la même règle que les conversations.
 *
 * @param {Object[]} fichiers - Bibliothèque à garder.
 * @returns {boolean} false si le stockage est plein ; bloqué, elle ne vit que le temps de la page.
 */
function ecrireBibliotheque(fichiers) {
    try {
        if (fichiers.length) {
            /* ponytail: texte gardé dans le stockage du navigateur (environ 5 millions de caractères) ; IndexedDB si le quota gêne. */
            stockage('bibliotheque').setItem('albert-go.bibliotheque', JSON.stringify(fichiers));
        } else {
            stockage('bibliotheque').removeItem('albert-go.bibliotheque');
        }
        return true;
    } catch (err) {
        return err.name !== 'QuotaExceededError';
    }
}

/**
 * Reprend dans la bibliothèque les sources que chaque document gardait avec lui.
 *
 * Appelée une fois au démarrage (app.js), après la lecture des conversations.
 */
function reprendreSources() {
    const reprise = Albert.versBibliotheque(conversations, bibliotheque);
    if (!reprise.change) {
        return;
    }
    bibliotheque = reprise.bibliotheque;
    conversations = reprise.conversations;
    try {
        /* Les conversations allégées d'abord : la bibliothèque, plus petite que la place libérée, tient ensuite. */
        ecrireConversations(conversations);
    } catch (err) {
        /* Stockage bloqué : tout reste en mémoire. */
        return;
    }
    ecrireBibliotheque(bibliotheque);
}

/**
 * Met le résumé du volet à jour : fichiers cochés, taille de la bibliothèque, part du contexte.
 *
 * Le bouton de l'en-tête suit : orange et nombre de sources dans son libellé tant qu'une source
 * part avec les questions. Appelée aussi au changement de langue, qui remet le libellé simple.
 */
function afficherResumeSources() {
    const nombre = documentsProjet.length;
    const bouton = $('ouvrir-bibliotheque');
    const libelle = t(nombre === 0 ? 'bibliotheque.ouvrir' : nombre === 1 ? 'bibliotheque.ouvrir-une' : 'bibliotheque.ouvrir-coches', { nombre: nombre });
    bouton.classList.toggle('sources-cochees', nombre > 0);
    bouton.setAttribute('aria-label', libelle);
    bouton.title = libelle;
    const part = Albert.partDocuments(documentsProjet, modeleActuel().contexte);
    /* Retiré le 21/11/2026 : une seule ligne, "Utilisés : 1 sur 2 - 19 % du contexte".
    $('resume-documents').textContent = t(part === null ? 'documents.resume' : 'documents.resume-part',
        { coches: documentsProjet.length, nombre: bibliotheque.length, pourcent: part });
    */
    /* Retiré le 21/11/2026 : les cases cochées le montrent déjà.
    $('resume-documents').textContent = t(nombre > 1 ? 'documents.resume' : 'documents.resume-une', { coches: nombre, nombre: bibliotheque.length });
    */
    $('place-documents').hidden = part === null;
    /* Place libre : ce que les sources cochées laissent du contexte, 0 au-delà. */
    const libre = Math.max(0, 100 - (part || 0));
    $('jauge-documents').value = libre;
    $('part-documents').textContent = t('documents.place', { libre });
}

/**
 * Anneau qui tourne à la place de la case, le temps de lire le fichier puis de rédiger sa fiche de lecture.
 *
 * @returns {HTMLSpanElement} L'anneau, masqué aux lecteurs d'écran : la ligne porte aria-busy.
 */
function anneauSource() {
    const anneau = document.createElement('span');
    anneau.className = 'anneau';
    anneau.setAttribute('aria-hidden', 'true');
    return anneau;
}

/**
 * Ligne provisoire d'un fichier en cours de lecture, en bas de la liste, retirée par afficherDocuments.
 *
 * @param {string} nom - Nom du fichier.
 * @returns {HTMLLIElement} La ligne, à retirer si la lecture échoue.
 */
function ligneEnLecture(nom) {
    const ligne = document.createElement('li');
    ligne.className = 'en-cours';
    ligne.setAttribute('aria-busy', 'true');
    const texte = document.createElement('span');
    texte.className = 'nom-source';
    texte.setAttribute('role', 'status');
    texte.textContent = t('piece.lecture', { nom });
    ligne.append(anneauSource(), texte);
    $('liste-documents').append(ligne);
    $('groupe-sources').hidden = false;
    $('bibliotheque-vide').hidden = true;
    return ligne;
}

/**
 * Met le volet de la bibliothèque à jour : nom du document, résumé, un fichier par ligne.
 *
 * Chaque ligne : la case qui l'ajoute au document, son nom (qui télécharge son texte), sa suppression.
 */
function afficherDocuments() {
    $('nom-projet').value = nomProjet;
    afficherResumeSources();
    $('vider-bibliotheque').hidden = !bibliotheque.length;
    $('groupe-sources').hidden = !bibliotheque.length;
    $('bibliotheque-vide').hidden = !!bibliotheque.length;
    afficherVersions();
    $('liste-documents').replaceChildren(...bibliotheque.map((doc) => {
        const ligne = document.createElement('li');
        const coche = document.createElement('input');
        coche.type = 'checkbox';
        coche.checked = sourcesProjet.includes(doc.nom);
        coche.setAttribute('aria-label', t('documents.utiliser', { nom: doc.nom }));
        coche.addEventListener('change', () => cocherSource(doc.nom, coche));
        const nom = document.createElement('button');
        nom.type = 'button';
        nom.className = 'nom-source';
        nom.textContent = doc.nom;
        nom.title = t('documents.guide', { nom: doc.nom });
        /* Retiré le 21/11/2026 : le nom pulsait pendant la fiche de lecture ; l'anneau remplace la case.
        nom.classList.toggle('guide-en-cours', guidesEnCours.has(doc.nom));
        */
        ligne.classList.toggle('en-cours', guidesEnCours.has(doc.nom));
        ligne.setAttribute('aria-busy', String(guidesEnCours.has(doc.nom)));
        nom.addEventListener('click', () => ouvrirGuide(doc.nom));
        const supprimer = boutonAction(ICONE_RETIRER, t('documents.supprimer', { nom: doc.nom }));
        supprimer.addEventListener('click', () => demanderSuppressionSource(doc.nom));
        ligne.append(anneauSource(), coche, nom, supprimer);
        return ligne;
    }));
}

/**
 * Met la liste des versions du volet à jour : une ligne par version, la plus récente en tête, la version affichée en gras.
 */
function afficherVersions() {
    const versions = Albert.versionsProjet(conversation);
    /* La version affichée est la dernière de la conversation, reprise ou reçue. */
    const affichee = versions.at(-1);
    /* Discussion : des réponses, pas des versions. Premier appel avant modules.js, qui déclare outilActuel. */
    const imprimerie = typeof outilActuel !== 'undefined' && !!Albert.OUTILS[outilActuel].documents;
    $('versions').hidden = $('trait-versions').hidden = versions.length < 2 || !imprimerie;
    $('liste-versions').replaceChildren(...versions.sort((a, b) => b.numero - a.numero).map((version) => {
        const ligne = document.createElement('li');
        /* La version affichée ne se clique pas. */
        const nom = document.createElement(version === affichee ? 'span' : 'button');
        nom.className = 'nom-source';
        /* Numéro, heure si elle a été notée, puis la demande : le CSS la coupe en bout de ligne. */
        nom.textContent = version.numero + '. ' + (version.date ? I18n.heure(version.date) + ' - ' : '') + version.demande;
        /* Infobulle : la demande en entier, puis la date et l'heure, comme dans le menu. */
        nom.title = version.demande + (version.date ? '\n' + I18n.dateHeure(version.date) : '');
        if (version === affichee) {
            nom.setAttribute('aria-current', 'true');
        } else {
            nom.type = 'button';
            nom.addEventListener('click', () => choisirVersion(version.rang));
        }
        ligne.append(nom);
        return ligne;
    }));
}

/**
 * Reprend une version : elle redevient le document affiché, base de la demande suivante.
 *
 * @param {number} rang - Rang de sa réponse dans la conversation.
 */
function choisirVersion(rang) {
    /* Une réponse est attendue : elle se poserait sur une autre version. */
    if (annulation) {
        return;
    }
    if (typeof speechSynthesis !== 'undefined') {
        Lecture.arreter();
    }
    conversation = Albert.reprendreVersion(conversation, rang);
    afficherFil();
    afficherVersions();
    sauverConversation();
    /* Tiroir : il se referme pour montrer le document. */
    if ($('bibliotheque').matches(':modal')) {
        $('bibliotheque').close();
    } else {
        focusSaisie();
    }
}

/**
 * Enregistre le document affiché ; vidé avant toute question, il quitte la liste des documents.
 */
function enregistrerProjet() {
    if (documentsProjet.length || conversation.length) {
        sauverConversation();
        return;
    }
    const restantes = conversations.filter(c => c.id !== conversationId);
    try {
        ecrireConversations(restantes);
    } catch (err) {
        /* Stockage bloqué : la liste en mémoire suffit. */
    }
    conversations = restantes;
    conversationId = null;
    retenirCourante(null);
    afficherHistorique();
}

/**
 * Dit si un fichier de plus dépasse le contexte. Discussion cherche alors dans les sources
 * (passagesPertinents) ; Imprimerie les envoie entières, elle refuse.
 *
 * @param {{nom: string, texte: string}} fichier - Fichier à cocher.
 * @returns {boolean} true si le fichier ne peut pas être coché.
 */
function tropDeSources(fichier) {
    return !!Albert.OUTILS[outilActuel].documents && !Albert.avecDocument(documentsProjet, fichier, modeleActuel().contexte);
}

/**
 * Coche ou décoche un fichier pour le document affiché.
 *
 * @param {string} nom - Nom du fichier.
 * @param {HTMLInputElement} coche - Sa case ; décochée si le fichier ne tient pas dans le contexte.
 */
function cocherSource(nom, coche) {
    if (coche.checked) {
        const fichier = bibliotheque.find(d => d.nom === nom);
        if (tropDeSources(fichier)) {
            coche.checked = false;
            etat(t('erreur.projet-plein'), true);
            return;
        }
        choisirSources([...sourcesProjet, nom]);
    } else {
        choisirSources(sourcesProjet.filter(s => s !== nom));
    }
    /* La liste n'est pas reconstruite : la case garde le focus. */
    afficherResumeSources();
    enregistrerProjet();
}

/** Base IndexedDB des vecteurs, ouverte au premier besoin ; null si le navigateur la refuse. */
let baseVecteurs = null;

/**
 * Ouvre la base des vecteurs. Sans elle (navigation privée), ils sont recalculés à chaque session.
 *
 * @returns {Promise<?IDBDatabase>} La base, ou null.
 */
function ouvrirVecteurs() {
    baseVecteurs = baseVecteurs || new Promise((pret) => {
        try {
            const demande = indexedDB.open('albert-go', 1);
            demande.onupgradeneeded = () => demande.result.createObjectStore('vecteurs');
            demande.onsuccess = () => pret(demande.result);
            demande.onerror = () => pret(null);
        } catch {
            pret(null);
        }
    });
    return baseVecteurs;
}

/**
 * Lit ou écrit une entrée de la base des vecteurs ; sans base, rien.
 *
 * @param {string} cle - Nom de la source et empreinte de son texte.
 * @param {Float32Array} [valeur] - Vecteurs à écrire, mis bout à bout ; absent pour lire.
 * @returns {Promise<?Float32Array>} Vecteurs lus, ou null.
 */
async function baseVecteur(cle, valeur) {
    const base = await ouvrirVecteurs();
    if (!base) {
        return null;
    }
    return new Promise((pret) => {
        const magasin = base.transaction('vecteurs', valeur ? 'readwrite' : 'readonly').objectStore('vecteurs');
        const demande = valeur ? magasin.put(valeur, cle) : magasin.get(cle);
        demande.onsuccess = () => pret(valeur ? null : demande.result || null);
        demande.onerror = () => pret(null);
    });
}

/**
 * Vecteurs des passages d'une source, calculés une fois puis gardés dans IndexedDB.
 * ponytail: anciennes entrées jamais purgées ; une source redéposée en laisse une. À purger si la base grossit.
 *
 * @param {{nom: string, texte: string}} doc - Source cochée.
 * @param {AbortSignal} signal - Pour annuler avec la question.
 * @returns {Promise<Float32Array[]>} Un vecteur par passage de Albert.decouper.
 */
async function vecteursSource(doc, signal) {
    const cle = doc.nom + '\n' + Albert.empreinteTexte(doc.texte) + '\n' + Albert.MODELE_VECTEURS;
    const passages = Albert.decouper(doc.texte);
    const garde = await baseVecteur(cle);
    if (garde && garde.length % passages.length === 0) {
        const dimension = garde.length / passages.length;
        return passages.map((p, i) => garde.subarray(i * dimension, (i + 1) * dimension));
    }
    const vecteurs = await Albert.vecteurs(passages.map(p => (p.chemin ? p.chemin + '\n' : '') + p.texte), signal);
    const bout = new Float32Array(vecteurs.reduce((s, v) => s + v.length, 0));
    vecteurs.forEach((v, i) => bout.set(v, i * v.length));
    await baseVecteur(cle, bout);
    return vecteurs;
}

/**
 * Passages à envoyer quand les sources cochées dépassent le contexte : ceux des mots rares,
 * puis les plus proches de la question, jusqu'au plafond.
 *
 * @param {string} question - Texte saisi.
 * @param {Object[]} passages - Passages de Albert.passagesSources(documentsProjet).
 * @param {AbortSignal} signal - Pour annuler avec la question.
 * @returns {Promise<Object[]>} Passages choisis, numéros inchangés.
 * @throws {Error} Si la recherche échoue (relais sans /v1/embeddings).
 */
async function passagesPertinents(question, passages, signal) {
    etat(t('etat.recherche-sources'));
    try {
        const vecteurs = [];
        for (const doc of documentsProjet) {
            vecteurs.push(...await vecteursSource(doc, signal));
        }
        const [demande] = await Albert.vecteurs([question], signal);
        const proximites = vecteurs.map(v => Albert.cosinus(demande, v));
        const prioritaires = new Set(Albert.passagesMotsRares(question, passages).flatMap(m => m.trouves.map(p => p.n)));
        return Albert.choisirPassages(passages, proximites, prioritaires, Albert.plafondDocuments(modeleActuel().contexte));
    } catch (err) {
        if (err.name === 'AbortError') {
            throw err;
        }
        throw new Error(t('erreur.recherche-sources', { message: err.message }));
    }
}

/**
 * Ajoute à la bibliothèque un fichier lu, et le coche pour le document affiché.
 *
 * @param {{nom: string, texte: string}} piece - Fichier lu par joindreFichier.
 * @param {boolean} [note] - true pour une réponse gardée : ni cochée, elle est déjà dans la conversation, ni fiche avant l'ouverture.
 * @returns {boolean} false si le fichier est vide, trop gros pour le contexte, ou si le stockage est plein.
 */
function ajouterDocument(piece, note = false) {
    if (!piece.texte.trim()) {
        etat(t('erreur.document-vide'), true);
        return false;
    }
    const nouveau = { nom: piece.nom, texte: piece.texte };
    /* Coché pour ce document : en Imprimerie, il doit tenir dans le contexte avec les autres sources cochées. */
    if (!note && tropDeSources(nouveau)) {
        etat(t('erreur.projet-plein'), true);
        return false;
    }
    /* Un fichier de même nom est remplacé, pour tous les documents qui le cochent. */
    const fichiers = [...bibliotheque.filter(d => d.nom !== nouveau.nom), nouveau];
    if (!ecrireBibliotheque(fichiers)) {
        etat(t('erreur.bibliotheque-pleine'), true);
        return false;
    }
    bibliotheque = fichiers;
    if (note) {
        afficherDocuments();
        return true;
    }
    choisirSources([...sourcesProjet.filter(s => s !== nouveau.nom), nouveau.nom]);
    afficherDocuments();
    sauverConversation();
    /* Guide rédigé dès le dépôt, sans l'attendre : en cas d'échec, il le sera à l'ouverture. */
    redigerGuide(nouveau.nom).catch(() => {});
    return true;
}

/**
 * Garde une réponse dans la bibliothèque, sous un nom libre.
 *
 * @param {string} texte - Réponse en Markdown.
 * @param {string} question - Sa question, pour le nom.
 */
function ajouterNote(texte, question) {
    const nom = Albert.nomLibre(Albert.nomNote(question), bibliotheque.map(d => d.nom));
    if (ajouterDocument({ nom: nom, texte: texte }, true)) {
        toast(t('toast.note-ajoutee', { nom: nom }));
    }
}

$('coller-texte').addEventListener('click', () => {
    $('nom-colle').value = '';
    $('texte-colle').value = '';
    $('dialogue-coller').returnValue = '';
    $('dialogue-coller').showModal();
});

$('dialogue-coller').addEventListener('close', () => {
    if ($('dialogue-coller').returnValue !== 'oui') {
        return;
    }
    /* Un nom déjà pris est numéroté : il remplacerait sinon la source de même nom. */
    const voulu = $('nom-colle').value.trim() || t('documents.texte-colle');
    ajouterDocument({ nom: Albert.nomLibre(voulu, bibliotheque.map(d => d.nom)), texte: $('texte-colle').value });
});

/**
 * Fait rédiger le guide d'une source par Albert, puis le garde avec elle dans la bibliothèque.
 *
 * @param {string} nom - Nom de la source.
 * @returns {Promise<Object>} Le guide : { resume, themes, questions }.
 * @throws {Error} Si Albert refuse la demande ou rend un guide illisible.
 */
function redigerGuide(nom) {
    if (!guidesEnCours.has(nom)) {
        const texte = bibliotheque.find(d => d.nom === nom).texte;
        const promesse = fileGuides
            .then(() => Albert.repondre(Albert.demandeGuide(modeleActuel().id, texte), new AbortController().signal))
            .then((reponse) => {
                const guide = Albert.lireGuide(reponse.texte);
                if (!guide) {
                    throw new Error(t('guide.illisible'));
                }
                /* Source supprimée ou remplacée pendant la rédaction : ce guide ne la décrit plus. */
                const doc = bibliotheque.find(d => d.nom === nom);
                if (doc && doc.texte === texte) {
                    doc.guide = guide;
                    ecrireBibliotheque(bibliotheque);
                }
                return guide;
            })
            .finally(() => {
                guidesEnCours.delete(nom);
                marquerGuide(nom, false);
            });
        guidesEnCours.set(nom, promesse);
        marquerGuide(nom, true);
        fileGuides = promesse.catch(() => {});
    }
    return guidesEnCours.get(nom);
}

/**
 * Met l'anneau à la place de la case d'une source tant qu'Albert rédige son guide.
 *
 * La liste n'est pas reconstruite : une case garde le focus.
 *
 * @param {string} nom - Nom de la source.
 * @param {boolean} enCours - true pendant la rédaction.
 */
function marquerGuide(nom, enCours) {
    for (const bouton of $('liste-documents').querySelectorAll('.nom-source')) {
        if (bouton.textContent === nom) {
            /* Retiré le 21/11/2026 : bouton.classList.toggle('guide-en-cours', enCours); */
            bouton.parentElement.classList.toggle('en-cours', enCours);
            bouton.parentElement.setAttribute('aria-busy', String(enCours));
        }
    }
}

/**
 * Ouvre le guide d'une source ; s'il n'est pas encore prêt, la boîte l'attend.
 *
 * @param {string} nom - Nom de la source.
 */
function ouvrirGuide(nom) {
    const doc = bibliotheque.find(d => d.nom === nom);
    guideAffiche = nom;
    $('titre-guide').textContent = nom;
    $('guide').showModal();
    if (doc.guide) {
        afficherGuide(doc.guide, '');
    } else {
        attendreGuide(nom);
    }
}

/**
 * Fait rédiger le guide affiché, ou attend celui en cours, puis le montre.
 *
 * En cas d'échec, l'ancien guide reste gardé avec la source.
 *
 * @param {string} nom - Nom de la source.
 */
async function attendreGuide(nom) {
    /* Points animés à la place des points de suspension, comme à la vérification de la clé. */
    afficherGuide(null, t('guide.lecture').replace(/\.+$/, ''));
    $('refaire-guide').hidden = true;
    const points = document.createElement('span');
    points.className = 'points';
    points.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
    $('etat-guide').append(points);
    let guide = null;
    let message = '';
    try {
        guide = await redigerGuide(nom);
    } catch (err) {
        message = err.message;
    }
    /* Boîte refermée, ou passée à une autre source, pendant la lecture. */
    if ($('guide').open && guideAffiche === nom) {
        afficherGuide(guide, message);
    }
}

$('refaire-guide').addEventListener('click', () => attendreGuide(guideAffiche));

/**
 * Remplit la boîte du guide : le guide s'il est là, sinon un message d'attente ou d'erreur.
 *
 * @param {?Object} guide - { resume, themes, questions }, ou null.
 * @param {string} message - Texte affiché à la place du guide, ou ''.
 */
function afficherGuide(guide, message) {
    $('refaire-guide').hidden = false;
    $('etat-guide').textContent = message;
    $('etat-guide').hidden = !message;
    $('contenu-guide').hidden = !guide;
    if (!guide) {
        return;
    }
    $('resume-guide').textContent = guide.resume;
    $('themes-guide').replaceChildren(...guide.themes.map((theme) => {
        const ligne = document.createElement('li');
        ligne.textContent = theme;
        return ligne;
    }));
    $('questions-guide').replaceChildren(...guide.questions.map((question) => {
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'suggestion';
        bouton.textContent = question;
        bouton.addEventListener('click', () => poserQuestionGuide(question));
        return bouton;
    }));
}

/**
 * Met une question du guide dans la saisie, sa source cochée, sans l'envoyer.
 *
 * @param {string} question - Question choisie.
 */
function poserQuestionGuide(question) {
    $('guide').close();
    if (!sourcesProjet.includes(guideAffiche)) {
        /* Même règle que la case : refusée si la source ne tient pas dans le contexte. */
        cocherSource(guideAffiche, { checked: true });
        afficherDocuments();
    }
    /* Tiroir : il se referme pour montrer la saisie. */
    if ($('bibliotheque').matches(':modal')) {
        $('bibliotheque').close();
    }
    $('saisie').value = question;
    $('saisie').focus();
}

$('telecharger-guide').addEventListener('click', () => {
    const doc = bibliotheque.find(d => d.nom === guideAffiche);
    Rendu.telecharger(new Blob([doc.texte], { type: 'text/plain;charset=utf-8' }), Albert.nomTexte(doc.nom));
});

/**
 * Supprime un fichier de la bibliothèque : il quitte tous les documents.
 *
 * @param {string} nom - Nom du fichier.
 */
function supprimerSource(nom) {
    bibliotheque = bibliotheque.filter(d => d.nom !== nom);
    ecrireBibliotheque(bibliotheque);
    choisirSources(sourcesProjet);
    const allegees = Albert.sansSource(conversations, nom);
    try {
        ecrireConversations(allegees);
    } catch (err) {
        /* Stockage bloqué : la liste en mémoire suffit. */
    }
    conversations = allegees;
    afficherDocuments();
    /* La liste est reconstruite : le focus retombe sur un bouton, pas sur la page. */
    $('deposer-documents').focus();
    enregistrerProjet();
}

/**
 * Vide la bibliothèque : chaque fichier quitte tous les documents.
 */
function viderBibliotheque() {
    const allegees = bibliotheque.reduce((liste, doc) => Albert.sansSource(liste, doc.nom), conversations);
    bibliotheque = [];
    ecrireBibliotheque(bibliotheque);
    choisirSources([]);
    try {
        ecrireConversations(allegees);
    } catch (err) {
        /* Stockage bloqué : la liste en mémoire suffit. */
    }
    conversations = allegees;
    afficherDocuments();
    $('deposer-documents').focus();
    enregistrerProjet();
}

/* Afficher les citations : agit aussi sur les réponses déjà affichées, et la copie et les exports le suivent. */
$('afficher-citations').checked = document.documentElement.classList.contains('citations-visibles');
$('afficher-citations').addEventListener('change', (e) => {
    document.documentElement.classList.toggle('citations-visibles', e.target.checked);
    try {
        localStorage.setItem('albert-go.citations', e.target.checked ? 'oui' : 'non');
    } catch (err) {
        /* Stockage bloqué : le réglage vaut jusqu'à la fermeture. */
    }
});

$('vider-bibliotheque').addEventListener('click', () => {
    $('texte-confirmer-suppression').textContent = t('confirmer-suppression.bibliotheque-texte');
    $('titre-confirmer-suppression').textContent = t('confirmer-suppression.bibliotheque');
    /* Sinon Échap reprendrait la réponse précédente. */
    $('confirmer-suppression').returnValue = '';
    $('confirmer-suppression').addEventListener('close', () => {
        if ($('confirmer-suppression').returnValue === 'oui') {
            viderBibliotheque();
        }
    }, { once: true });
    $('confirmer-suppression').showModal();
});

/**
 * Demande confirmation avant de supprimer un fichier de la bibliothèque.
 *
 * @param {string} nom - Nom du fichier, affiché dans la boîte de confirmation.
 */
function demanderSuppressionSource(nom) {
    $('texte-confirmer-suppression').textContent = nom;
    $('titre-confirmer-suppression').textContent = t('confirmer-suppression.source');
    /* Sinon Échap reprendrait la réponse précédente. */
    $('confirmer-suppression').returnValue = '';
    $('confirmer-suppression').addEventListener('close', () => {
        if ($('confirmer-suppression').returnValue === 'oui') {
            supprimerSource(nom);
        }
    }, { once: true });
    $('confirmer-suppression').showModal();
}

/* Discussion : le volet a son propre sélecteur, le trombone joint au message. */
$('deposer-documents').addEventListener('click', () => {
    $('fichier-sources').click();
});

$('fichier-sources').addEventListener('change', () => {
    const fichiers = [...$('fichier-sources').files];
    /* Permet de choisir à nouveau le même fichier. */
    $('fichier-sources').value = '';
    joindreFichiers(fichiers, true);
});

/* Glisser-déposer sur le volet, comme sur la saisie. */
$('bibliotheque').addEventListener('dragover', (e) => {
    e.preventDefault();
});

$('bibliotheque').addEventListener('drop', (e) => {
    e.preventDefault();
    joindreFichiers([...e.dataTransfer.files], true);
});

/* Nom du projet : suivi à chaque frappe, enregistré quand le champ est quitté. */
$('nom-projet').addEventListener('input', () => {
    nomProjet = $('nom-projet').value;
});

$('nom-projet').addEventListener('change', () => {
    /* Un nom seul ne fait pas un projet : il sera gardé à la première source ou à la première question. */
    if (documentsProjet.length || conversation.length) {
        sauverConversation();
    }
});

/* "Nouveau projet" : choisirOutil rouvrirait le projet laissé, nouvelleConversation le referme. */
$('nouveau-projet').addEventListener('click', () => {
    if (outilActuel !== 'projet') {
        choisirOutil('projet');
    }
    nouvelleConversation();
    viderSaisie();
});
