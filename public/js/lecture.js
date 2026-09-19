/*
 * lecture.js
 * Lecture à voix haute des réponses (API Web Speech).
 *
 * Utilise d'abord une voix installée sur l'appareil. Une voix en ligne envoie
 * le texte à un tiers : elle ne sert que si l'utilisateur l'autorise.
 * Idées reprises d'albert-atelier, code réécrit. Appelé par affichage.js.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

const Lecture = {
    /* Motifs composés avant les symboles simples : l'ordre compte. */
    FORMULES: [
        [/\\ce\s*\{([^}]*)\}/g, ' $1 '],
        [/\\d?frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, ' $1 sur $2 '],
        [/\\sqrt\s*\[([^\]]*)\]\s*\{([^}]*)\}/g, ' racine $1-ième de $2 '],
        [/\\sqrt\s*\{([^}]*)\}/g, ' racine carrée de $1 '],
        [/\^\s*\{?2\}?(?!\d)/g, ' au carré '],
        [/\^\s*\{?3\}?(?!\d)/g, ' au cube '],
        [/\^\s*\{([^}]*)\}/g, ' puissance $1 '],
        [/\^\s*(\w)/g, ' puissance $1 '],
        [/_\s*\{([^}]*)\}/g, ' indice $1 '],
        [/_\s*(\w)/g, ' indice $1 '],
        [/\\(times|cdot)/g, ' fois '],
        [/\\div/g, ' divisé par '],
        [/\\pm/g, ' plus ou moins '],
        [/\\(leq|le)\b/g, ' inférieur ou égal à '],
        [/\\(geq|ge)\b/g, ' supérieur ou égal à '],
        [/\\(neq|ne)\b/g, ' différent de '],
        [/\\approx/g, ' environ égal à '],
        [/\\infty/g, ' infini '],
        [/\\(rightarrow|to|longrightarrow)\b/g, ' donne '],
        [/->/g, ' donne '],
        [/</g, ' inférieur à '],
        [/>/g, ' supérieur à '],
        [/=/g, ' égale '],
        [/\\(alpha|beta|gamma|delta|pi|theta|lambda|mu|sigma|omega)\b/g, ' $1 '],
        [/\\[a-zA-Z]+/g, ' '],
        [/[{}\\]/g, ' ']
    ],

    /** Autorise les voix en ligne (réglage de l'utilisateur). */
    enLigne: false,

    /** Bouton de la lecture en cours, ou null. */
    _bouton: null,

    /**
     * Traduit une formule LaTeX en français parlé.
     *
     * @param {string} tex - Source LaTeX de la formule.
     * @returns {string} Texte à lire.
     */
    formuleParlee(tex) {
        let texte = tex;
        for (const [motif, remplacement] of this.FORMULES) {
            texte = texte.replace(motif, remplacement);
        }
        return texte.replace(/\s+/g, ' ').trim();
    },

    /**
     * Lit 1er, 2de, 3e comme des ordinaux. "2 de ces" n'est pas touché.
     *
     * @param {string} texte - Texte à transformer.
     * @returns {string} Texte avec les ordinaux en toutes lettres.
     */
    ordinaux(texte) {
        return texte
            .replace(/\b1(?:er|ère|re)\b/gi, 'premier')
            .replace(/\b2(?:nde|de|nd)\b/gi, 'seconde')
            .replace(/\b(\d+)(?:ème|e)\b/gi, '$1ième');
    },

    /**
     * Coupe le texte en morceaux courts, aux fins de phrase.
     *
     * Certaines voix s'arrêtent au milieu d'un texte long.
     *
     * @param {string} texte - Texte complet.
     * @param {number} max - Longueur visée d'un morceau, en caractères.
     * @returns {string[]} Morceaux à lire dans l'ordre.
     */
    decouper(texte, max) {
        const phrases = texte.match(/[^.!?]+[.!?]*\s*/g) || [];
        const morceaux = [];
        let courant = '';
        for (const phrase of phrases) {
            if (courant && (courant + phrase).length > max) {
                morceaux.push(courant.trim());
                courant = '';
            }
            courant += phrase;
        }
        if (courant.trim()) {
            morceaux.push(courant.trim());
        }
        return morceaux;
    },

    /**
     * Texte à lire pour une réponse affichée.
     *
     * Les formules sont traduites ; le code et les diagrammes sont sautés.
     *
     * @param {HTMLElement} element - Contenu rendu de la réponse.
     * @returns {string} Texte à lire.
     */
    texte(element) {
        const copie = element.cloneNode(true);
        copie.querySelectorAll('pre, .diagramme, button').forEach(el => el.remove());
        copie.querySelectorAll('.katex').forEach(el => {
            const tex = el.querySelector('annotation[encoding="application/x-tex"]');
            el.replaceWith(' ' + (tex ? this.formuleParlee(tex.textContent) : '') + ' ');
        });
        /* Une pause après chaque bloc et chaque cellule. */
        copie.querySelectorAll('p, li, h1, h2, h3, h4, blockquote, tr').forEach(el => el.append('. '));
        copie.querySelectorAll('td, th').forEach(el => el.append(', '));
        return this.ordinaux(copie.textContent)
            .replace(/&/g, ' et ')
            .replace(/\s+/g, ' ')
            .replace(/\s+([.,!?])/g, '$1')
            .replace(/([.!?])(\s*[.,])+/g, '$1')
            .trim();
    },

    /**
     * Choisit la voix française à utiliser.
     *
     * @returns {?SpeechSynthesisVoice} Voix locale, sinon voix en ligne si autorisée, sinon null.
     */
    voix() {
        const francaises = speechSynthesis.getVoices().filter(v => v.lang.startsWith('fr'));
        const locales = francaises.filter(v => v.localService);
        /* eSpeak en dernier : sa voix est peu naturelle. */
        const locale = locales.find(v => !/espeak/i.test(v.name)) || locales[0];
        if (locale) {
            return locale;
        }
        if (this.enLigne) {
            return francaises[0] || null;
        }
        return null;
    },

    /**
     * Indique si une lecture est possible dans ce navigateur.
     *
     * @returns {boolean} true si une voix utilisable existe.
     */
    disponible() {
        return typeof speechSynthesis !== 'undefined' && this.voix() !== null;
    },

    /**
     * Arrête la lecture en cours et prévient son bouton.
     */
    arreter() {
        speechSynthesis.cancel();
        if (this._bouton) {
            this._bouton.dispatchEvent(new Event('lecture-fin'));
        }
        this._bouton = null;
    },

    /**
     * Lance ou arrête la lecture d'une réponse. Une seule lecture à la fois.
     *
     * Le bouton reçoit les évènements "lecture-debut" et "lecture-fin".
     *
     * @param {HTMLButtonElement} bouton - Bouton cliqué.
     * @param {HTMLElement} element - Contenu rendu de la réponse.
     */
    basculer(bouton, element) {
        const memeBouton = this._bouton === bouton;
        this.arreter();
        if (memeBouton) {
            return;
        }
        const voix = this.voix();
        const morceaux = this.decouper(this.texte(element), 250);
        if (!voix || !morceaux.length) {
            return;
        }
        this._bouton = bouton;
        bouton.dispatchEvent(new Event('lecture-debut'));

        const finir = () => {
            if (this._bouton === bouton) {
                this.arreter();
            }
        };
        morceaux.forEach((morceau, i) => {
            const enonce = new SpeechSynthesisUtterance(morceau);
            enonce.voice = voix;
            enonce.lang = voix.lang;
            enonce.rate = 0.95;
            if (i === morceaux.length - 1) {
                enonce.onend = finir;
            }
            enonce.onerror = finir;
            speechSynthesis.speak(enonce);
        });
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Lecture;
}
