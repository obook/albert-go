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
     * Le code et les diagrammes sont sautés. En français, les formules et
     * les ordinaux sont dits en toutes lettres ; dans une autre langue
     * (réponse de Traduire), les formules sont sautées.
     *
     * @param {HTMLElement} element - Contenu rendu de la réponse.
     * @param {string} [langue] - Code de la langue du texte ("fr", "ru"...).
     * @returns {string} Texte à lire.
     */
    texte(element, langue = 'fr') {
        const francais = langue === 'fr';
        const copie = element.cloneNode(true);
        copie.querySelectorAll('pre, .diagramme, button').forEach(el => el.remove());
        copie.querySelectorAll('.katex').forEach(el => {
            const tex = el.querySelector('annotation[encoding="application/x-tex"]');
            const parle = tex && francais ? this.formuleParlee(tex.textContent) : '';
            el.replaceWith(' ' + parle + ' ');
        });
        /* Une pause après chaque bloc et chaque cellule. */
        copie.querySelectorAll('p, li, h1, h2, h3, h4, blockquote, tr').forEach(el => el.append('. '));
        copie.querySelectorAll('td, th').forEach(el => el.append(', '));
        let texte = copie.textContent;
        if (francais) {
            texte = this.ordinaux(texte).replace(/&/g, ' et ');
        }
        return texte
            .replace(/\s+/g, ' ')
            .replace(/\s+([.,!?])/g, '$1')
            .replace(/([.!?])(\s*[.,])+/g, '$1')
            .trim();
    },

    /**
     * Choisit la voix à utiliser pour une langue.
     *
     * @param {string} [langue] - Code de langue ("fr", "ru"...).
     * @returns {?SpeechSynthesisVoice} Voix locale, sinon voix en ligne si autorisée, sinon null.
     */
    voix(langue = 'fr') {
        /* Les navigateurs écrivent "ru-RU" ou "ru_RU". */
        const deLaLangue = speechSynthesis.getVoices()
            .filter(v => v.lang.toLowerCase().replace('_', '-').split('-')[0] === langue);
        const locales = deLaLangue.filter(v => v.localService);
        /* eSpeak en dernier : sa voix est peu naturelle. */
        const locale = locales.find(v => !/espeak/i.test(v.name)) || locales[0];
        if (locale) {
            return locale;
        }
        if (this.enLigne) {
            return deLaLangue[0] || null;
        }
        return null;
    },

    /**
     * Attend que la liste des voix soit chargée.
     *
     * Chrome Android renvoie une liste vide tant que l'évènement
     * "voiceschanged" n'est pas arrivé. On l'attend, 2 secondes au plus.
     *
     * @returns {Promise<void>}
     */
    voixPretes() {
        if (speechSynthesis.getVoices().length) {
            return Promise.resolve();
        }
        return new Promise(resoudre => {
            let minuteur = null;
            const fin = () => {
                clearTimeout(minuteur);
                speechSynthesis.removeEventListener('voiceschanged', fin);
                resoudre();
            };
            speechSynthesis.addEventListener('voiceschanged', fin);
            minuteur = setTimeout(fin, 2000);
        });
    },

    /**
     * Indique si une lecture est possible dans cette langue.
     *
     * @param {string} [langue] - Code de langue ("fr", "ru"...).
     * @returns {boolean} true si une voix utilisable existe.
     */
    disponible(langue = 'fr') {
        if (typeof speechSynthesis === 'undefined') {
            return false;
        }
        return this.voix(langue) !== null || this.voixSysteme();
    },

    /**
     * Cas de Chrome Android : liste des voix vide, mais lecture possible avec
     * la voix du système. On ignore alors si elle est locale ou en ligne :
     * seulement si l'utilisateur autorise les voix en ligne.
     *
     * @returns {boolean} true si on peut lire avec la voix du système.
     */
    voixSysteme() {
        return this.enLigne && speechSynthesis.getVoices().length === 0;
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
     * @param {string} [langue] - Code de la langue du texte ("fr", "ru"...).
     */
    basculer(bouton, element, langue = 'fr') {
        const memeBouton = this._bouton === bouton;
        this.arreter();
        if (memeBouton) {
            return;
        }
        const voix = this.voix(langue);
        const morceaux = this.decouper(this.texte(element, langue), 250);
        if ((!voix && !this.voixSysteme()) || !morceaux.length) {
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
            if (voix) {
                enonce.voice = voix;
                enonce.lang = voix.lang;
            } else {
                /* Voix du système : on donne seulement la langue. */
                enonce.lang = langue;
            }
            enonce.rate = 0.95;
            if (i === morceaux.length - 1) {
                enonce.onend = finir;
            }
            enonce.onerror = finir;
            speechSynthesis.speak(enonce);
        });
    }
};

/* Lance le chargement des voix dès l'ouverture (Chrome Android les charge en différé). */
if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.getVoices();
}

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Lecture;
}
