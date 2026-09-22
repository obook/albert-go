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
 */
function afficherProposition(texte, erreur = false) {
    $('proposition').textContent = texte;
    $('proposition').classList.toggle('erreur', erreur);
    $('actions-redaction').replaceChildren(...(erreur || !texte ? [] : [boutonCopier(texte)]));
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
    const annulation = new AbortController();
    annulationRedaction = annulation;
    interroger(true);
    $('etat-redaction').textContent = t('etat.redige');
    const demande = Albert.construireDemande('rediger', notes.trim());
    try {
        const reponse = await Albert.repondre(reglages.cle, {
            model: modeleActuel().id,
            temperature: reglages.temperature,
            messages: [
                { role: 'system', content: await consigne('rediger') },
                { role: 'user', content: demande }
            ]
        }, annulation.signal);
        if (annulation !== annulationRedaction) {
            return;
        }
        dernierEnvoi = notes;
        afficherProposition(reponse.texte);
        conversation = [
            { role: 'user', content: demande, affiche: notes.trim() },
            { role: 'assistant', content: reponse.texte }
        ];
        sauverConversation();
        $('etat-redaction').textContent = t('etat.proposition-prete');
    } catch (err) {
        if (annulation !== annulationRedaction) {
            return;
        }
        const message = messageEchec(err).texte;
        afficherProposition(message, true);
        /* #proposition n'est pas une région live : le statut annonce l'erreur. */
        $('etat-redaction').textContent = message;
    } finally {
        if (annulation === annulationRedaction) {
            annulationRedaction = null;
            interroger(false);
        }
    }
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
    afficherProposition(proposition ? proposition.content : '');
}

$('notes').addEventListener('input', () => {
    arreterRedaction();
    minuteurRedaction = setTimeout(rediger, PAUSE_REDACTION_MS);
});
