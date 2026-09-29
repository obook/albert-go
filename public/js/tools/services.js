/*
 * tools/services.js
 * Services de l'État proposés au modèle : annuaires, entreprises, adresses,
 * communes, calendrier scolaire, marchés publics.
 *
 * Tous tenus par l'administration, sans clé et ouverts à CORS : les mots
 * cherchés restent chez l'État. Un outil par service, sous le globe comme
 * la recherche ; les résultats passent par Recherche.chercherBase.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/**
 * Adresse d'un jeu Opendatasoft (API Explore 2.1) : les enregistrements qui
 * contiennent tous les mots.
 *
 * @param {string} base - Site Opendatasoft.
 * @param {string} jeu - Identifiant du jeu de données.
 * @param {string} q - Mots cherchés.
 * @param {number} n - Nombre d'enregistrements.
 * @param {string} [suite] - Paramètres ajoutés tels quels.
 * @returns {string} Adresse de la requête.
 */
const opendatasoft = (base, jeu, q, n, suite = '') => base + '/api/explore/v2.1/catalog/datasets/' + jeu
    + '/records?limit=' + n + '&where=' + encodeURIComponent('"' + q.replace(/"/g, ' ') + '"') + suite;

/** Liste rangée en texte JSON, comme dans l'Annuaire de l'administration ; vide si illisible. */
const listeJson = (valeur) => {
    try {
        const liste = typeof valeur === 'string' ? JSON.parse(valeur) : valeur;
        return Array.isArray(liste) ? liste : [];
    } catch (err) {
        return [];
    }
};

/** Morceaux non vides, séparés par des points-virgules. */
const accoler = (...morceaux) => morceaux.filter(Boolean).join(' ; ');

/**
 * Jour AAAA-MM-JJ d'un minuit local donné en UTC : minuit à Paris est
 * 22 h ou 23 h UTC la veille. Midi ajouté, le jour tombe juste de
 * l'outre-mer à la métropole (décalage de moins de 12 h).
 */
const jourLocal = (iso) => new Date(Date.parse(iso) + 12 * 3600000).toISOString().slice(0, 10);

/** Horaires de l'Annuaire de l'administration : "Lundi-Mercredi 08:45-16:45, Jeudi 08:45-12:00 14:00-16:45". */
const horaires = (valeur) => listeJson(valeur).map((p) => {
    const jours = p.nom_jour_debut + (p.nom_jour_fin && p.nom_jour_fin !== p.nom_jour_debut ? '-' + p.nom_jour_fin : '');
    const plages = [1, 2].filter(i => p['valeur_heure_debut_' + i])
        .map(i => p['valeur_heure_debut_' + i].slice(0, 5) + '-' + (p['valeur_heure_fin_' + i] || '').slice(0, 5));
    return [jours, ...plages].join(' ');
}).join(', ');

const Services = {
    /**
     * Services proposés, un outil chacun. La clé sert de nom d'outil et de
     * préfixe i18n ; adresse et extraire comme les bases de
     * Recherche.MOTEURS. Extraits en français, comme les données : le
     * modèle les traduit.
     *
     * Les domaines sont listés dans la CSP (index.html).
     */
    TABLE: {
        annuaire_administration: {
            nom: 'Annuaire de l\'administration',
            adresse: (q, n) => opendatasoft('https://api-lannuaire.service-public.fr', 'api-lannuaire-administration', q, n),
            extraire: (corps) => (corps.results || []).map(r => ({
                title: r.nom,
                url: r.url_service_public,
                desc: accoler(
                    listeJson(r.adresse).map(a => [a.numero_voie, a.code_postal, a.nom_commune].filter(Boolean).join(' '))[0],
                    listeJson(r.telephone).map(tel => 'tél. ' + tel.valeur).join(', '),
                    r.adresse_courriel,
                    listeJson(r.site_internet).map(site => site.valeur)[0],
                    horaires(r.plage_ouverture),
                    r.commentaire_plage_ouverture)
            }))
        },
        /* Les dirigeants ne partent pas au modèle : ce sont des personnes. */
        entreprise: {
            nom: 'Annuaire des entreprises',
            adresse: (q, n) => 'https://recherche-entreprises.api.gouv.fr/search?per_page=' + n + '&q=' + encodeURIComponent(q),
            extraire: (corps) => (corps.results || []).map(r => ({
                title: r.nom_complet,
                url: 'https://annuaire-entreprises.data.gouv.fr/entreprise/' + r.siren,
                desc: accoler('SIREN ' + r.siren,
                    r.siege && 'SIRET du siège ' + r.siege.siret,
                    r.siege && r.siege.adresse,
                    r.activite_principale && 'NAF ' + r.activite_principale,
                    r.etat_administratif === 'C' ? 'cessée' : 'active',
                    r.date_creation && 'créée le ' + r.date_creation)
            }))
        },
        etablissement_scolaire: {
            nom: 'Annuaire de l\'éducation',
            adresse: (q, n) => opendatasoft('https://data.education.gouv.fr', 'fr-en-annuaire-education', q, n),
            extraire: (corps) => (corps.results || []).map(r => ({
                title: r.nom_etablissement + ' (' + r.nom_commune + ')',
                url: 'https://data.education.gouv.fr/explore/dataset/fr-en-annuaire-education/table/?q='
                    + encodeURIComponent(r.identifiant_de_l_etablissement),
                desc: accoler('UAI ' + r.identifiant_de_l_etablissement, r.type_etablissement, r.statut_public_prive,
                    [r.adresse_1, r.code_postal, r.nom_commune].filter(Boolean).join(' '),
                    r.telephone && 'tél. ' + r.telephone, r.mail, r.web,
                    r.libelle_academie && 'académie de ' + r.libelle_academie,
                    r.etat === 'FERME' && 'fermé')
            }))
        },
        /* Sept à dix périodes par académie et par année : plus que Recherche.NOMBRE. */
        vacances_scolaires: {
            nom: 'Calendrier scolaire',
            adresse: (q) => opendatasoft('https://data.education.gouv.fr', 'fr-en-calendrier-scolaire', q, 30, '&order_by=start_date'),
            extraire: (corps) => (corps.results || []).map(r => ({
                title: r.description + ' ' + r.annee_scolaire + ' (' + r.location + ')',
                url: 'https://data.education.gouv.fr/explore/dataset/fr-en-calendrier-scolaire/',
                desc: accoler(r.zones, r.population !== '-' && r.population,
                    'du ' + jourLocal(r.start_date) + ' au ' + jourLocal(r.end_date))
            }))
        },
        adresse: {
            nom: 'Base adresse nationale',
            adresse: (q, n) => 'https://data.geopf.fr/geocodage/search?limit=' + n + '&q=' + encodeURIComponent(q),
            extraire: (corps) => (corps.features || []).map(f => ({
                title: f.properties.label,
                url: 'https://www.geoportail.gouv.fr/carte?c=' + f.geometry.coordinates.join(',') + '&z=18&permalink=yes',
                desc: accoler(f.properties.postcode && 'code postal ' + f.properties.postcode,
                    f.properties.citycode && 'code INSEE ' + f.properties.citycode, f.properties.context)
            }))
        },
        commune: {
            nom: 'API Géo',
            adresse: (q, n) => 'https://geo.api.gouv.fr/communes?limit=' + n
                + '&fields=nom,code,codesPostaux,population,surface,departement,region&'
                + (/^\d{5}$/.test(q.trim()) ? 'codePostal=' : 'nom=') + encodeURIComponent(q.trim()),
            extraire: (corps) => (Array.isArray(corps) ? corps : []).map(c => ({
                title: c.nom,
                url: 'https://www.insee.fr/fr/statistiques/2011101?geo=COM-' + c.code,
                desc: accoler('code INSEE ' + c.code,
                    c.codesPostaux && 'codes postaux ' + c.codesPostaux.join(', '),
                    c.population && c.population + ' habitants',
                    /* Surface en hectares. */
                    c.surface && Math.round(c.surface) / 100 + ' km²',
                    c.departement && c.departement.nom + ' (' + c.departement.code + ')',
                    c.region && c.region.nom)
            }))
        },
        /* Le champ donnees pèse des dizaines de ko par avis : on choisit les champs. */
        marches_publics: {
            nom: 'BOAMP',
            adresse: (q, n) => opendatasoft('https://boamp-datadila.opendatasoft.com', 'boamp', q, n,
                '&select=objet,nomacheteur,nature_libelle,procedure_libelle,dateparution,datelimitereponse,code_departement,url_avis'
                + '&order_by=' + encodeURIComponent('dateparution desc')),
            extraire: (corps) => (corps.results || []).map(r => ({
                title: r.objet,
                url: r.url_avis,
                desc: accoler(r.nomacheteur, r.nature_libelle, r.procedure_libelle,
                    r.dateparution && 'publié le ' + r.dateparution,
                    r.datelimitereponse && 'réponse avant le ' + r.datelimitereponse.slice(0, 10),
                    (r.code_departement || []).length && 'département ' + r.code_departement.join(', '))
            }))
        }
    },

    /**
     * Outils proposés au modèle, au format "tools" de l'API.
     *
     * @returns {Array<Object>} Une entrée par service, avec un paramètre q.
     */
    outils() {
        return Object.keys(this.TABLE).map(nom => definirOutil(nom, { q: { type: 'string' } }, ['q']));
    }
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = Services;
}
