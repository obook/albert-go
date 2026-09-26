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
     * Affiche une réponse dans un élément : HTML, formules, code, diagrammes.
     * Chaque bloc de code restant reçoit un bouton de copie.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @param {string} markdown - Texte de la réponse.
     * @returns {Promise<void>} Terminée quand code et diagrammes sont prêts.
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
        await Promise.all([this.colorerCode(element), this.diagrammes(element), this.imagesCommons(element)]);
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
     * Affiche au-dessus d'un lien vers Commons l'image qu'il désigne, avec son
     * crédit. Seulement si l'outil Images est activé : Wikimedia voit
     * alors l'adresse IP.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @returns {Promise<void>}
     */
    async imagesCommons(element) {
        if (!reglages.images) {
            return;
        }
        const vus = new Set();
        for (const lien of element.querySelectorAll('a[href]')) {
            const titre = Recherche.fichierCommons(lien.href);
            if (!titre || vus.has(titre)) {
                continue;
            }
            vus.add(titre);
            /* Image avant le lien : en tête du <li>, sinon avant le paragraphe. */
            const bloc = lien.closest('p, li');
            const placer = (noeud) => bloc && bloc.tagName === 'LI' ? bloc.prepend(noeud) : (bloc || lien).before(noeud);
            const lienSeul = bloc && bloc.textContent.trim() === lien.textContent.trim();
            const image = await Recherche.imageCommons(titre).catch(() => null)
                || await this.imageApprochee(titre).catch(() => null);
            if (!image) {
                const note = document.createElement('p');
                note.className = 'image-absente';
                note.textContent = t('reponse.image-absente');
                placer(note);
                continue;
            }
            const figure = document.createElement('figure');
            figure.className = 'image-commons';
            const img = document.createElement('img');
            img.src = image.src;
            img.alt = titre.replace(/^[^:]+:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ');
            const credit = document.createElement('a');
            credit.href = image.page;
            credit.target = '_blank';
            credit.rel = 'noopener noreferrer';
            /* Description en italique : elle contient souvent déjà des guillemets. Le lien mène à
               la page Commons : le nom du site ne sert que si rien d'autre n'est connu. */
            const reste = [image.auteur, image.licence].filter(Boolean).join(', ');
            if (image.description) {
                const description = document.createElement('i');
                description.textContent = image.description;
                credit.append(description, reste ? ', ' + reste : '');
            } else {
                credit.textContent = reste || 'Wikimedia Commons';
            }
            const legende = document.createElement('figcaption');
            legende.append(credit);
            /* Clic : l'image en taille réelle, dans un nouvel onglet. */
            const agrandir = document.createElement('a');
            agrandir.href = image.original;
            agrandir.target = '_blank';
            agrandir.rel = 'noopener noreferrer';
            agrandir.append(img);
            const cadre = document.createElement('div');
            cadre.className = 'cadre-image';
            cadre.append(agrandir);
            /* Un lien download vers un autre site ouvre l'image : on la récupère. */
            if (/^https:\/\/upload\.wikimedia\.org\//.test(image.original)) {
                const bouton = boutonAction(ICONES.telecharger, t('reponse.telecharger-image'));
                bouton.addEventListener('click', () => this.telechargerAvecAttente(bouton,
                    () => fetch(image.original).then((r) => {
                        if (!r.ok) {
                            throw new Error(r.status);
                        }
                        return r.blob();
                    }), this.nomImage(titre)));
                const boutons = document.createElement('div');
                boutons.className = 'boutons-figure';
                boutons.append(bouton);
                cadre.append(boutons);
            }
            figure.append(cadre, legende);
            placer(figure);
            /* Lien seul : le crédit mène à la même page, il ferait doublon. */
            if (lienSeul) {
                (bloc.tagName === 'LI' ? lien : bloc).remove();
            }
        }
    },

    /**
     * Remplace les blocs ```svg et ```mermaid par leur dessin.
     *
     * Un Mermaid refusé est corrigé par le modèle ; s'il reste faux, le
     * code s'affiche avec l'erreur de Mermaid en dessous.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @returns {Promise<void>}
     */
    async diagrammes(element) {
        /* Marked garde la casse : ```Mermaid donne language-Mermaid. */
        const blocs = (langue) => [...element.querySelectorAll('pre > code')]
            .filter((code) => new RegExp('(^|\\s)language-' + langue + '(\\s|$)', 'i').test(code.className));
        for (const bloc of blocs('svg')) {
            this.remplacerBloc(bloc, this.assainirSvg(bloc.textContent, this.BALISES_INTERDITES_SVG_MODELE), bloc.textContent);
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
            let erreur;
            try {
                const { svg } = await dessiner(code).catch((err) => {
                    erreur = err;
                    return dessiner(this.reparerMermaid(code));
                });
                this.remplacerBloc(bloc, this.assainirSvg(svg), code);
            } catch (err) {
                /* Invalide même réparé : le modèle corrige, une seule fois. */
                const message = erreur?.message ?? String(erreur);
                const note = document.createElement('p');
                note.className = 'erreur-diagramme';
                note.textContent = t('reponse.correction-diagramme');
                bloc.parentElement.after(note);
                try {
                    const { svg } = await dessiner(await this.corrigerMermaid(code, message));
                    note.remove();
                    this.remplacerBloc(bloc, this.assainirSvg(svg), code);
                } catch (err) {
                    /* Le code d'origine reste affiché, avec son erreur. */
                    note.textContent = t('reponse.erreur-diagramme') + message;
                }
            }
        }
    },

    /* ponytail: corrections gardées pour la session seulement ; un rechargement redemande. */
    _corrections: new Map(),

    /**
     * Code Mermaid corrigé par le modèle choisi, gardé pour ne pas redemander.
     *
     * @param {string} code - Code refusé.
     * @param {string} erreur - Message de Mermaid.
     * @returns {Promise<string>} Code corrigé.
     */
    corrigerMermaid(code, erreur) {
        if (!this._corrections.has(code)) {
            const demande = Albert.demandeCorrectionMermaid(modeleActuel().id, code, erreur);
            this._corrections.set(code, Albert.repondre(reglages.cle, demande, new AbortController().signal)
                .then((reponse) => Albert.codeMermaid(reponse.texte))
                .catch((err) => {
                    this._corrections.delete(code);
                    throw err;
                }));
        }
        return this._corrections.get(code);
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
     * Guillemets échappés \", flèches Unicode hors guillemets, fermeture
     * ["..."} au lieu de ["..."], étiquette vide [""] ou |""|, que Mermaid
     * refuse : le nœud reprend alors son identifiant. Enfin, A[Début (x)] :
     * Mermaid y lit une forme de nœud ; A["Début (x)"] passe. Les formes
     * qui commencent par une parenthèse, A[(base)], restent. Une ligne
     * title "..." avant le type de diagramme devient l'en-tête
     * --- title: ... --- que Mermaid attend. Une plage d'axe 0 --> 100
     * seule sur sa ligne rejoint son x-axis ou y-axis. A + B devient A & B
     * dans un flowchart. Repris en partie
     * d'albert-board (render.js).
     *
     * @param {string} code - Code Mermaid refusé.
     * @returns {string} Code corrigé.
     */
    reparerMermaid(code) {
        const corrige = code
            .replace(/^\s*title\s+"?([^"\n]*?)"?\s*\n/, '---\ntitle: $1\n---\n')
            .replace(/^(\s*[xy]-axis\b.*)\n\s*(-?[\d.]+\s*-->\s*-?[\d.]+\s*)$/gm, '$1 $2')
            .replace(/\\"/g, '"')
            .replace(/"[^"\n]*"|[→⟶⇒⟹]/g, (m) => m.length > 1 ? m : '-->')
            .replace(/\["([^"\n]*)"\}/g, '["$1"]')
            .replace(/(\[\[|\{\{|\(\(|\(\[|\[\(|\[|\(|\{)\s*(""|'')\s*(\]\]|\}\}|\)\)|\]\)|\)\]|\]|\)|\})/g, '')
            .replace(/\|\s*(""|'')\s*\|/g, '')
            .replace(/\[([^[\]"()]+\([^[\]"]*)\]/g, '["$1"]')
            .replace(/\{([^{}"()]+\([^{}"]*)\}/g, '{"$1"}')
            .replace(/\|([^|"]*[()][^|"]*)\|/g, '|"$1"|');
        /* Flowchart : A + B --> C, Mermaid n'accepte que A & B. */
        if (!/^\s*(flowchart|graph)\b/m.test(corrige)) {
            return corrige;
        }
        return corrige.replace(/"[^"\n]*"|([\w\])}])[ \t]*\+[ \t]*(?=\w)/g, (m, avant) => avant ? avant + ' & ' : m);
    },

    /**
     * Remplace un bloc de code par le premier <svg> d'un HTML déjà assaini.
     *
     * Seul le <svg> est gardé : le texte ou le HTML autour ne passe pas.
     * Un bouton enregistre le dessin en fichier .svg.
     *
     * @param {HTMLElement} bloc - Élément <code> du bloc.
     * @param {string} html - SVG assaini.
     * @param {string} code - Code du bloc, pour nommer le fichier.
     */
    remplacerBloc(bloc, html, code) {
        const modele = document.createElement('template');
        modele.innerHTML = html;
        const svg = modele.content.querySelector('svg');
        if (!svg) {
            return;
        }
        const conteneur = document.createElement('div');
        conteneur.className = 'diagramme';
        /* Nom calculé au clic : la bulle de la question est alors dans le fil. */
        const nom = (extension) => this.nomFigure(new Date(), extension, this.titreFigure(code) || this.questionAvant(conteneur));
        const boutonSvg = boutonAction(ICONES.svg, t('reponse.telecharger-figure'));
        boutonSvg.addEventListener('click', () => {
            /* XMLSerializer ajoute le xmlns sans lequel le fichier ne s'ouvre pas. */
            this.telecharger(new Blob([new XMLSerializer().serializeToString(this.svgAutonome(svg))], { type: 'image/svg+xml' }), nom('svg'));
        });
        const boutonPng = boutonAction(ICONES.png, t('reponse.telecharger-png'));
        boutonPng.addEventListener('click', () => this.telechargerAvecAttente(boutonPng, () => this.enPng(svg), nom('png')));
        const boutons = document.createElement('div');
        boutons.className = 'boutons-figure';
        boutons.append(boutonSvg, boutonPng);
        conteneur.append(svg, boutons);
        bloc.parentElement.replaceWith(conteneur);
    },

    /* Propriétés recopiées sur chaque élément du SVG enregistré. */
    STYLES_SVG: ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
        'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline'],

    /**
     * Copie d'un SVG sans <style>, que lisent mal Inkscape ou LibreOffice :
     * chaque élément porte ses couleurs.
     *
     * @param {SVGSVGElement} svg - Dessin affiché.
     * @returns {SVGSVGElement} Copie autonome.
     */
    svgAutonome(svg) {
        const copie = svg.cloneNode(true);
        const originaux = [svg, ...svg.querySelectorAll('*')];
        [copie, ...copie.querySelectorAll('*')].forEach((element, i) => {
            const calcule = getComputedStyle(originaux[i]);
            if (calcule.display === 'none') {
                element.setAttribute('display', 'none');
            }
            element.setAttribute('style', this.STYLES_SVG.map((nom) => nom + ':' + calcule.getPropertyValue(nom)).join(';'));
        });
        copie.querySelectorAll('style').forEach((style) => style.remove());
        /* Mermaid coupe les mots en <tspan> " mot" : sans preserve, Inkscape perd l'espace. */
        copie.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
        return copie;
    },

    /**
     * Dessine un SVG dans une image PNG, sur fond blanc comme à l'écran.
     *
     * Part de la taille propre du dessin (viewBox), pas de la taille
     * affichée : réduit à l'écran, un grand schéma donnait un PNG flou.
     * Trois fois plus grand, sans dépasser 4096 px de côté.
     *
     * @param {SVGSVGElement} svg - Dessin affiché.
     * @returns {Promise<Blob>} Image PNG.
     */
    async enPng(svg) {
        const cadre = svg.viewBox.baseVal;
        const affiche = svg.getBoundingClientRect();
        const largeur = (cadre && cadre.width) || affiche.width;
        const hauteur = (cadre && cadre.height) || affiche.height;
        const echelle = Math.min(3, 4096 / Math.max(largeur, hauteur));
        const width = Math.ceil(largeur * echelle);
        const height = Math.ceil(hauteur * echelle);
        /* Firefox ne dessine pas un SVG sans largeur ni hauteur. Le max-width
           de Mermaid briderait la taille demandée. */
        const copie = svg.cloneNode(true);
        copie.setAttribute('width', width);
        copie.setAttribute('height', height);
        copie.style.maxWidth = '';
        /* Hors de la page, le texte perdrait la police héritée. */
        copie.style.fontFamily = getComputedStyle(svg).fontFamily;
        /* Adresse data: : la CSP refuse les images blob:. */
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copie));
        await image.decode();
        const toile = document.createElement('canvas');
        toile.width = width;
        toile.height = height;
        const contexte = toile.getContext('2d');
        contexte.fillStyle = '#ffffff';
        contexte.fillRect(0, 0, toile.width, toile.height);
        contexte.drawImage(image, 0, 0, toile.width, toile.height);
        return new Promise((resoudre) => toile.toBlob(resoudre, 'image/png'));
    },

    /**
     * Nom d'une figure enregistrée : date locale, puis le sujet.
     *
     * Sujet nettoyé par motsFichier, 40 caractères au plus.
     *
     * @param {Date} date - Moment de l'enregistrement.
     * @param {string} extension - svg ou png.
     * @param {string} [sujet] - Titre du schéma ou question posée.
     * @returns {string} Nom du fichier, ex. 2026-09-26-01-45-12-reaction-acide-base.png.
     */
    nomFigure(date, extension, sujet = '') {
        const n = (x) => String(x).padStart(2, '0');
        const quand = date.getFullYear() + '-' + n(date.getMonth() + 1) + '-' + n(date.getDate())
            + '-' + n(date.getHours()) + '-' + n(date.getMinutes()) + '-' + n(date.getSeconds());
        return quand + '-' + (this.motsFichier(sujet, 40) || 'figure') + '.' + extension;
    },

    /**
     * Nom d'une image de Commons enregistrée : son nom sur Commons, nettoyé.
     *
     * @param {string} titre - Titre du fichier, ex. "File:Tour_Eiffel.jpg".
     * @returns {string} Ex. tour-eiffel.jpg.
     */
    nomImage(titre) {
        const [, nom, extension] = titre.replace(/^[^:]+:/, '').match(/^(.*?)(?:\.(\w+))?$/);
        return (this.motsFichier(nom, 60) || 'image') + '.' + (extension || 'jpg').toLowerCase();
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
     * Question posée juste avant la réponse qui contient l'élément.
     *
     * @param {HTMLElement} element - Élément de la réponse.
     * @returns {string} Texte de la question, ou '' hors du fil.
     */
    questionAvant(element) {
        let li = element.closest('li');
        while (li && !li.classList.contains('user')) {
            li = li.previousElementSibling;
        }
        /* Le texte seul : le "Vous" caché aux yeux est dans un <span>. */
        return li ? [...li.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(' ') : '';
    },

    /**
     * Titre d'un schéma : title de Mermaid, ou <title> d'un SVG.
     *
     * @param {string} code - Code du bloc.
     * @returns {string} Titre, ou '' s'il n'y en a pas.
     */
    titreFigure(code) {
        const trouve = code.match(/<title>([^<]*)<\/title>/i) || code.match(/^\s*title:?\s+"?([^"\n]*?)"?\s*$/m);
        return trouve ? trouve[1].trim() : '';
    },

    /**
     * Fichier inventé par le modèle : première vraie image de Commons qui reprend tous les mots de son nom.
     *
     * @param {string} titre - Titre introuvable, ex. "File:Picasso,_Les_Demoiselles_d'Avignon.jpg".
     * @returns {Promise<?Object>} Voir Recherche.lireImageCommons.
     */
    async imageApprochee(titre) {
        const mots = titre.replace(/^[^:]+:/, '').replace(/\.[^.]+$/, '').replace(/[_,()]+|\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
        /* Tous les mots d'au moins 4 lettres dans le nom ou la description, sinon mieux vaut rien : Picasso ne doit pas donner Munch. */
        const cles = (texte) => texte.toLowerCase().split(/[^\p{L}]+/u).filter(m => m.length >= 4);
        const voulus = cles(mots);
        const trouvee = (await Recherche.chercherImages(mots)).find((i) => {
            const connus = cles(i.titre + ' ' + i.desc);
            return voulus.every(m => connus.includes(m));
        });
        return trouvee ? Recherche.imageCommons(trouvee.titre) : null;
    },

    /**
     * Télécharge un fichier long à préparer : bouton inactif et clignotant en attendant.
     *
     * @param {HTMLButtonElement} bouton - Bouton cliqué.
     * @param {function(): Promise<Blob>} preparer - Fabrique le contenu.
     * @param {string} nom - Nom du fichier.
     */
    async telechargerAvecAttente(bouton, preparer, nom) {
        bouton.disabled = true;
        bouton.classList.add('en-cours');
        try {
            this.telecharger(await preparer(), nom);
        } catch (err) {
            toast(t('toast.telechargement-impossible'));
        } finally {
            bouton.disabled = false;
            bouton.classList.remove('en-cours');
        }
    },

    /**
     * Enregistre un fichier sur le poste.
     *
     * @param {Blob} fichier - Contenu.
     * @param {string} nom - Nom du fichier.
     */
    telecharger(fichier, nom) {
        const lien = document.createElement('a');
        lien.href = URL.createObjectURL(fichier);
        lien.download = nom;
        lien.click();
        setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
    },

    /**
     * Charge Mermaid (3,5 Mo) une seule fois, à la demande.
     *
     * @returns {Promise<void>} Résolue quand Mermaid est prêt.
     */
    chargerMermaid() {
        if (!this._mermaid) {
            this._mermaid = this.chargerScript('vendor/mermaid/mermaid.min.js').then(() => {
                /* Thème neutral, noir et gris : lisible imprimé ; .diagramme a toujours un fond blanc. Sans
                   suppressErrorRendering, une erreur laisse sa bombe en haut de la page.
                   htmlLabels false : étiquettes en <text>, assainirSvg retire les foreignObject. */
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'neutral',
                    /* Barres et courbes : le gris très clair de neutral disparaît à l'impression. */
                    themeVariables: { xyChart: { plotColorPalette: '#555555, #999999, #222222, #bbbbbb' } },
                    securityLevel: 'strict',
                    suppressErrorRendering: true,
                    htmlLabels: false,
                    flowchart: { htmlLabels: false }
                });
            });
        }
        return this._mermaid;
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
}
