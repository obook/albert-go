/*
 * rendu.js
 * Affichage des réponses : Markdown, formules et diagrammes.
 *
 * Marked transforme le Markdown en HTML, KaTeX affiche les formules,
 * Mermaid dessine les diagrammes (chargé seulement au premier diagramme).
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
        for (const motif of motifs) {
            texte = texte.replace(motif, (formule) => {
                const numero = formules.push(formule) - 1;
                return 'FORMULEKATEX' + numero + 'FIN';
            });
        }
        const html = marked.parse(texte).replace(/FORMULEKATEX(\d+)FIN/g, (_, numero) => formules[Number(numero)]);
        return this.assainir(html);
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
        modele.content.querySelectorAll('script, style, iframe, object, embed, link, meta, base, form, input, button, textarea, svg')
            .forEach((el) => el.remove());
        modele.content.querySelectorAll('*').forEach((el) => {
            for (const attr of [...el.attributes]) {
                const nom = attr.name.toLowerCase();
                if (nom.startsWith('on') || nom === 'style' || this.urlDangereuse(nom, attr.value)) {
                    el.removeAttribute(attr.name);
                }
            }
        });
        modele.content.querySelectorAll('a[href]').forEach((a) => {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        });
        return modele.innerHTML;
    },

    /**
     * Nettoie le SVG rendu par Mermaid.
     *
     * assainir() retire les <svg> entiers : il ne peut pas servir ici. Le
     * mode strict de Mermaid empêche déjà le HTML dans les étiquettes, mais
     * le dépôt ne met aucun contenu issu du modèle dans le DOM sans passage
     * par une sanitisation à lui.
     *
     * @param {string} svg - SVG rendu par Mermaid.
     * @returns {string} SVG sans script, sans HTML embarqué ni gestionnaire.
     */
    assainirSvg(svg) {
        if (typeof document === 'undefined') {
            return svg;
        }
        const modele = document.createElement('template');
        modele.innerHTML = svg;
        /* foreignObject rouvre la porte au HTML au milieu du SVG. */
        modele.content.querySelectorAll('script, foreignObject, iframe, object, embed')
            .forEach((el) => el.remove());
        modele.content.querySelectorAll('*').forEach((el) => {
            for (const attr of [...el.attributes]) {
                const nom = attr.name.toLowerCase();
                /* style reste : Mermaid s'en sert pour tout son rendu. */
                if (nom.startsWith('on') || this.urlDangereuse(nom, attr.value)) {
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
     * Affiche une réponse dans un élément : HTML, formules puis diagrammes.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @param {string} markdown - Texte de la réponse.
     * @returns {Promise<void>} Terminée quand les diagrammes sont dessinés.
     */
    async afficher(element, markdown) {
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
        await this.diagrammes(element);
    },

    /**
     * Remplace les blocs ```mermaid par leur diagramme.
     *
     * Un diagramme invalide reste affiché comme bloc de code.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @returns {Promise<void>}
     */
    async diagrammes(element) {
        /* Marked garde la casse : ```Mermaid donne language-Mermaid. */
        const blocs = [...element.querySelectorAll('pre > code')]
            .filter((code) => /(^|\s)language-mermaid(\s|$)/i.test(code.className));
        if (!blocs.length) {
            return;
        }
        try {
            await this.chargerMermaid();
        } catch (err) {
            return;
        }
        for (const bloc of blocs) {
            try {
                const id = 'mermaid-' + Math.random().toString(36).slice(2);
                const { svg } = await mermaid.render(id, bloc.textContent);
                const conteneur = document.createElement('div');
                conteneur.className = 'diagramme';
                conteneur.innerHTML = this.assainirSvg(svg);
                bloc.parentElement.replaceWith(conteneur);
            } catch (err) {
                /* Diagramme invalide : le code reste affiché. */
            }
        }
    },

    /**
     * Charge Mermaid (3,5 Mo) une seule fois, à la demande.
     *
     * @returns {Promise<void>} Résolue quand Mermaid est prêt.
     */
    chargerMermaid() {
        if (!this._mermaid) {
            this._mermaid = new Promise((resoudre, rejeter) => {
                const script = document.createElement('script');
                script.src = 'vendor/mermaid/mermaid.min.js';
                script.onload = () => {
                    /* Thème clair : .diagramme a toujours un fond blanc. */
                    mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
                    resoudre();
                };
                script.onerror = rejeter;
                document.head.append(script);
            });
        }
        return this._mermaid;
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Rendu;
}
