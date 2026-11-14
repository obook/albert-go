/*
 * tools/recherche/outils-modele.js
 * Boucle d'appels d'outils : le modèle demande une recherche, une image,
 * un service de l'État ou un calcul, la page l'exécute et lui rend le résultat.
 *
 * Utilise Recherche (recherche.js), Services (services.js), OUTILS_LOCAUX (calcul.js) et Albert.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

/* Appels d'outil enchaînés avant d'exiger une réponse rédigée. */
const TOURS_MAX = 2;

/**
 * Moteurs cochés qui peuvent répondre : sans clé, ou avec celle de l'utilisateur.
 *
 * @returns {string[]} Clés de Recherche.MOTEURS.
 */
function moteursActifs() {
    return reglages.fournisseurs.filter(id => Recherche.sansCle(id) || Boolean(reglages.cleRecherche));
}

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
    /* Un service de l'État se cherche et se cite comme une base du moteur. */
    const service = Services.TABLE[appel.function.name];
    const actifs = moteursActifs();
    etat(t('etat.recherche', { mots: mots }));
    try {
        const resultats = service
            ? await Recherche.chercherBase(service, mots, signal)
            : await Recherche.chercherPartout(actifs, reglages.cleRecherche, mots, signal);
        const numerotes = Recherche.numeroter(resultats, faites);
        /* Une page déjà citée garde son numéro : elle n'entre pas deux fois. */
        faites.push({
            mots: mots,
            /* Plusieurs moteurs : leurs clés séparées par des virgules. */
            moteur: service ? appel.function.name : actifs.join(','),
            sources: numerotes.filter(r => !r.connue).map(r => ({ numero: r.numero, titre: r.titre, url: r.url }))
        });
        return Recherche.formater(numerotes) || t('recherche.aucun-resultat');
    } catch (err) {
        /* Sinon le modèle répond de mémoire sans que rien ne le dise. */
        toast(t('recherche.impossible', { message: err.message }));
        return t('recherche.impossible-modele', { message: err.message });
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
        toast(t('recherche.impossible', { message: err.message }));
        return t('recherche.impossible-modele', { message: err.message });
    }
}

/**
 * Ajoute sous la réponse les tableaux rendus par l'outil calcul (bloc $$...$$
 * de sa ligne). Les modèles les recopient mal : la page les affiche elle-même.
 *
 * @param {string} texte - Réponse du modèle.
 * @param {Array<Object>} faites - Appels d'outils de cette réponse.
 * @returns {string} Réponse suivie des tableaux qu'elle ne contient pas déjà.
 */
function avecTableaux(texte, faites) {
    const serre = s => s.replace(/\s+/g, '');
    const tableaux = faites.map(f => (/\$\$[\s\S]+\$\$/.exec(f.calcul || '') || [])[0])
        .filter(tableau => tableau && !serre(texte).includes(serre(tableau).slice(2, -2)));
    return [texte, ...new Set(tableaux)].join('\n\n');
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
    const actifs = moteursActifs();
    const source = actifs.every(id => Recherche.sansCle(id))
        ? t('recherche.source-base', { nom: Recherche.noms(actifs) })
        : t('recherche.source-web');
    /* Sans ces rappels, une photo demandée partait en recherche web. */
    const internet = reglages.recherche && globeActif;
    /* Sans le mois, le modèle croit un fait récent à venir et répond de mémoire. */
    const mois = new Date().toLocaleDateString(I18n.langue, { month: 'long', year: 'numeric' });
    const rappel = [cherche ? t('recherche.rappel', { source: source, mois: mois }) : '',
        t(internet ? 'images.rappel' : 'images.absent'),
        internet ? t('services.rappel') : '',
        /* Sans lui, le modèle reprenait une heure déjà donnée et se trompait de jour. */
        reglages.calendrier ? t('calendrier.rappel') : '',
        /* Sans lui, le modèle moyen n'appelait l'outil qu'une fois sur sept (mesuré le 13/10/2026). */
        reglages.calcul ? t('calcul.rappel') : ''].filter(Boolean).join('\n');
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
 * @param {Object} requete - Corps de la demande (model, messages...).
 * @param {AbortSignal} signal - Pour annuler avec la question.
 * @returns {Promise<Object>} Réponse d'Albert.repondre.
 */
async function repondreAvecOutils(requete, signal) {
    /* Internet autorisé dans Réglages et globe activé : recherche (si un
       moteur coché peut répondre), images Wikimedia et services de l'État. */
    const internet = reglages.recherche && globeActif;
    const cherche = internet && moteursActifs().length > 0;
    const outils = Object.keys(OUTILS_LOCAUX).filter(nom => reglages[nom]).map(nom => OUTILS_LOCAUX[nom].outil());
    if (internet) {
        outils.unshift(Recherche.outilImages(), ...Services.outils());
    }
    if (cherche) {
        outils.unshift(Recherche.outil(moteursActifs()));
    }
    if (!outils.length) {
        return Albert.repondre(requete, signal);
    }
    const messages = [...requete.messages];
    /* Recherches faites, rendues avec la réponse pour la trace sous la bulle. */
    const faites = [];
    /* Extraits trouvés, pour le dernier tour. */
    const extraits = [];
    const rendre = (reponse) => ({ ...reponse, texte: avecTableaux(Recherche.citations(reponse.texte), faites), recherches: faites });
    for (let tour = 0; tour < TOURS_MAX; tour++) {
        let reponse;
        try {
            reponse = await Albert.repondre({
                ...requete,
                messages: avecRappel(messages, cherche),
                tools: outils,
                tool_choice: cherche && tour === 0 ? 'required' : 'auto'
            }, signal);
        } catch (err) {
            /* Repli sans outils pour un modèle qui les refuse. Réseau, relais, délai, arrêt, clé
               ou quota échoueraient pareil : l'erreur remonte telle quelle. */
            if (!err.status || [401, 403, 429, 502, 503, 504].includes(err.status)) {
                throw err;
            }
            if (cherche) {
                toast(t('toast.recherche-indisponible'));
            }
            return rendre(await Albert.repondre({ ...requete, messages: avecDate(messages) }, signal));
        }
        const appels = (reponse.message && reponse.message.tool_calls) || [];
        if (!appels.length) {
            return rendre(reponse);
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
    return rendre(await Albert.repondre({ ...requete, messages: dernier }, signal));
}

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = { avecRappel, avecTableaux, executerOutil, repondreAvecOutils };
}
