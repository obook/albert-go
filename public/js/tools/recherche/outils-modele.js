/*
 * tools/recherche/outils-modele.js
 * Boucle d'appels d'outils : le modèle demande une recherche, une image
 * ou un calcul, la page l'exécute et lui rend le résultat.
 *
 * Utilise Recherche (recherche.js), OUTILS_LOCAUX (calcul.js) et Albert.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/* Appels d'outil enchaînés avant d'exiger une réponse rédigée. */
const TOURS_MAX = 2;

/**
 * Exécute un appel d'outil demandé par le modèle.
 *
 * Un échec de recherche est rendu au modèle en texte : il répond alors
 * sans les résultats, au lieu de voir la conversation s'arrêter.
 *
 * @param {Object} appel - Entrée de tool_calls renvoyée par le modèle.
 * @param {AbortSignal} signal - Pour annuler avec la question.
 * @param {Array<Object>} faites - Recherches { mots, moteur, sources }, complétées ici pour la trace sous la réponse.
 * @returns {Promise<string>} Contenu du message de rôle "tool".
 */
async function executerOutil(appel, signal, faites) {
    if (appel.function.name === 'image_commons') {
        return chercherImagesOutil(appel, signal, faites);
    }
    const local = OUTILS_LOCAUX[appel.function.name];
    if (local) {
        try {
            const ligne = await local.executer(JSON.parse(appel.function.arguments || '{}'), I18n.langue);
            /* Gardé avec les recherches, jusqu'à l'historique. */
            faites.push({ [appel.function.name]: ligne });
            return ligne;
        } catch (err) {
            return t(appel.function.name + '.invalide');
        }
    }
    let mots = '';
    try {
        mots = JSON.parse(appel.function.arguments || '{}').q || '';
    } catch (err) {
        mots = '';
    }
    if (!mots) {
        return t('recherche.aucun-mot');
    }
    etat(t('etat.recherche', { mots: mots }));
    try {
        const resultats = await Recherche.chercher(reglages.fournisseur, reglages.cleRecherche, mots, signal);
        const numerotes = Recherche.numeroter(resultats, faites);
        /* Une page déjà citée garde son numéro : elle n'entre pas deux fois. */
        faites.push({
            mots: mots,
            moteur: reglages.fournisseur,
            sources: numerotes.filter(r => !r.connue).map(r => ({ numero: r.numero, titre: r.titre, url: r.url }))
        });
        return Recherche.formater(numerotes) || t('recherche.aucun-resultat');
    } catch (err) {
        /* Sinon le modèle répond de mémoire sans que rien ne le dise. */
        const echec = t('recherche.impossible', { message: err.message });
        toast(echec);
        return echec;
    }
}

/**
 * Exécute l'outil image_commons : les vrais fichiers trouvés, pour que le
 * modèle cite un lien qui existe au lieu d'en inventer un.
 *
 * @param {Object} appel - Entrée de tool_calls.
 * @param {AbortSignal} signal - Pour annuler avec la question.
 * @param {Array<Object>} faites - Traces, complétées ici.
 * @returns {Promise<string>} Contenu du message de rôle "tool".
 */
async function chercherImagesOutil(appel, signal, faites) {
    let mots = '';
    try {
        mots = JSON.parse(appel.function.arguments || '{}').q || '';
    } catch (err) {
        mots = '';
    }
    if (!mots) {
        return t('recherche.aucun-mot');
    }
    etat(t('etat.images', { mots: mots }));
    try {
        const images = Recherche.garderNomsPropres(await Recherche.chercherImages(mots, signal), mots);
        faites.push({ image_commons: mots });
        return images.map((i) => '- ' + i.url + (i.desc ? ' : ' + i.desc : '')).join('\n') || t('images.aucune');
    } catch (err) {
        const echec = t('recherche.impossible', { message: err.message });
        toast(echec);
        return echec;
    }
}

/**
 * Ajoute à la consigne système le rappel que l'outil est disponible.
 *
 * Interrogé sur ses capacités, un modèle répond souvent qu'il ne sait pas
 * chercher, sans regarder les outils qu'on lui a passés.
 *
 * @param {Array<Object>} messages - Messages de la demande.
 * @returns {Array<Object>} Copie avec le rappel, sans toucher l'original.
 */
