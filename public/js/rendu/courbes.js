/*
 * rendu/courbes.js
 * Courbes de fonctions : le modèle écrit la fonction et l'intervalle dans un
 * bloc ```courbe, la page calcule les points et dessine le SVG.
 *
 * Tracées à la main par le modèle, les courbes n'avaient que quelques points
 * reliés par des segments, et des valeurs parfois fausses.
 *
 * Complète l'objet Rendu de rendu.js ; utilise Calcul (tools/calcul.js)
 * pour math.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Rendu, {
    /** Intervalles par courbe : à 400, aucun segment ne se voit. */
    POINTS_COURBE: 400,

    /** Couleurs des courbes, dans l'ordre des fonctions ; lisibles imprimées. */
    COULEURS_COURBE: ['#1f3f8f', '#b3261e', '#2e7d32', '#6d4c9f'],

    /** Taille du dessin et marges, en unités du viewBox. */
    CADRE_COURBE: { largeur: 480, hauteur: 320, gauche: 40, droite: 12, haut: 12, bas: 24 },

    /**
     * Lit un bloc ```courbe : une ligne "y = ..." ou "f(x) = ..." par
     * fonction, et une ligne "x = a .. b" pour l'intervalle.
     *
     * Les signes typographiques (x², −, ×) redeviennent ceux de math.js.
     *
     * @param {string} code - Contenu du bloc.
     * @returns {{fonctions: Array<{nom: string, expression: string}>, intervalle: string[]}}
     */
    lireCourbe(code) {
        const fonctions = [];
        let intervalle = null;
        const texte = code.replace(/²/g, '^2').replace(/³/g, '^3').replace(/−/g, '-').replace(/×/g, '*');
        for (const ligne of texte.split('\n').map(l => l.trim()).filter(Boolean)) {
            const bornes = /^x\s*[=:]\s*\[?\s*(.+?)\s*(?:\.\.|;)\s*(.+?)\s*\]?$/.exec(ligne);
            const fonction = /^(?:y|[a-z]\s*\(\s*x\s*\))\s*=\s*(.+)$/i.exec(ligne);
            if (bornes) {
                intervalle = [bornes[1], bornes[2]];
            } else if (fonction) {
                fonctions.push({ nom: ligne, expression: fonction[1] });
            }
        }
        if (!fonctions.length || !intervalle) {
            throw new Error(t('reponse.erreur-courbe'));
        }
        return { fonctions, intervalle };
    },

    /** Exposants que l'Unicode sait écrire : x², e⁻ˣ, xⁿ. */
    EXPOSANTS: { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
        '-': '⁻', '+': '⁺', x: 'ˣ', n: 'ⁿ' },

    /**
     * Légende d'une courbe en écriture mathématique : "y = x^2" devient
     * "y = x²", 2*x devient 2x, sqrt(x) devient √x, pi devient π. Un SVG
     * ne peut pas afficher KaTeX (foreignObject est retiré) : l'Unicode
     * garde la légende dans les fichiers SVG et PNG.
     *
     * @param {string} nom - Ligne du bloc, par exemple "f(x) = 2*x^3".
     * @returns {string} Légende ; la ligne telle quelle si math.js ne la lit pas.
     */
    legendeCourbe(nom) {
        const egal = nom.indexOf('=');
        const langue = typeof I18n !== 'undefined' ? I18n.langue : 'fr';
        const handler = (node, options) => {
            if (node.type === 'ConstantNode' && typeof node.value === 'number') {
                return node.value.toLocaleString(langue, { useGrouping: false, maximumSignificantDigits: 10 });
            }
            if (node.type === 'SymbolNode' && node.name === 'pi') {
                return 'π';
            }
            if (node.type === 'FunctionNode' && node.fn.name === 'sqrt') {
                const [arg] = node.args;
                const texte = arg.toString(options);
                return '√' + (['SymbolNode', 'ConstantNode', 'ParenthesisNode'].includes(arg.type) ? texte : '(' + texte + ')');
            }
            if (node.type === 'OperatorNode' && node.op === '^') {
                const haut = node.args[1].toString(options).replace(/^\((.*)\)$/, '$1').replace(/\s/g, '');
                const base = node.args[0].toString(options);
                return [...haut].every(c => this.EXPOSANTS[c])
                    ? base + [...haut].map(c => this.EXPOSANTS[c]).join('')
                    : base + '^' + node.args[1].toString(options);
            }
            /* 2x et πx accolés, comme sur le papier ; 2 × 3 ou x × y sinon. */
            if (node.type === 'OperatorNode' && node.op === '*') {
                const [gauche, droite] = node.args;
                const accole = (gauche.type === 'ConstantNode' || (gauche.type === 'SymbolNode' && gauche.name === 'pi'))
                    && droite.type !== 'ConstantNode' && !(droite.type === 'OperatorNode' && droite.fn === 'unaryMinus');
                return gauche.toString(options) + (accole ? '' : ' × ') + droite.toString(options);
            }
            return undefined;
        };
        try {
            return nom.slice(0, egal).trim() + ' = ' + math.parse(nom.slice(egal + 1)).toString({ handler });
        } catch (err) {
            return nom;
        }
    },

    /**
     * Fonction de x définie par math.js, avec les garde-fous de la
     * calculatrice et les angles en radians.
     *
     * @param {string} expression - Par exemple "x^2 - 1".
     * @returns {Function} f(x).
     */
    fonctionCourbe(expression) {
        const f = Calcul.moteur(true)('f(x) = ' + expression);
        if (typeof f !== 'function') {
            throw new Error(t('reponse.erreur-courbe'));
        }
        return f;
    },

    /**
     * Points d'une fonction sur [a, b] ; y vaut null là où elle n'existe pas.
     *
     * @param {Function} f - Fonction de x.
     * @param {number} a - Début de l'intervalle.
     * @param {number} b - Fin de l'intervalle.
     * @returns {Array<[number, ?number]>} POINTS_COURBE + 1 couples [x, y].
     */
    pointsCourbe(f, a, b) {
        const n = this.POINTS_COURBE;
        return Array.from({ length: n + 1 }, (_, i) => {
            const x = a + (b - a) * i / n;
            let y;
            try {
                y = f(x);
            } catch (err) {
                y = NaN;
            }
            return [x, typeof y === 'number' && Number.isFinite(y) ? y : null];
        });
    },

    /**
     * Bornes verticales : du 5e au 95e centile, élargies de moitié sans
     * dépasser les valeurs atteintes. Près d'une asymptote (1/x), les
     * grandes valeurs sortent du cadre au lieu d'écraser la courbe.
     *
     * @param {Array<?number>} ys - Ordonnées, null comprises.
     * @returns {number[]} [min, max], avec une marge de 5 %.
     */
    bornesCourbe(ys) {
        const tries = ys.filter(y => y !== null).sort((p, q) => p - q);
        if (!tries.length) {
            throw new Error(t('reponse.erreur-courbe'));
        }
        const centile = (c) => tries[Math.min(tries.length - 1, Math.floor(c * tries.length))];
        const marge = (centile(0.95) - centile(0.05)) / 2;
        let min = Math.max(tries[0], centile(0.05) - marge);
        let max = Math.min(tries[tries.length - 1], centile(0.95) + marge);
        /* Fonction constante : un cadre d'une unité autour. */
        if (max - min < 1e-9) {
            min -= 1;
            max += 1;
        }
        const bord = (max - min) * 0.05;
        return [min - bord, max + bord];
    },

    /**
     * Graduations rondes (1, 2 ou 5 fois une puissance de 10), une dizaine au plus.
     *
     * @param {number} min - Début de l'axe.
     * @param {number} max - Fin de l'axe.
     * @returns {number[]} Valeurs graduées.
     */
    graduations(min, max) {
        const brut = (max - min) / 8;
        const puissance = 10 ** Math.floor(Math.log10(brut));
        const pas = [1, 2, 5, 10].map(k => k * puissance).find(p => p >= brut);
        const valeurs = [];
        for (let v = Math.ceil(min / pas) * pas; v <= max + pas * 1e-9; v += pas) {
            /* Sans arrondi, 0.1 + 0.2 donnerait une étiquette 0,30000000000000004. */
            valeurs.push(Number(v.toPrecision(12)) || 0);
        }
        return valeurs;
    },

    /**
     * Dessine les courbes d'un bloc ```courbe en SVG.
     *
     * Le tracé s'interrompt là où la fonction n'existe pas, et d'un bord à
     * l'autre du cadre (asymptote de 1/x ou de tan) ; ce qui sort du cadre
     * est coupé par un clipPath.
     *
     * @param {string} code - Contenu du bloc.
     * @returns {string} SVG, texte du modèle échappé.
     */
    svgCourbe(code) {
        const { fonctions, intervalle } = this.lireCourbe(code);
        const [a, b] = intervalle.map(borne => Number(Calcul.moteur(true)(borne)));
        if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) {
            throw new Error(t('reponse.erreur-courbe'));
        }
        const courbes = fonctions.map(f => ({ ...f, points: this.pointsCourbe(this.fonctionCourbe(f.expression), a, b) }));
        const [min, max] = this.bornesCourbe(courbes.flatMap(c => c.points.map(p => p[1])));
        const c = this.CADRE_COURBE;
        const largeur = c.largeur - c.gauche - c.droite;
        const hauteur = c.hauteur - c.haut - c.bas;
        /* Légendes au-dessus du cadre : dedans, elles cachaient la courbe (x² passe dans le coin). */
        const legende = courbes.length * 22;
        const haut = c.haut + legende;
        const X = x => c.gauche + (x - a) / (b - a) * largeur;
        /* Borné : une valeur immense (1/x près de 0) ne doit pas produire une coordonnée infinie. */
        const Y = y => Math.max(-1e4, Math.min(1e4, haut + (max - y) / (max - min) * hauteur));
        const n = (v) => v.toFixed(1);
        const echapper = (s) => s.replace(/[&<>"]/g, (car) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[car]);
        const langue = typeof I18n !== 'undefined' ? I18n.langue : 'fr';
        const nombre = (v) => v.toLocaleString(langue, { maximumSignificantDigits: 6 });
        /* Axes en 0 s'il est dans le cadre, sinon sur le bord. */
        const axeX = min <= 0 && max >= 0 ? Y(0) : haut + hauteur;
        const axeY = a <= 0 && b >= 0 ? X(0) : c.gauche;
        const clip = 'cadre-' + Math.random().toString(36).slice(2);
        const morceaux = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + c.largeur + ' ' + (c.hauteur + legende) + '" font-size="14">',
            '<defs><clipPath id="' + clip + '"><rect x="' + c.gauche + '" y="' + haut + '" width="' + largeur
                + '" height="' + hauteur + '"/></clipPath></defs>'
        ];
        /* Quadrillage gris moyen : un gris très clair disparaît sur certains écrans. */
        for (const v of this.graduations(a, b)) {
            morceaux.push('<line x1="' + n(X(v)) + '" y1="' + haut + '" x2="' + n(X(v)) + '" y2="' + (haut + hauteur) + '" stroke="#d0d0d0"/>',
                '<text x="' + n(X(v)) + '" y="' + n(Math.min(axeX + 16, c.hauteur + legende - 4)) + '" text-anchor="middle" fill="#333">' + nombre(v) + '</text>');
        }
        for (const v of this.graduations(min, max)) {
            morceaux.push('<line x1="' + c.gauche + '" y1="' + n(Y(v)) + '" x2="' + (c.gauche + largeur) + '" y2="' + n(Y(v)) + '" stroke="#d0d0d0"/>');
            if (v !== 0 || axeY !== X(0)) {
                morceaux.push('<text x="' + n(Math.max(axeY - 4, 34)) + '" y="' + n(Y(v) + 4) + '" text-anchor="end" fill="#333">' + nombre(v) + '</text>');
            }
        }
        morceaux.push('<line x1="' + c.gauche + '" y1="' + n(axeX) + '" x2="' + (c.gauche + largeur) + '" y2="' + n(axeX) + '" stroke="#333" stroke-width="1.2"/>',
            '<line x1="' + n(axeY) + '" y1="' + haut + '" x2="' + n(axeY) + '" y2="' + (haut + hauteur) + '" stroke="#333" stroke-width="1.2"/>');
        courbes.forEach((courbe, rang) => {
            let d = '';
            let avant = null;
            for (const [x, y] of courbe.points) {
                if (y === null) {
                    avant = null;
                    continue;
                }
                const saut = avant !== null && ((avant > max && y < min) || (avant < min && y > max));
                d += (avant === null || saut ? 'M' : 'L') + n(X(x)) + ' ' + n(Y(y));
                avant = y;
            }
            const couleur = this.COULEURS_COURBE[rang % this.COULEURS_COURBE.length];
            morceaux.push('<path class="courbe" clip-path="url(#' + clip + ')" fill="none" stroke="' + couleur
                + '" stroke-width="2" stroke-linejoin="round" d="' + d + '"/>',
                '<text x="' + c.gauche + '" y="' + (c.haut + 16 + rang * 22) + '" fill="' + couleur
                + '" font-family="KaTeX_Main, \'Times New Roman\', serif" font-size="18">'
                /* Lettres seules en italique, comme dans une formule ; sin, ln, exp restent droits. */
                + echapper(this.legendeCourbe(courbe.nom)).replace(/(?<![A-Za-z&])([A-Za-z])(?![A-Za-z;])/g, '<tspan font-style="italic">$1</tspan>')
                + '</text>');
        });
        morceaux.push('</svg>');
        return morceaux.join('');
    },

    /**
     * Remplace un bloc ```courbe par son dessin ; illisible, il reste en code
     * avec la raison dessous.
     *
     * @param {HTMLElement} bloc - Élément <code> du bloc.
     * @returns {Promise<void>}
     */
    async dessinerCourbe(bloc) {
        const code = bloc.textContent;
        try {
            await Calcul.charger();
            this.remplacerBloc(bloc, this.assainirSvg(this.svgCourbe(code)), code);
        } catch (err) {
            const note = document.createElement('p');
            note.className = 'erreur-diagramme';
            note.textContent = t('reponse.erreur-courbe');
            bloc.parentElement.after(note);
        }
    }
});
