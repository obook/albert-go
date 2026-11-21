/*
 * albert/passages.js
 * Sources découpées en passages numérotés, recherche des passages utiles et citations.
 *
 * Discussion envoie les sources cochées en passages [P12] ; au-delà du contexte, seuls
 * partent ceux des mots rares de la question et les plus proches d'elle (vecteurs de
 * /v1/embeddings). La réponse cite ces numéros, que reponse.js change en pages.
 * Complète l'objet Albert d'albert.js, chargé avant lui. Utilisé par app.js, projet.js
 * et reponse.js.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Albert, {
    /** Longueur d'un passage de source, en caractères : au-delà, il est coupé entre deux lignes. */
    PASSAGE_MAX: 1000,

    /** Passage plus court, rattaché au précédent de la même section : des chiffres isolés ne font pas un passage. */
    PASSAGE_MIN: 80,

    /** Mot rare de la question : présent dans 3 % des passages au plus, ou dans 5 pour une petite source. */
    MOT_RARE: 0.03,
    MOT_RARE_MIN: 5,

    /** Numéros de passages donnés au plus pour un mot rare. */
    MOT_PASSAGES_MAX: 20,

    /** Numéros cités par le modèle : [P12], (P12), [P12, P13], [P34-P41], [P34 à P41], 【P12】, avec ou sans page ni espaces invisibles. */
    CITATION: /[[【(][\s\p{Cf}]*(P\d+(?:[\s,;\p{Cf}]*(?:(?:\p{Pd}|à)[\s\p{Cf}]*P?\d+|p\.\s*\d+|P\d+))*)[\s\p{Cf}]*[\]】)]/gu,

    /** Modèle des vecteurs (/v1/embeddings), 1 024 dimensions le 21/11/2026. */
    MODELE_VECTEURS: 'openweight-embeddings',

    /** Passages par appel à /v1/embeddings : 64 passent en moins d'une demi-seconde. */
    LOT_VECTEURS: 64,

    /**
     * Découpe le texte d'une source en passages, à chaque titre (#) et au plus à PASSAGE_MAX caractères.
     * Une source sans titre se découpe à ses lignes vides. \f marque un changement de page (PDF).
     *
     * @param {string} texte - Texte d'une source.
     * @returns {{page: number, chemin: string, texte: string}[]} Passages, chemin de titres "A > B".
     */
    decouper(texte) {
        const passages = [];
        const chemin = [];
        const sansTitres = !/^\f?#+ /m.test(texte);
        /* Table des matières : ses lignes reprennent les titres, avec ou sans page. Citée, elle ne prouve rien. */
        const sansPage = (ligne) => ligne.replace(/[\s.…]*\d*\s*$/, '').trim();
        const titres = new Set([...texte.matchAll(/^\f?#+ (.+)$/gm)].map(m => sansPage(m[1])));
        const sommaire = (lignes) => lignes.filter(l => titres.has(sansPage(l))).length * 2 > lignes.length;
        let page = 1;
        let courant = null;
        const fermer = () => {
            if (courant && sommaire(courant.lignes)) {
                courant = null;
                return;
            }
            const contenu = courant ? courant.lignes.join('\n').trim() : '';
            const precedent = passages.at(-1);
            if (contenu && contenu.length < this.PASSAGE_MIN && precedent && precedent.chemin === courant.chemin
                && precedent.texte.length + contenu.length < this.PASSAGE_MAX) {
                precedent.texte += '\n' + contenu;
            } else if (contenu) {
                passages.push({ page: courant.page, chemin: courant.chemin, texte: contenu });
            }
            courant = null;
        };
        for (const brute of texte.split('\n')) {
            page += (brute.match(/\f/g) || []).length;
            const ligne = brute.replace(/\f/g, '');
            const titre = ligne.match(/^(#+) (.+)/);
            if (titre) {
                fermer();
                chemin.length = titre[1].length - 1;
                chemin.push(titre[2].trim());
            } else if (!ligne.trim()) {
                if (sansTitres) {
                    fermer();
                }
            } else {
                if (courant && courant.taille + ligne.length > this.PASSAGE_MAX) {
                    fermer();
                }
                courant = courant || { page, chemin: chemin.filter(Boolean).join(' > '), lignes: [], taille: 0 };
                courant.lignes.push(ligne);
                courant.taille += ligne.length + 1;
            }
        }
        fermer();
        return passages;
    },

    /**
     * Passages de toutes les sources cochées, numérotés à la suite.
     * ponytail: numéros recalculés à chaque question ; une source redéposée change ceux des anciennes réponses.
     *
     * @param {{nom: string, texte: string}[]} documents - Sources, dans l'ordre d'envoi.
     * @returns {{n: number, nom: string, pages: boolean, page: number, chemin: string, texte: string}[]} Passages.
     */
    passagesSources(documents) {
        const passages = documents.flatMap(d => this.decouper(d.texte).map(p => ({ ...p, nom: d.nom, pages: d.texte.includes('\f') })));
        return passages.map((p, i) => ({ n: i + 1, ...p }));
    },

    /**
     * Texte des sources découpées en passages numérotés, précédé de la consigne de citation.
     *
     * @param {Object[]} passages - Passages de passagesSources.
     * @returns {string} Consigne puis un bloc par source.
     */
    joindrePassages(passages) {
        const blocs = [];
        for (const p of passages) {
            const entete = '[P' + p.n + (p.pages ? ', p. ' + p.page : '') + ']' + (p.chemin ? ' ' + p.chemin : '');
            if (blocs.at(-1)?.nom !== p.nom) {
                blocs.push({ nom: p.nom, passages: [] });
            }
            blocs.at(-1).passages.push(entete + '\n' + p.texte);
        }
        return [t('demande.citer'), ...blocs.map(b => t('demande.fichier', { nom: b.nom, texte: b.passages.join('\n\n') }))].join('\n\n');
    },

    /**
     * Passages qui contiennent chaque mot rare de la question. Le modèle ne trouve pas seul
     * toutes les occurrences d'une notion, même quand la source tient dans le contexte.
     * ponytail: début de mot, sans synonymes ni formes fléchies ; à revoir si une question en souffre.
     *
     * @param {string} question - Texte saisi.
     * @param {Object[]} passages - Passages de passagesSources.
     * @returns {string} Une ligne par mot rare, ou ''.
     */
    motsRares(question, passages) {
        return this.passagesMotsRares(question, passages).map(({ mot, trouves }) => {
            /* Chemin à côté du numéro : sans lui, le modèle prêtait à une classe ce qui est dans une autre. */
            const numeros = trouves.map(p => 'P' + p.n + (p.chemin ? ' (' + p.chemin + ')' : '')).join(', ');
            return t('demande.mot-rare', { mot: mot, passages: numeros });
        }).join('\n');
    },

    /**
     * Mots rares de la question et passages qui les contiennent (MOT_PASSAGES_MAX au plus par mot).
     *
     * @param {string} question - Texte saisi.
     * @param {Object[]} passages - Passages de passagesSources.
     * @returns {{mot: string, trouves: Object[]}[]} Un élément par mot rare.
     */
    passagesMotsRares(question, passages) {
        /* Accents retirés : NFD les sépare de leur lettre (U+0300 à U+036F), puis on les efface. */
        const normaliser = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const textes = passages.map(p => normaliser(p.chemin + '\n' + p.texte));
        const seuil = Math.max(this.MOT_RARE_MIN, Math.floor(passages.length * this.MOT_RARE));
        const mots = new Map((question.match(/[\p{L}\p{N}]{4,}/gu) || []).map(m => [normaliser(m), m]));
        const rares = [];
        for (const [cle, mot] of mots) {
            const debut = new RegExp('(^|[^\\p{L}\\p{N}])' + cle, 'u');
            const trouves = passages.filter((p, i) => debut.test(textes[i]));
            if (trouves.length && trouves.length <= seuil) {
                rares.push({ mot: mot, trouves: trouves.slice(0, this.MOT_PASSAGES_MAX) });
            }
        }
        return rares;
    },

    /**
     * Passages envoyés quand les sources dépassent le plafond : ceux des mots rares d'abord,
     * puis les plus proches de la question, tant que le plafond le permet. Les numéros ne changent pas.
     *
     * @param {Object[]} passages - Passages de passagesSources.
     * @param {number[]} proximites - Proximité de chaque passage avec la question (cosinus).
     * @param {Set<number>} prioritaires - Numéros des passages des mots rares.
     * @param {number} plafond - Caractères au plus.
     * @returns {Object[]} Passages choisis, dans l'ordre des numéros.
     */
    choisirPassages(passages, proximites, prioritaires, plafond) {
        const ordre = passages.map((p, i) => i)
            .sort((a, b) => prioritaires.has(passages[b].n) - prioritaires.has(passages[a].n) || proximites[b] - proximites[a]);
        const choisis = [];
        let taille = 0;
        for (const i of ordre) {
            const longueur = passages[i].chemin.length + passages[i].texte.length;
            if (taille + longueur <= plafond) {
                choisis.push(passages[i]);
                taille += longueur;
            }
        }
        return choisis.sort((a, b) => a.n - b.n);
    },

    /**
     * Cosinus de deux vecteurs : 1 pour deux textes de même sens.
     *
     * @param {Float32Array} a - Premier vecteur.
     * @param {Float32Array} b - Second vecteur, de même dimension.
     * @returns {number} Entre -1 et 1.
     */
    cosinus(a, b) {
        let produit = 0;
        let normeA = 0;
        let normeB = 0;
        for (let i = 0; i < a.length; i++) {
            produit += a[i] * b[i];
            normeA += a[i] * a[i];
            normeB += b[i] * b[i];
        }
        return produit / Math.sqrt(normeA * normeB);
    },

    /**
     * Empreinte d'un texte (FNV-1a) : une source redéposée avec un autre texte change de vecteurs.
     *
     * @param {string} texte - Texte d'une source.
     * @returns {string} Longueur et empreinte.
     */
    empreinte(texte) {
        let h = 0x811c9dc5;
        for (let i = 0; i < texte.length; i++) {
            h = Math.imul(h ^ texte.charCodeAt(i), 0x01000193);
        }
        return texte.length + '-' + (h >>> 0).toString(16);
    },

    /**
     * Vecteurs de textes, par lots de LOT_VECTEURS (/v1/embeddings).
     *
     * @param {string[]} textes - Textes à comparer.
     * @param {AbortSignal} annulation - Pour annuler avec la question.
     * @returns {Promise<Float32Array[]>} Un vecteur par texte, dans l'ordre.
     * @throws {Error} Si Albert refuse ou ne répond pas.
     */
    async vecteurs(textes, annulation) {
        const resultat = [];
        for (let i = 0; i < textes.length; i += this.LOT_VECTEURS) {
            const res = await fetch(this.BASE + '/embeddings', {
                method: 'POST',
                headers: this.entetes({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ model: this.MODELE_VECTEURS, input: textes.slice(i, i + this.LOT_VECTEURS) }),
                signal: AbortSignal.any([annulation, AbortSignal.timeout(this.DELAI_MS)])
            });
            const corps = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(this.messageErreur(res.status, corps));
            }
            if (!corps || !Array.isArray(corps.data)) {
                throw new Error(t('erreur.reponse-illisible'));
            }
            resultat.push(...corps.data.sort((a, b) => a.index - b.index).map(e => Float32Array.from(e.embedding)));
        }
        return resultat;
    },

    /**
     * Numéros de passages d'une citation trouvée par CITATION.
     *
     * @param {string} contenu - Groupe capturé : "P12", "P12, P13", "P12, p. 4", "P34-P41".
     * @returns {number[][]} Une liste par numéro ou par plage, sans les pages : [[12], [34, 35, ..., 41]].
     */
    numerosCites(contenu) {
        return [...contenu.matchAll(/P(\d+)(?:[\s\p{Cf}]*(?:\p{Pd}|à)[\s\p{Cf}]*P?(\d+))?/gu)].map((m) => {
            const [debut, fin] = [Number(m[1]), Number(m[2] || m[1])].sort((a, b) => a - b);
            /* Borne contre une plage absurde ([P1-P99999999]) qui bloquerait la page. */
            return Array.from({ length: Math.min(fin - debut + 1, 1000) }, (_, i) => debut + i);
        });
    },

    /**
     * Découpe un texte autour des numéros de passages cités. Le modèle écrit [P12] comme demandé,
     * mais aussi (P12), [Source : P12] ou P12 seul : ces formes comptent aussi.
     * Des crochets collés, [P13][P28], forment une seule citation.
     *
     * @param {string} texte - Texte d'une réponse.
     * @returns {Array<string|{plages: number[][], crochets: boolean}>} Texte et citations, dans l'ordre.
     */
    morceauxCitations(texte) {
        const morceaux = [];
        const libres = (bout) => {
            let debut = 0;
            /* Sans lookbehind : absent du Safari des iPad pas à jour. */
            for (const m of bout.matchAll(/(^|[^\p{L}\p{N}])P(\d+)(?![\p{L}\p{N}])/gu)) {
                const position = m.index + m[1].length;
                morceaux.push(bout.slice(debut, position), { plages: [[Number(m[2])]], crochets: false });
                debut = position + m[0].length - m[1].length;
            }
            morceaux.push(bout.slice(debut));
        };
        let debut = 0;
        let groupe = null;
        for (const m of texte.matchAll(this.CITATION)) {
            const entre = texte.slice(debut, m.index);
            if (groupe && !entre.trim()) {
                groupe.plages.push(...this.numerosCites(m[1]));
            } else {
                libres(entre);
                groupe = { plages: this.numerosCites(m[1]), crochets: true };
                morceaux.push(groupe);
            }
            debut = m.index + m[0].length;
        }
        libres(texte.slice(debut));
        return morceaux.filter(m => m !== '');
    }
});