function avecRappel(messages, cherche) {
    const moteur = Recherche.MOTEURS[reglages.fournisseur] || {};
    const source = Recherche.sansCle(reglages.fournisseur)
        ? t('recherche.source-base', { nom: moteur.nom })
        : t('recherche.source-web');
    /* Sans ces rappels, une photo demandée partait en recherche web. */
    const rappel = [cherche ? t('recherche.rappel', { source: source }) : '',
        t(reglages.images ? 'images.rappel' : 'images.absent'),
        /* Sans lui, le modèle reprenait une heure déjà donnée et se trompait de jour. */
        reglages.calendrier ? t('calendrier.rappel') : ''].filter(Boolean).join('\n');
    if (messages[0] && messages[0].role === 'system') {
        return [{ role: 'system', content: messages[0].content + '\n' + rappel }, ...messages.slice(1)];
    }
    return [{ role: 'system', content: rappel }, ...messages];
}

/**
 * Remet la date et l'heure dans la consigne d'une demande repartie sans outil :
 * Calendrier actif, la consigne ne les porte pas (voir consigne, modules.js).
 *
 * @param {Array<Object>} messages - Messages de la demande.
 * @returns {Array<Object>} Copie avec la date, ou les messages tels quels.
 */
function avecDate(messages) {
    if (!reglages.calendrier || !messages[0] || messages[0].role !== 'system') {
        return messages;
    }
    const date = t('consigne.date', Calendrier.maintenant(I18n.langue));
    return [{ role: 'system', content: messages[0].content + '\n' + date }, ...messages.slice(1)];
}

/**
 * Envoie la demande à Albert avec les outils activés dans les réglages.
 *
 * Un modèle qui refuse le champ `tools` fait échouer le premier appel :
 * on repart alors sans outil plutôt que de perdre la question.
 *
 * Le premier tour impose la recherche (`tool_choice`), sinon les modèles
 * ouverts répondent de mémoire sans jamais appeler l'outil. Les tours
 * suivants laissent le modèle libre, pour qu'il rédige sa réponse.
 *
 * @param {string} cle - Clé API Albert.
 * @param {Object} requete - Corps de la demande (model, messages...).
 * @param {AbortSignal} signal - Pour annuler avec la question.
 * @returns {Promise<Object>} Réponse d'Albert.repondre.
 */
async function repondreAvecOutils(cle, requete, signal) {
    /* Recherche autorisée dans Réglages, et demandée au globe pour cette question. */
    const cherche = reglages.recherche && rechercheUneFois
        && (Recherche.sansCle(reglages.fournisseur) || Boolean(reglages.cleRecherche));
    const outils = Object.keys(OUTILS_LOCAUX).filter(nom => reglages[nom]).map(nom => OUTILS_LOCAUX[nom].outil());
    if (reglages.images) {
        outils.unshift(Recherche.outilImages());
    }
    if (cherche) {
        outils.unshift(Recherche.outil(reglages.fournisseur));
    }
    if (!outils.length) {
        return Albert.repondre(cle, requete, signal);
    }
    const messages = [...requete.messages];
    /* Recherches faites, rendues avec la réponse pour la trace sous la bulle. */
    const faites = [];
    /* Extraits trouvés, pour le dernier tour. */
    const extraits = [];
    for (let tour = 0; tour < TOURS_MAX; tour++) {
        let reponse;
        try {
            reponse = await Albert.repondre(cle, {
                ...requete,
                messages: avecRappel(messages, cherche),
                tools: outils,
                tool_choice: cherche && tour === 0 ? 'required' : 'auto'
            }, signal);
        } catch (err) {
            if (cherche) {
                toast(t('toast.recherche-indisponible'));
            }
            return { ...await Albert.repondre(cle, { ...requete, messages: avecDate(messages) }, signal), recherches: faites };
        }
        const appels = (reponse.message && reponse.message.tool_calls) || [];
        if (!appels.length) {
            return { ...reponse, recherches: faites };
        }
        messages.push(reponse.message);
        for (const appel of appels) {
            const trouve = await executerOutil(appel, signal, faites);
            extraits.push(trouve);
            messages.push({ role: 'tool', tool_call_id: appel.id, content: trouve });
        }
        etat(t('etat.reflechit'));
    }
    /* Dernier tour sans outil ni message "tool" : gpt-oss rappellerait l'outil
       et ne rédigerait rien. Les extraits repartent en texte ; sans recherche,
       pas de sources à citer, d'où un texte neutre. */
    const consigne = faites.some(f => f.mots) ? 'recherche.resultats' : 'outils.resultats';
    const dernier = extraits.length
        ? [...requete.messages, { role: 'user', content: t(consigne, { extraits: extraits.join('\n') }) }]
        : requete.messages;
    return { ...await Albert.repondre(cle, { ...requete, messages: dernier }, signal), recherches: faites };
}
