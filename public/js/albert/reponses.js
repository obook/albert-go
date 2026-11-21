/*
 * albert/reponses.js
 * Lecture des réponses du modèle : variantes de Reformuler, langue de la réponse
 * pour la lecture à voix haute, trace de la calculatrice, schémas Mermaid à corriger.
 *
 * reponse.js affiche les réponses avec ces fonctions, lecture.js choisit la voix et
 * rendu/diagrammes.js fait corriger un schéma refusé.
 * Complète l'objet Albert d'albert.js, chargé avant lui.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Albert, {
    /* Mots outils les plus courants : de quoi reconnaître la langue d'une réponse de Chat. */
    MOTS_OUTILS: {
        fr: 'le la les des est et une un du de que qui dans pour pas vous nous je il au sur avec ce cette sont mais ou votre'.split(' '),
        en: 'the and is are of to in that it you for with this be was have not on will i would an my your'.split(' '),
        de: 'der die das und ist nicht ich sie mit zu den ein eine einen auf für es wir von dem'.split(' '),
        es: 'el la los las de que y es en un una por con para no se del al lo pero su como muy está'.split(' '),
        it: 'il di che è e la per un una non sono con del della gli le ho mi'.split(' '),
        pt: 'o a os as de que e é não um uma para com do da em no na você'.split(' '),
        nl: 'de het een en is van ik je niet dat op te zijn met voor wij u er'.split(' ')
    },

    /**
     * Demande au modèle de corriger un schéma Mermaid refusé.
     *
     * @param {string} modele - Alias du modèle.
     * @param {string} code - Code refusé.
     * @param {string} erreur - Message de Mermaid.
     * @returns {Object} Corps pour repondre.
     */
    demandeCorrectionMermaid(modele, code, erreur) {
        return {
            model: modele,
            temperature: 0,
            messages: [
                { role: 'system', content: t('mermaid.corriger') },
                { role: 'user', content: code + '\n\n' + erreur }
            ]
        };
    },

    /**
     * Code Mermaid d'une réponse, avec ou sans bloc ```mermaid autour.
     *
     * @param {string} texte - Réponse du modèle.
     * @returns {string} Code seul.
     */
    codeMermaid(texte) {
        const bloc = texte.match(/```[a-z]*\n([\s\S]*?)```/i);
        return (bloc ? bloc[1] : texte).trim();
    },

    /**
     * Sépare les variantes d'une réponse de Reformuler ("### Titre" puis le texte).
     *
     * @param {string} texte - Réponse du modèle.
     * @returns {?Array<{titre: string, texte: string}>} Les variantes, ou null
     *     si la réponse n'en contient pas au moins deux (on l'affiche alors d'un bloc).
     */
    decouperVariantes(texte) {
        const variantes = [];
        for (const bloc of texte.split(/^###[ \t]+/m).slice(1)) {
            const fin = bloc.indexOf('\n');
            const titre = (fin < 0 ? bloc : bloc.slice(0, fin)).trim();
            const corps = fin < 0 ? '' : bloc.slice(fin + 1).trim();
            if (titre && corps) {
                variantes.push({ titre: titre, texte: corps });
            }
        }
        if (variantes.length < 2) {
            return null;
        }
        return variantes;
    },

    /**
     * Ligne de l'outil calcul lisible sous la réponse : un tableau de
     * variations garde sa lecture, sans la consigne au modèle ni le LaTeX,
     * déjà affiché sous la réponse.
     *
     * @param {string} ligne - Ligne rendue au modèle, gardée dans les appels d'outils.
     * @returns {string} Texte de la note sous la calculatrice.
     */
    traceCalcul(ligne) {
        const debut = ligne.indexOf('$$');
        if (debut < 0) {
            return ligne;
        }
        /* Format de calcul.tableau : la lecture, la consigne au modèle sur la dernière ligne, puis le tableau. */
        let lecture = ligne.slice(0, debut).trimEnd().split('\n').slice(0, -1).join('\n').replace(/\\infty/g, '∞');
        /* Du plus intérieur vers l'extérieur : \frac{\sqrt{3}}{3}. */
        for (let avant = ''; avant !== lecture;) {
            avant = lecture;
            lecture = lecture.replace(/\\sqrt\{([^{}]*)\}/g, '√$1').replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2');
        }
        return lecture;
    },

    /**
     * Langue d'une réponse, pour la lire avec la bonne voix : par l'écriture,
     * sinon par ses mots outils. Dans le doute, la langue de l'interface.
     *
     * @param {string} texte - Réponse en Markdown ; le code ne compte pas.
     * @param {string} defaut - Langue de l'interface.
     * @returns {string} Code de langue ("es", "ru"...).
     */
    langueDuTexte(texte, defaut) {
        const prose = texte.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
        const lettres = (prose.match(/\p{L}/gu) || []).length;
        if (!lettres) {
            return defaut;
        }
        const part = motif => (prose.match(motif) || []).length / lettres;
        /* Des kana : japonais, même au milieu des idéogrammes. */
        if (part(/[\u3040-\u30ff]/g) > 0.1) {
            return 'ja';
        }
        for (const [code, motif] of [['zh', /\p{Script=Han}/gu], ['ru', /\p{Script=Cyrillic}/gu], ['ar', /\p{Script=Arabic}/gu]]) {
            if (part(motif) > 0.3) {
                return code;
            }
        }
        const mots = prose.toLowerCase().match(/\p{L}+/gu);
        const score = code => mots.filter(m => this.MOTS_OUTILS[code].includes(m)).length;
        let meilleure = defaut;
        for (const code of Object.keys(this.MOTS_OUTILS)) {
            if (score(code) > score(meilleure)) {
                meilleure = code;
            }
        }
        return score(meilleure) >= 2 ? meilleure : defaut;
    }
});
