/*
 * rendu/diagrammes.js
 * Diagrammes Mermaid et SVG : dessin, correction par le modèle, export SVG et PNG.
 *
 * Complète l'objet Rendu de rendu.js, chargé avant.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Rendu, {
    /**
     * Remplace les blocs ```courbe, ```svg et ```mermaid par leur dessin.
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
        /* Courbes calculées ici, jamais tracées à la main (courbes.js). */
        for (const bloc of blocs('courbe')) {
            await this.dessinerCourbe(bloc);
        }
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
            const code = this.formulesMermaid(this.chimieMermaid(bloc.textContent));
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

    /* ponytail: corrections gardées pour la session seulement ; les enregistrer avec la conversation si les rechargements coûtent trop d'appels. */
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
            this._corrections.set(code, Albert.repondre(demande, new AbortController().signal)
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
     * Retire les $ autour d'une formule dans un diagramme : Mermaid afficherait $-3$ tel quel.
     *
     * Un $ suivi ou précédé d'une espace est une monnaie : "5 $ et 10 $" ne change pas.
     *
     * @param {string} code - Code Mermaid.
     * @returns {string} Code sans délimiteur de formule.
     */
    formulesMermaid(code) {
        const signes = { '\\times': '×', '\\div': '÷', '\\cdot': '·' };
        return code.replace(/\$(\S(?:[^$\n]*\S)?)\$/g,
            (_, formule) => formule.replace(/\\(?:times|div|cdot)\b/g, (signe) => signes[signe]));
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
        /* Mermaid : réduit à la largeur de la bulle, mais pas sous les trois quarts
           de sa taille (texte à 12 px) ; au-delà, le cadre défile. */
        const largeur = Number((svg.getAttribute('viewBox') || '').split(/[\s,]+/)[2]);
        if (svg.id.startsWith('mermaid-') && largeur > 0) {
            svg.style.minWidth = Math.ceil(largeur * 0.75) + 'px';
            svg.classList.add('taille-propre');
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
        conteneur.append(boutons, svg);
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
});
