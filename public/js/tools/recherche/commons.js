/*
 * tools/recherche/commons.js
 * Images de Wikimedia Commons : outil Images du modèle, miniature et crédit d'un fichier.
 *
 * Complète l'objet Recherche de recherche.js, chargé avant.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Recherche, {
    /**
     * Titre du fichier de Commons visé par une adresse, ex. "File:A.jpg" :
     * sa page sur commons.wikimedia.org, ou l'image sur upload.wikimedia.org.
     *
     * @param {string} adresse - Adresse du lien ou de l'image.
     * @returns {?string} Titre, ou null si ce n'est pas un fichier de Commons.
     */
    fichierCommons(adresse) {
        const page = adresse.match(/^https:\/\/commons\.wikimedia\.org\/wiki\/((?:File|Fichier|Datei|Archivo):[^?#]+)$/);
        if (page) {
            return decodeURIComponent(page[1]);
        }
        const image = adresse.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?\w\/\w\w\/([^/?#]+)/);
        return image ? 'File:' + decodeURIComponent(image[1]) : null;
    },

    /**
     * Miniature d'un fichier de Commons, lue dans la réponse de l'API.
     *
     * Seule une image servie par upload ou thumb.wikimedia.org passe,
     * seuls domaines d'images autorisés par la CSP.
     *
     * @param {Object} corps - Réponse de l'API (prop=imageinfo).
     * @returns {?Object} { src, description, date, original, auteur, licence, page }, ou null.
     */
    lireImageCommons(corps) {
        const page = Object.values((corps && corps.query && corps.query.pages) || {})[0];
        const info = page && page.imageinfo && page.imageinfo[0];
        const wikimedia = /^https:\/\/(upload|thumb)\.wikimedia\.org\//;
        if (!info || !/^image\//.test(info.mime) || !wikimedia.test(info.thumburl || '')) {
            return null;
        }
        const meta = info.extmetadata || {};
        /* Les blocs cachés portent des données Wikidata ("date QS:P571,...") : on les retire avec leur contenu. */
        const texte = (champ) => ((meta[champ] && meta[champ].value) || '')
            .replace(/<div style="display: ?none;?">[\s\S]*?<\/div>/g, '').replace(/<[^>]*>/g, '')
            .replace(/&(amp|quot|#0?39|lt|gt|nbsp);/g, (e, n) => ({ amp: '&', quot: '"', lt: '<', gt: '>', nbsp: ' ' })[n] || "'")
            .replace(/\s+/g, ' ').trim();
        let description = texte('ImageDescription');
        if (description.length > 120) {
            description = description.slice(0, 120) + '...';
        }
        /* Année, ou période : "between 1975 and 1981" donne "1975-1981". */
        const annees = texte('DateTimeOriginal').match(/\b\d{4}\b/g) || [];
        let date = annees[0] || '';
        const derniere = annees[annees.length - 1];
        if (derniere && derniere !== date) {
            date += '-' + derniere;
        }
        return {
            src: info.thumburl,
            description,
            date,
            original: wikimedia.test(info.url || '') ? info.url : info.descriptionurl,
            auteur: texte('Artist'),
            licence: texte('LicenseShortName'),
            page: info.descriptionurl
        };
    },

    /**
     * Demande à Commons la miniature d'un fichier.
     *
     * @param {string} titre - Titre du fichier, ex. "File:A.jpg".
     * @returns {Promise<?Object>} Voir lireImageCommons.
     */
    async imageCommons(titre) {
        const adresse = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*'
            + '&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=480&uselang=' + I18n.langue
            + '&titles=' + encodeURIComponent(titre);
        const reponse = await fetch(adresse);
        return reponse.ok ? this.lireImageCommons(await reponse.json()) : null;
    },

    /**
     * Outil de recherche d'images sur Wikimedia Commons, pour le modèle.
     *
     * @returns {Object} Outil au format "tools" de chat/completions.
     */
    outilImages() {
        return {
            type: 'function',
            function: {
                name: 'image_commons',
                description: t('images.description'),
                parameters: {
                    type: 'object',
                    properties: { q: { type: 'string', description: t('recherche.parametre') } },
                    required: ['q']
                }
            }
        };
    },

    /**
     * Images trouvées dans une réponse de Commons (generator=search).
     *
     * @param {Object} corps - Réponse de l'API.
     * @returns {Array<Object>} { titre, url, desc }, dans l'ordre du moteur.
     */
    lireImagesTrouvees(corps) {
        return Object.values((corps && corps.query && corps.query.pages) || {})
            .sort((a, b) => a.index - b.index)
            .map((page) => {
                const meta = (page.imageinfo && page.imageinfo[0] && page.imageinfo[0].extmetadata) || {};
                const desc = ((meta.ImageDescription && meta.ImageDescription.value) || '').replace(/<[^>]*>/g, '').trim();
                return {
                    titre: page.title,
                    url: 'https://commons.wikimedia.org/wiki/' + encodeURI(page.title.replace(/ /g, '_')),
                    desc: desc.length > 150 ? desc.slice(0, 150) + '...' : desc
                };
            });
    },

    /**
     * Mots d'au moins 4 lettres, en minuscules.
     *
     * @param {string} texte - Texte quelconque.
     * @returns {string[]} Mots gardés.
     */
    motsCles(texte) {
        return texte.toLowerCase().split(/[^\p{L}]+/u).filter(m => m.length >= 4);
    },

    /**
     * Garde les images dont le nom ou la description contient chaque nom propre cherché.
     *
     * ponytail: nom propre = mot à majuscule, un prénom ("Pablo") filtre aussi ; n'exiger que le nom de famille si des images justes sont écartées.
     *
     * @param {Array<Object>} images - Résultats de lireImagesTrouvees.
     * @param {string} mots - Texte cherché.
     * @returns {Array<Object>} Images gardées : "Picasso" écarte un Kirchner.
     */
    garderNomsPropres(images, mots) {
        const noms = this.motsCles(mots.split(/\s+/).filter(m => /^\p{Lu}/u.test(m)).join(' '));
        return images.filter(i => this.contientTout(i, noms));
    },

    /**
     * Indique si le nom ou la description d'une image contient tous les mots.
     *
     * @param {Object} image - { titre, desc }.
     * @param {string[]} mots - Mots de motsCles.
     * @returns {boolean} true si aucun ne manque.
     */
    contientTout(image, mots) {
        const connus = this.motsCles(image.titre + ' ' + image.desc);
        return mots.every(m => connus.includes(m));
    },

    /**
     * Cherche des images sur Commons.
     *
     * @param {string} mots - Texte cherché.
     * @param {AbortSignal} [signal] - Pour annuler avec la question.
     * @returns {Promise<Array<Object>>} Voir lireImagesTrouvees.
     */
    async chercherImages(mots, signal) {
        const adresse = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*'
            + '&generator=search&gsrnamespace=6&gsrlimit=6&gsrsearch=' + encodeURIComponent(mots + ' filetype:bitmap')
            + '&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=ImageDescription&iiextmetadatalanguage=' + I18n.langue;
        return this.lireImagesTrouvees(await this.interroger(adresse, signal, 'Wikimedia Commons'));
    },
});
