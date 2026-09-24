/*
 * rendu.js
 * Affichage des réponses : Markdown, formules et diagrammes.
 *
 * Marked transforme le Markdown en HTML, KaTeX affiche les formules,
 * Mermaid dessine les diagrammes (chargé seulement au premier diagramme),
 * les blocs ```svg du modèle s'affichent après nettoyage.
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
        modele.content.querySelectorAll('a[href]').forEach((a) => {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        });
        return modele.innerHTML;
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
     * Remplace les blocs ```svg et ```mermaid par leur dessin.
     *
     * Un dessin invalide reste affiché comme bloc de code.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @returns {Promise<void>}
     */
    async diagrammes(element) {
        /* Marked garde la casse : ```Mermaid donne language-Mermaid. */
        const blocs = (langue) => [...element.querySelectorAll('pre > code')]
            .filter((code) => new RegExp('(^|\\s)language-' + langue + '(\\s|$)', 'i').test(code.className));
        for (const bloc of blocs('svg')) {
            this.remplacerBloc(bloc, this.assainirSvg(bloc.textContent, this.BALISES_INTERDITES_SVG_MODELE));
        }
        const mermaids = blocs('mermaid');
        if (!mermaids.length) {
            return;
        }
        try {
            await this.chargerMermaid();
        } catch (err) {
            return;
        }
        const dessiner = (code) => mermaid.render('mermaid-' + Math.random().toString(36).slice(2), code);
        for (const bloc of mermaids) {
            const code = this.chimieMermaid(bloc.textContent);
            try {
                const { svg } = await dessiner(code).catch(() => dessiner(this.reparerMermaid(code)));
                this.remplacerBloc(bloc, this.assainirSvg(svg));
            } catch (err) {
                /* Diagramme invalide même réparé : le code reste affiché. */
            }
        }
    },

    /**
     * Écrit chaque \ce{...} d'un diagramme en texte : C₃H₈O₃, SO₄²⁻.
     *
     * Mermaid n'a pas mhchem : \ce{C3H8O3} s'afficherait tel quel. Les
     * accolades sont comptées, car \ce{I = \frac{V}{R}} en contient
     * d'autres. Un \ce{ jamais refermé reste intact. Repris d'albert-board.
     *
     * @param {string} code - Code Mermaid.
     * @returns {string} Code sans \ce.
     */
    chimieMermaid(code) {
        const exposants = { '+': '⁺', '-': '⁻' };
        let sortie = '';
        let debut;
        while ((debut = code.indexOf('\\ce{')) !== -1) {
            let fin = debut + 3;
            let profondeur = 0;
            do {
                profondeur += { '{': 1, '}': -1 }[code[fin]] || 0;
                fin++;
            } while (profondeur && fin < code.length);
            if (profondeur) {
                break;
            }
            const formule = code.slice(debut + 4, fin - 1)
                .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
                .replace(/\\[a-zA-Z]+|[{}]/g, '')
                .replace(/\^([0-9+-]+)/g, (_, charge) => charge.replace(/./g, (c) => exposants[c] || '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]))
                .replace(/([A-Za-z)\]])(\d+)/g, (_, avant, nombre) => avant + nombre.replace(/\d/g, (c) => '₀₁₂₃₄₅₆₇₈₉'[c]));
            sortie += code.slice(0, debut) + formule;
            code = code.slice(fin);
        }
        return sortie + code;
    },

    /**
     * Corrige les fautes de syntaxe Mermaid fréquentes chez les modèles.
     *
     * Guillemets échappés \", flèches Unicode, fermeture ["..."} au lieu
     * de ["..."], étiquette vide [""] ou |""|, que Mermaid refuse : le nœud
     * reprend alors son identifiant. Enfin, A[Début (x)] : Mermaid y lit une
     * forme de nœud ; A["Début (x)"] passe. Les formes qui commencent par
     * une parenthèse, A[(base)], restent. Une ligne title "..." avant le
     * type de diagramme devient l'en-tête --- title: ... --- que Mermaid
     * attend. Repris en partie d'albert-board (render.js).
     *
     * @param {string} code - Code Mermaid refusé.
     * @returns {string} Code corrigé.
     */
    reparerMermaid(code) {
        return code
            .replace(/^\s*title\s+"?([^"\n]*?)"?\s*\n/, '---\ntitle: $1\n---\n')
            .replace(/\\"/g, '"')
            .replace(/[→⟶⇒⟹]/g, '-->')
            .replace(/\["([^"\n]*)"\}/g, '["$1"]')
            .replace(/(\[\[|\{\{|\(\(|\(\[|\[\(|\[|\(|\{)\s*(""|'')\s*(\]\]|\}\}|\)\)|\]\)|\)\]|\]|\)|\})/g, '')
            .replace(/\|\s*(""|'')\s*\|/g, '')
            .replace(/\[([^[\]"()]+\([^[\]"]*)\]/g, '["$1"]')
            .replace(/\{([^{}"()]+\([^{}"]*)\}/g, '{"$1"}')
            .replace(/\|([^|"]*[()][^|"]*)\|/g, '|"$1"|');
    },

    /**
     * Remplace un bloc de code par le premier <svg> d'un HTML déjà assaini.
     *
     * Seul le <svg> est gardé : le texte ou le HTML autour ne passe pas.
     * Un bouton enregistre le dessin en fichier .svg.
     *
     * @param {HTMLElement} bloc - Élément <code> du bloc.
     * @param {string} html - SVG assaini.
     */
    remplacerBloc(bloc, html) {
        const modele = document.createElement('template');
        modele.innerHTML = html;
        const svg = modele.content.querySelector('svg');
        if (!svg) {
            return;
        }
        const conteneur = document.createElement('div');
        conteneur.className = 'diagramme';
        const bouton = boutonAction(ICONES.telecharger, t('reponse.telecharger-figure'));
        bouton.addEventListener('click', () => {
            /* XMLSerializer ajoute le xmlns sans lequel le fichier ne s'ouvre pas. */
            const fichier = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
            const lien = document.createElement('a');
            lien.href = URL.createObjectURL(fichier);
            lien.download = 'figure.svg';
            lien.click();
            setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
        });
        conteneur.append(svg, bouton);
        bloc.parentElement.replaceWith(conteneur);
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
                    /* Thème clair : .diagramme a toujours un fond blanc. Sans
                       suppressErrorRendering, une erreur laisse sa bombe en haut de la page.
                       htmlLabels false : étiquettes en <text>, assainirSvg retire les foreignObject. */
                    mermaid.initialize({
                        startOnLoad: false,
                        theme: 'default',
                        securityLevel: 'strict',
                        suppressErrorRendering: true,
                        htmlLabels: false,
                        flowchart: { htmlLabels: false }
                    });
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
