/*
 * rendu.js
 * Affichage des réponses : Markdown, formules et diagrammes.
 *
 * Marked transforme le Markdown en HTML, KaTeX affiche les formules,
 * Mermaid dessine les diagrammes (chargé seulement au premier diagramme),
 * les blocs ```svg du modèle s'affichent après nettoyage.
 * highlight.js colore le code (chargé au premier bloc de code).
 * Le HTML est assaini avant affichage : la réponse vient d'un modèle.
 * Logique reprise d'albert-board (render.js). Appelé par affichage.js.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

const Rendu = {
    /**
     * Transforme le Markdown d'une réponse en HTML assaini.
     *
     * Marked retire le backslash de \[ et \( : les formules sont mises
     * de côté avant Marked, puis remises en place.
     *
     * @param {string} markdown - Texte de la réponse.
     * @returns {string} HTML sûr à insérer.
     */
    versHtml(markdown) {
        const formules = [];
        const motifs = [
            /\\\[[\s\S]+?\\\]/g,
            /\$\$[\s\S]+?\$\$/g,
            /\\\([\s\S]+?\\\)/g,
            /\$[^\n$]+?\$/g
        ];
        let texte = markdown || '';
        const langue = typeof I18n !== 'undefined' ? I18n.langue : null;
        for (const motif of motifs) {
            texte = texte.replace(motif, (formule) => {
                const numero = formules.push(this.multiplication(formule, langue)) - 1;
                return 'FORMULEKATEX' + numero + 'FIN';
            });
        }
        const html = marked.parse(texte).replace(/FORMULEKATEX(\d+)FIN/g, (_, numero) => formules[Number(numero)]);
        return this.assainir(html);
    },

    /**
     * Signe de multiplication de l'école selon la langue : × en français, ⋅ en
     * allemand (Malpunkt). Entre deux vecteurs (\vec, \overrightarrow), le signe
     * reste : produit scalaire ⋅, produit vectoriel ×. Espagnol et anglais : inchangé.
     *
     * @param {string} formule - Formule LaTeX.
     * @param {?string} langue - Langue de l'interface.
     * @returns {string} Formule avec le signe de la langue.
     */
    multiplication(formule, langue) {
        const vecteur = '(?![a-zA-Z])(?!\\s*\\\\(?:vec|overrightarrow)\\b)';
        if (langue === 'fr') {
            return formule.replace(new RegExp('\\\\cdot' + vecteur, 'g'), '\\times');
        }
        if (langue === 'de') {
            return formule.replace(new RegExp('\\\\times' + vecteur, 'g'), '\\cdot');
        }
        return formule;
    },

    /** Balises retirées du HTML du modèle : tout ce qui charge ou exécute. */
    BALISES_INTERDITES: 'script, style, iframe, object, embed, link, meta, base, form, input, button, textarea, svg',

    /** Balises retirées d'un SVG : le style y sert au rendu, il reste. */
    BALISES_INTERDITES_SVG: 'script, foreignObject, iframe, object, embed',

    /** SVG écrit par le modèle : ni <style>, qui déborde sur la page, ni animation, qui réécrit un href. */
    BALISES_INTERDITES_SVG_MODELE: 'script, foreignObject, iframe, object, embed, style, animate, set',

    /**
     * Indique si un attribut doit être retiré du HTML du modèle.
     *
     * @param {string} nom - Nom de l'attribut, en minuscules.
     * @param {string} valeur - Valeur de l'attribut.
     * @returns {boolean} true pour un gestionnaire, un style ou une adresse exécutable.
     */
    attributInterdit(nom, valeur) {
        return nom.startsWith('on') || nom === 'style' || this.urlDangereuse(nom, valeur);
    },

    /**
     * Retire du HTML tout ce qui peut exécuter du code.
     *
     * Marked laisse passer le HTML brut, et un modèle peut être piégé
     * par le texte qu'on lui donne.
     *
     * @param {string} html - HTML produit par Marked.
     * @returns {string} HTML sans script, gestionnaire ni lien dangereux.
     */
    assainir(html) {
        if (typeof document === 'undefined') {
            return html;
        }
        /* <template> est inerte : rien ne se charge ni ne s'exécute pendant l'analyse. */
        const modele = document.createElement('template');
        modele.innerHTML = html;
        modele.content.querySelectorAll(this.BALISES_INTERDITES).forEach((el) => el.remove());
        modele.content.querySelectorAll('*').forEach((el) => {
            for (const attr of [...el.attributes]) {
                if (this.attributInterdit(attr.name.toLowerCase(), attr.value)) {
                    el.removeAttribute(attr.name);
                }
            }
        });
        /* Image externe du modèle : un simple lien, rien ne se charge sans nous. */
        modele.content.querySelectorAll('img[src^="http"]').forEach((img) => {
            const lien = document.createElement('a');
            lien.href = img.getAttribute('src');
            lien.textContent = img.getAttribute('alt') || img.getAttribute('src');
            img.replaceWith(lien);
        });
        modele.content.querySelectorAll('a[href]').forEach((a) => {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            /* Adresse brute : raccourcie, l'adresse complète en info-bulle. */
            const href = a.getAttribute('href');
            if ([href, this.decoder(href)].includes(a.textContent.trim())) {
                a.title = href;
                a.textContent = this.lienCourt(href);
            }
        });
        return modele.innerHTML;
    },

    /** Adresse décodée, ou telle quelle si un % est mal formé. */
    decoder(adresse) {
        try {
            return decodeURIComponent(adresse);
        } catch (err) {
            return adresse;
        }
    },

    /**
     * Adresse raccourcie : le site, puis la fin du chemin.
     *
     * @param {string} adresse - Adresse complète.
     * @returns {string} Ex. "fr.wikipedia.org › Château_de_Versailles".
     */
    lienCourt(adresse) {
        let url;
        try {
            url = new URL(adresse);
        } catch (err) {
            return adresse;
        }
        const site = url.hostname.replace(/^www\./, '');
        let fin = this.decoder(url.pathname.split('/').filter(Boolean).pop() || '');
        if (fin.length > 40) {
            fin = fin.slice(0, 40) + '...';
        }
        return fin ? site + ' › ' + fin : site;
    },

    /**
     * Nettoie un SVG : celui de Mermaid, ou celui du modèle.
     *
     * assainir() retire les <svg> entiers : il ne peut pas servir ici. Le
     * mode strict de Mermaid empêche déjà le HTML dans les étiquettes, mais
     * le dépôt ne met aucun contenu issu du modèle dans le DOM sans passage
     * par une sanitisation à lui.
     *
     * @param {string} svg - SVG à nettoyer.
     * @param {string} [interdites] - Balises à retirer.
     * @returns {string} SVG sans script, sans HTML embarqué ni gestionnaire.
     */
    assainirSvg(svg, interdites = this.BALISES_INTERDITES_SVG) {
        if (typeof document === 'undefined') {
            return svg;
        }
        const modele = document.createElement('template');
        modele.innerHTML = svg;
        /* foreignObject rouvre la porte au HTML au milieu du SVG. */
        modele.content.querySelectorAll(interdites).forEach((el) => el.remove());
        modele.content.querySelectorAll('*').forEach((el) => {
            const nom = (attr) => attr.name.toLowerCase();
            for (const attr of [...el.attributes]) {
                /* style reste : Mermaid s'en sert pour tout son rendu. */
                if (nom(attr).startsWith('on') || this.urlDangereuse(nom(attr), attr.value)) {
                    el.removeAttribute(attr.name);
                }
            }
        });
        return modele.innerHTML;
    },

    /**
     * Indique si un attribut contient une adresse qui exécute du code.
     *
     * @param {string} nom - Nom de l'attribut, en minuscules.
     * @param {string} valeur - Valeur de l'attribut.
     * @returns {boolean} true pour javascript:, vbscript: et les data: autres qu'une image.
     */
    urlDangereuse(nom, valeur) {
        if (!['href', 'src', 'xlink:href', 'action', 'formaction', 'srcset'].includes(nom)) {
            return false;
        }
        /* Le navigateur ignore espaces, caractères de contrôle et tirets dans
           le schéma : "java-script:" s'exécute comme "javascript:". */
        const url = valeur.replace(/[\s -]/g, '').toLowerCase();
        if (/^(javascript|vbscript):/.test(url)) {
            return true;
        }
        if (!url.startsWith('data:')) {
            return false;
        }
        return !url.startsWith('data:image/') || url.startsWith('data:image/svg');
    },

    /**
     * Formule centrée plus large que la bulle : réduite jusqu'aux trois quarts ;
     * au-delà, redessinée en ligne pour aller à la ligne après les signes =.
     * Sur téléphone, le défilement horizontal d'une formule ne répondait pas au doigt.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     */
    ajusterFormules(element) {
        for (const bloc of element.querySelectorAll('.katex-display')) {
            const formule = bloc.querySelector('.katex');
            const largeur = bloc.clientWidth;
            if (!formule || !largeur || formule.scrollWidth <= largeur) {
                continue;
            }
            const echelle = largeur / formule.scrollWidth;
            if (echelle >= 0.75) {
                formule.style.fontSize = echelle + 'em';
                continue;
            }
            const tex = bloc.querySelector('annotation');
            if (tex && typeof katex !== 'undefined') {
                bloc.className = 'formule-longue';
                katex.render(tex.textContent, bloc, { displayMode: false, throwOnError: false });
            }
        }
    },

    /**
     * Affiche une réponse dans un élément : HTML, formules, code, diagrammes.
     * Chaque bloc de code restant reçoit un bouton de copie.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @param {string} markdown - Texte de la réponse.
     * @param {boolean} [images] - true si la réponse a cherché des images Commons.
     * @returns {Promise<void>} Terminée quand code et diagrammes sont prêts.
     */
    async afficher(element, markdown, images = false) {
        element.innerHTML = this.versHtml(markdown);
        renderMathInElement(element, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '\\[', right: '\\]', display: true },
                { left: '\\(', right: '\\)', display: false },
                { left: '$', right: '$', display: false }
            ],
            throwOnError: false
        });
        /* Mesure au prochain dessin : une bulle rouverte n'est pas encore dans la page. */
        requestAnimationFrame(() => this.ajusterFormules(element));
        await Promise.all([this.colorerCode(element), this.diagrammes(element), this.imagesCommons(element, images)]);
        for (const pre of element.querySelectorAll('pre')) {
            const bloc = document.createElement('div');
            bloc.className = 'bloc-code';
            pre.replaceWith(bloc);
            bloc.append(pre, boutonCopier(pre.textContent, t('reponse.copier-code'), t('toast.code-copie')));
        }
    },

    /**
     * Colore les blocs de code dont highlight.js connaît le langage.
     * Sans langage indiqué, le bloc reste tel quel.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @returns {Promise<void>}
     */
    async colorerCode(element) {
        const blocs = element.querySelectorAll('pre > code[class*="language-"]');
        if (!blocs.length) {
            return;
        }
        try {
            await this.chargerScript('vendor/highlight/highlight.min.js');
        } catch (err) {
            return;
        }
        for (const bloc of blocs) {
            const langue = bloc.className.match(/language-(\S+)/)[1];
            if (hljs.getLanguage(langue)) {
                hljs.highlightElement(bloc);
            }
        }
    },

    /**
     * Texte réduit à a-z, 0-9 et des tirets, sans accents : rien que
     * Windows refuse. Coupé entre deux mots au-delà de max caractères.
     *
     * @param {string} texte - Texte d'origine.
     * @param {number} max - Longueur maximale.
     * @returns {string} Mots séparés par des tirets, ou ''.
     */
    motsFichier(texte, max) {
        let mots = texte.replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (mots.length > max) {
            mots = mots.slice(0, max + 1);
            mots = mots.slice(0, mots.lastIndexOf('-') > 0 ? mots.lastIndexOf('-') : max);
        }
        return mots;
    },

    /**
     * Charge un script de vendor/ une seule fois, à la demande.
     *
     * @param {string} adresse - Chemin du script.
     * @returns {Promise<void>} Résolue quand le script est chargé.
     */
    chargerScript(adresse) {
        this._scripts ??= {};
        this._scripts[adresse] ??= new Promise((resoudre, rejeter) => {
            const script = document.createElement('script');
            script.src = adresse;
            script.onload = resoudre;
            script.onerror = rejeter;
            document.head.append(script);
        });
        return this._scripts[adresse];
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Rendu;
    globalThis.Rendu = Rendu;
    require('./rendu/diagrammes.js');
    require('./rendu/images.js');
}
