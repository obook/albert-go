/*
 * redaction.js
 * Outil Rédiger : une proposition de courrier à chaque pause de frappe.
 *
 * Les notes partent seules avec la consigne, sans le reste de la
 * conversation. La dernière proposition est enregistrée dans l'historique.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/** Pause de frappe avant l'envoi, en millisecondes. */
const PAUSE_REDACTION_MS = 1200;

let minuteurRedaction = null;
/** Requête en cours ; une réponse d'une autre requête est ignorée. */
let annulationRedaction = null;
/** Notes de la dernière proposition reçue : retenues au succès seulement. */
let dernierEnvoi = '';

/**
 * Affiche la proposition, ou un message d'erreur à sa place.
 *
 * @param {string} texte - Courrier proposé, ou message d'erreur.
 * @param {boolean} [erreur] - true pour un message d'erreur.
 * @param {string[]} [anomalies] - Points à vérifier signalés par une relecture.
 */
function afficherProposition(texte, erreur = false, anomalies = []) {
    /* Une lecture en cours lirait l'ancienne proposition. */
    if (typeof speechSynthesis !== 'undefined') {
        Lecture.arreter();
    }
    $('proposition').textContent = texte;
    $('proposition').classList.toggle('erreur', erreur);
    $('anomalies').replaceChildren(...anomalies.map(anomalie => {
        const li = document.createElement('li');
        li.textContent = anomalie;
        return li;
    }));
    $('anomalies').hidden = anomalies.length === 0;
    const boutons = [];
    if (texte && !erreur) {
        boutons.push(boutonCopier(texte));
        /* ponytail: lu dans la langue de l'interface, pas détectée dans le courrier. */
        if (typeof speechSynthesis !== 'undefined') {
            boutons.push(boutonLire($('proposition'), I18n.langue));
        }
        const revue = boutonAction(ICONES.revoir, t('reponse.revoir'));
        revue.addEventListener('click', revoir);
        boutons.push(revue);
    }
    $('actions-redaction').replaceChildren(...boutons);
}

/**
 * Annule la requête en cours et la pause en attente.
 */
function arreterRedaction() {
    clearTimeout(minuteurRedaction);
    if (annulationRedaction) {
        annulationRedaction.abort();
        annulationRedaction = null;
        interroger(false);
    }
    $('etat-redaction').textContent = '';
    $('etat-redaction').classList.remove('annonce');
}

/**
 * Interroge Albert pour Rédiger. Une frappe annule la requête ; une erreur
 * s'affiche à la place de la proposition.
 *
 * @param {string} champ - Consigne de Albert.OUTILS.rediger : "consigne" ou "revue".
 * @param {string} demande - Message envoyé avec la consigne.
 * @param {string} attente - Clé i18n du statut pendant l'attente.
 * @returns {Promise<?string>} Réponse, ou null si annulée, dépassée ou en échec.
 */
async function demanderRedaction(champ, demande, attente) {
    const annulation = new AbortController();
    annulationRedaction = annulation;
    interroger(true);
    $('etat-redaction').textContent = t(attente);
    try {
        const reponse = await Albert.repondre(reglages.cle, {
            model: modeleActuel().id,
            temperature: reglages.temperature,
            messages: [
                { role: 'system', content: await consigne('rediger', champ) },
                { role: 'user', content: demande }
            ]
        }, annulation.signal);
        return annulation === annulationRedaction ? reponse.texte : null;
    } catch (err) {
        if (annulation === annulationRedaction) {
            const message = messageEchec(err).texte;
            afficherProposition(message, true);
            /* #proposition n'est pas une région live : le statut annonce l'erreur. */
            $('etat-redaction').textContent = message;
        }
        return null;
    } finally {
        if (annulation === annulationRedaction) {
            annulationRedaction = null;
            interroger(false);
        }
    }
}

/**
 * Affiche la proposition et l'enregistre dans l'historique.
 *
 * @param {string} notes - Notes saisies.
 * @param {string} proposition - Courrier à garder.
 * @param {string[]} anomalies - Points à vérifier, ou [].
 * @param {string} etat - Clé i18n du statut à annoncer.
 */
function garderProposition(notes, proposition, anomalies, etat) {
    afficherProposition(proposition, false, anomalies);
    conversation = [
        { role: 'user', content: Albert.construireDemande('rediger', notes.trim()), affiche: notes.trim() },
        { role: 'assistant', content: proposition }
    ];
    sauverConversation();
    const statut = $('etat-redaction');
    statut.textContent = t(etat);
    /* Relance l'animation à chaque proposition, même si le texte du statut ne change pas. */
    statut.classList.remove('annonce');
    void statut.offsetWidth;
    statut.classList.add('annonce');
}

/**
 * Envoie les notes si elles ont changé, puis affiche et enregistre la proposition.
 *
 * @returns {Promise<void>}
 */
async function rediger() {
    const notes = $('notes').value;
    if (!Albert.doitEnvoyer(notes, dernierEnvoi)) {
        return;
    }
    const texte = await demanderRedaction('consigne', Albert.construireDemande('rediger', notes.trim()), 'etat.redige');
    if (texte === null) {
        return;
    }
    dernierEnvoi = notes;
    garderProposition(notes, Albert.sansMarkdown(texte), [], 'etat.proposition-prete');
}

/**
 * Bouton Revoir : Albert reconstruit la proposition et signale ce qu'il ne peut trancher.
 *
 * @returns {Promise<void>}
 */
async function revoir() {
    const notes = $('notes').value;
    const actuelle = $('proposition').textContent;
    arreterRedaction();
    /* Trois mois de jours nommés : de quoi vérifier "lundi 30 septembre". */
    const calendrier = Albert.calendrier(new Date(), 92, I18n.langue).join('\n');
    const demande = t('demande.revoir', { notes: notes.trim(), proposition: actuelle, calendrier: calendrier });
    const texte = await demanderRedaction('revue', demande, 'etat.relit');
    if (texte === null) {
        return;
    }
    const revue = Albert.separerRevue(texte);
    garderProposition(notes, revue.texte, revue.anomalies, 'etat.revue-prete');
}

/**
 * Vide l'écran Rédiger : appelée par nouvelleConversation (app.js).
 */
function viderRedaction() {
    arreterRedaction();
    dernierEnvoi = '';
    $('notes').value = '';
    afficherProposition('');
}

/**
 * Réaffiche une rédaction enregistrée : notes et dernière proposition.
 *
 * @param {Object[]} messages - Messages { role, content, affiche } de l'entrée.
 */
function rouvrirRedaction(messages) {
    const notes = messages.find(m => m.role === 'user');
    const proposition = messages.find(m => m.role === 'assistant');
    $('notes').value = notes ? notes.affiche || '' : '';
    dernierEnvoi = $('notes').value;
    /* Les propositions enregistrées avant le nettoyage peuvent contenir du Markdown. */
    afficherProposition(proposition ? Albert.sansMarkdown(proposition.content) : '');
}

$('notes').addEventListener('input', () => {
    arreterRedaction();
    minuteurRedaction = setTimeout(rediger, PAUSE_REDACTION_MS);
});
