// Lecture à voix haute des réponses (API Web Speech), idées reprises d'albert-atelier.
'use strict';

const Lecture = {
    // Remplacements dans l'ordre : les motifs composés avant les symboles simples.
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

    formuleParlee(tex) {
        let texte = tex;
        for (const [motif, remplacement] of this.FORMULES) texte = texte.replace(motif, remplacement);
        return texte.replace(/\s+/g, ' ').trim();
    },

    // 1er, 2de, 3e, 4ème : lus comme des ordinaux. Suffixe collé au nombre ("2 de ces" reste intact).
    ordinaux(texte) {
        return texte
            .replace(/\b1(?:er|ère|re)\b/gi, 'premier')
            .replace(/\b2(?:nde|de|nd)\b/gi, 'seconde')
            .replace(/\b(\d+)(?:ème|e)\b/gi, '$1ième');
    },

    // Morceaux courts, coupés aux fins de phrase : certaines voix s'arrêtent sur un texte long.
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
        if (courant.trim()) morceaux.push(courant.trim());
        return morceaux;
    },

    // Texte à lire depuis la carte rendue : formules traduites, code et diagrammes omis.
    texte(element) {
        const copie = element.cloneNode(true);
        copie.querySelectorAll('pre, .diagramme, button').forEach(el => el.remove());
        copie.querySelectorAll('.katex').forEach(el => {
            const tex = el.querySelector('annotation[encoding="application/x-tex"]');
            el.replaceWith(' ' + (tex ? this.formuleParlee(tex.textContent) : '') + ' ');
        });
        copie.querySelectorAll('p, li, h1, h2, h3, h4, blockquote, tr').forEach(el => el.append('. '));
        copie.querySelectorAll('td, th').forEach(el => el.append(', '));
        const texte = this.ordinaux(copie.textContent)
            .replace(/&/g, ' et ')
            .replace(/\s+/g, ' ')
            .replace(/\s+([.,!?])/g, '$1')
            .replace(/([.!?])(\s*[.,])+/g, '$1')
            .trim();
        return texte;
    },

    // Voix en ligne (le texte lu part chez Google, Microsoft...) : seulement si l'utilisateur l'autorise.
    enLigne: false,

    // Voix installée sur l'appareil d'abord ; voix en ligne en dernier recours, si autorisée.
    voix() {
        const francaises = speechSynthesis.getVoices().filter(v => v.lang.startsWith('fr'));
        const locales = francaises.filter(v => v.localService);
        const locale = locales.find(v => !/espeak/i.test(v.name)) || locales[0];
        if (locale) return locale;
        return this.enLigne ? francaises[0] || null : null;
    },

    disponible() {
        return typeof speechSynthesis !== 'undefined' && this.voix() !== null;
    },

    _bouton: null,

    arreter() {
        speechSynthesis.cancel();
        if (this._bouton) this._bouton.dispatchEvent(new Event('lecture-fin'));
        this._bouton = null;
    },

    // Un clic lit, un second clic arrête. Une seule lecture à la fois.
    basculer(bouton, element) {
        const memeBouton = this._bouton === bouton;
        this.arreter();
        if (memeBouton) return;
        const voix = this.voix();
        const morceaux = this.decouper(this.texte(element), 250);
        if (!voix || !morceaux.length) return;
        this._bouton = bouton;
        bouton.dispatchEvent(new Event('lecture-debut'));
        morceaux.forEach((morceau, i) => {
            const enonce = new SpeechSynthesisUtterance(morceau);
            enonce.voice = voix;
            enonce.lang = voix.lang;
            enonce.rate = 0.95;
            if (i === morceaux.length - 1) enonce.onend = () => { if (this._bouton === bouton) this.arreter(); };
            enonce.onerror = () => { if (this._bouton === bouton) this.arreter(); };
            speechSynthesis.speak(enonce);
        });
    }
};

if (typeof module !== 'undefined') {
    module.exports = Lecture;
}
