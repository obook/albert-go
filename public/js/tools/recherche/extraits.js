/*
 * tools/recherche/extraits.js
 * Extraits d'articles : fiche d'infobox, nettoyage du wikitexte, passages utiles.
 *
 * Complète l'objet Recherche de recherche.js, chargé avant.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

Object.assign(Recherche, {
    /**
     * Champs de l'infobox, en "nom : valeur" séparés par des points-virgules.
     *
     * Une ligne de l'infobox commence par une barre verticale, parfois
     * indentée, et porte un seul champ. Un champ écrit sur plusieurs lignes
     * est ignoré.
     *
     * @param {string} wikitexte - Wikitexte de la tête d'article.
     * @returns {string} Champs renseignés, vide si l'article n'a pas d'infobox.
     */
    fiche(wikitexte) {
        const champs = [];
        for (const ligne of wikitexte.split('\n')) {
            const champ = ligne.match(/^\s*\|\s*([^=|{}\[\]]+?)\s*=\s*(.*)$/);
            if (!champ) {
                continue;
            }
            const valeur = this.nettoyerWiki(champ[2]);
            if (valeur) {
                champs.push(champ[1] + ' : ' + valeur);
            }
        }
        return champs.join(' ; ').slice(0, this.TAILLE_FICHE);
    },

    /**
     * Retire le balisage wiki d'une valeur de champ.
     *
     * ponytail : remplacement à plat, un modèle de modèle imbriqué reste tel
     * quel. Passer par un analyseur de wikitexte si cela se voit dans les
     * réponses.
     *
     * @param {string} texte - Valeur brute du champ.
     * @returns {string} Valeur lisible.
     */
    nettoyerWiki(texte) {
        return texte
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<ref[^>]*\/>/g, '')
            .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
            /* {{unité|2363.1|km|2}} donne "2363.1 km 2" ; {{Canada}} donne "Canada". */
            .replace(/\{\{([^{}]*)\}\}/g, (tout, contenu) => {
                const parts = contenu.split('|');
                /* {{POR football juniors|âge=17}} : un paramètre nommé n'est pas la valeur. */
                return (parts.slice(1).filter(p => !p.includes('=')).join(' ').trim() || parts[0]);
            })
            .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
            .replace(/\[\[([^\]]*)\]\]/g, '$1')
            .replace(/'{2,}/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    /**
     * Remet au format [n] les renvois que gpt-oss écrit à sa façon : 【1†L9-L15】.
     *
     * @param {string} texte - Réponse du modèle.
     * @returns {string} Réponse aux renvois lisibles.
     */
    citations(texte) {
        return texte.replace(/\s*【(\d+)[^】]*】/g, ' [$1]');
    },

    /**
     * Assemble la fiche et le texte de l'article.
     *
     * @param {string} fiche - Champs de l'infobox.
     * @param {string} texte - Passages gardés de l'article.
     * @returns {string} Extrait à donner au modèle.
     */
    avecFiche(fiche, texte) {
        if (!fiche) {
            return texte;
        }
        return 'Fiche : ' + fiche + '\n' + texte;
    },

    /**
     * Garde d'un article son résumé et la section qui répond à la question.
     *
     * Le texte brut de MediaWiki sépare les sections par une ligne "== Titre ==" ;
     * on note chacune par le nombre de mots de la question qu'elle contient.
     *
     * @param {string} texte - Article en texte brut.
     * @param {string} question - Texte cherché.
     * @returns {string} Résumé, suivi de la meilleure section s'il y en a une.
     */
    passages(texte, question) {
        const mots = (question.toLowerCase().match(/[^\s,.;:!?"'()]{4,}/g) || []);
        const note = (bloc) => {
            const bas = bloc.toLowerCase();
            return mots.filter(mot => bas.includes(mot)).length;
        };
        /* Le premier bloc est le résumé : il précède le premier titre de section. */
        const blocs = texte.split(/\n(?=\={2}[^=])/);
        const resume = this.resumeUtile(blocs[0], note);
        const sections = blocs.slice(1).sort((a, b) => note(b) - note(a));
        if (!sections.length || !note(sections[0])) {
            return resume;
        }
        return resume + '\n' + sections[0].slice(0, this.TAILLE_SECTION);
    },

    /**
     * Résumé réduit à sa première phrase et à celles qui répondent.
     *
     * Couper les premiers caractères perdait le fait cherché : dans
     * "Démographie de la France", le nombre d'habitants arrive au millier de
     * caractères, après la définition du mot démographie et la présentation
     * de l'Insee. Les paragraphes y pèsent 800 caractères, soit plus que la
     * place disponible : le tri se fait donc phrase par phrase.
     *
     * @param {string} bloc - Résumé de l'article, avant le premier titre.
     * @param {function(string): number} note - Pertinence d'une phrase.
     * @returns {string} Phrases retenues, dans l'ordre du texte.
     */
    resumeUtile(bloc, note) {
        const phrases = bloc.split(/\n|(?<=[.!?])\s+/).filter(p => p.trim());
        if (!phrases.length) {
            return '';
        }
        /* La première phrase dit de quoi parle l'article : elle reste. */
        const gardes = new Set([0]);
        let reste = this.TAILLE_RESUME - phrases[0].length;
        /* ponytail : classement à la densité, mots trouvés rapportés à la
           longueur. Une phrase courte qui donne le chiffre passe ainsi devant
           une longue phrase institutionnelle citant les mêmes mots. Compter
           les occurrences plutôt que les mots distincts si cela ne suffit pas. */
        const densite = (p) => note(p) / p.length;
        const classes = [...phrases.keys()].sort((a, b) => densite(phrases[b]) - densite(phrases[a]));
        for (const rang of classes) {
            if (reste <= 0) {
                break;
            }
            if (!gardes.has(rang) && note(phrases[rang])) {
                gardes.add(rang);
                reste -= phrases[rang].length;
            }
        }
        return [...gardes].sort((a, b) => a - b).map(rang => phrases[rang]).join(' ');
    },
});
