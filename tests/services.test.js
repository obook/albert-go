/*
 * services.test.js
 * Tests de public/js/tools/services.js : outils, adresses et extraits.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
require('../public/js/i18n.js');
const Recherche = require('../public/js/tools/recherche.js');
globalThis.definirOutil = require('../public/js/tools/calcul.js').definirOutil;
const Services = require('../public/js/tools/services.js');

const { TABLE } = Services;

test('outils : un outil par service, avec ses textes dans les quatre langues', () => {
    for (const langue of ['fr', 'es', 'en', 'de']) {
        I18n.langue = langue;
        const outils = Services.outils();
        assert.deepStrictEqual(outils.map(o => o.function.name), Object.keys(TABLE));
        for (const { function: f } of outils) {
            assert.deepStrictEqual(f.parameters.required, ['q']);
            assert.ok(I18n.existe(f.name + '.description') && I18n.existe(f.name + '.q'), langue + ' ' + f.name);
        }
    }
    assert.ok(I18n.existe('services.rappel'));
    I18n.langue = 'fr';
});

test('annuaire_administration : champs rangés en JSON, horaires résumés', () => {
    const [r] = TABLE.annuaire_administration.extraire({ results: [{
        nom: 'Mairie - Lyon - 2e arrondissement',
        url_service_public: 'https://lannuaire.service-public.gouv.fr/x',
        adresse: '[{"numero_voie": "2 rue d\'Enghien", "code_postal": "69002", "nom_commune": "Lyon"}]',
        telephone: '[{"valeur": "04 78 92 73 00"}]',
        adresse_courriel: 'mairie2@mairie-lyon.fr',
        plage_ouverture: '[{"nom_jour_debut": "Lundi", "nom_jour_fin": "Mercredi", "valeur_heure_debut_1": "08:45:00", "valeur_heure_fin_1": "16:45:00", "valeur_heure_debut_2": ""},'
            + '{"nom_jour_debut": "Jeudi", "nom_jour_fin": "Jeudi", "valeur_heure_debut_1": "08:45:00", "valeur_heure_fin_1": "12:00:00", "valeur_heure_debut_2": "14:00:00", "valeur_heure_fin_2": "16:45:00"}]',
        site_internet: 'pas du JSON'
    }] });
    assert.strictEqual(r.url, 'https://lannuaire.service-public.gouv.fr/x');
    assert.strictEqual(r.desc, '2 rue d\'Enghien 69002 Lyon ; tél. 04 78 92 73 00 ; mairie2@mairie-lyon.fr ; '
        + 'Lundi-Mercredi 08:45-16:45, Jeudi 08:45-12:00 14:00-16:45');
});

test('entreprise : le siège, jamais les dirigeants', () => {
    const [r] = TABLE.entreprise.extraire({ results: [{
        nom_complet: 'DINUM', siren: '130025265', activite_principale: '84.11Z', etat_administratif: 'A',
        date_creation: '2017-05-24', siege: { siret: '13002526500013', adresse: '20 AVENUE DE SEGUR 75007 PARIS' },
        dirigeants: [{ nom: 'Dupont', prenoms: 'Jean' }]
    }] });
    assert.strictEqual(r.url, 'https://annuaire-entreprises.data.gouv.fr/entreprise/130025265');
    assert.match(r.desc, /SIRET du siège 13002526500013/);
    assert.match(r.desc, /active/);
    assert.doesNotMatch(r.desc, /Dupont/);
});

test('vacances_scolaires : minuit à Paris ou outre-mer redevient le bon jour', () => {
    const [metropole, reunion] = TABLE.vacances_scolaires.extraire({ results: [
        { description: 'Vacances de la Toussaint', annee_scolaire: '2026-2027', location: 'Lyon', zones: 'Zone A', population: '-',
            start_date: '2026-10-16T22:00:00+00:00', end_date: '2026-11-01T23:00:00+00:00' },
        { description: 'Vacances de la Toussaint', annee_scolaire: '2026-2027', location: 'La Réunion', zones: 'Réunion', population: '-',
            start_date: '2026-10-16T20:00:00+00:00', end_date: '2026-11-01T20:00:00+00:00' }
    ] });
    assert.match(metropole.desc, /du 2026-10-17 au 2026-11-02/);
    assert.match(reunion.desc, /du 2026-10-17 au 2026-11-02/);
    assert.doesNotMatch(metropole.desc, /-  ;|; - /);
});

test('commune : un code postal cherche par code, un nom par nom', () => {
    assert.match(TABLE.commune.adresse('69100', 5), /codePostal=69100/);
    assert.match(TABLE.commune.adresse('Villeurbanne', 5), /nom=Villeurbanne/);
    const [c] = TABLE.commune.extraire([{ nom: 'Villeurbanne', code: '69266', codesPostaux: ['69100'], population: 163684,
        surface: 1490.12, departement: { code: '69', nom: 'Rhône' }, region: { nom: 'Auvergne-Rhône-Alpes' } }]);
    assert.strictEqual(c.url, 'https://www.insee.fr/fr/statistiques/2011101?geo=COM-69266');
    assert.match(c.desc, /163684 habitants ; 14\.9 km²/);
});

test('adresse : lien vers le Géoportail à la position trouvée', () => {
    const [a] = TABLE.adresse.extraire({ features: [{ geometry: { coordinates: [2.308, 48.85] },
        properties: { label: '20 Avenue de Ségur 75007 Paris', postcode: '75007', citycode: '75107', context: '75, Paris, Île-de-France' } }] });
    assert.strictEqual(a.url, 'https://www.geoportail.gouv.fr/carte?c=2.308,48.85&z=18&permalink=yes');
    assert.match(a.desc, /code INSEE 75107/);
});

/* L'API v1 exige chaque mot tel quel : "transports Rennes" n'y trouvait rien (16/10/2026). */
test('donnees_publiques : recherche de l\'API v2, souple sur les mots', () => {
    assert.match(TABLE.donnees_publiques.adresse('transports Rennes', 5),
        /^https:\/\/www\.data\.gouv\.fr\/api\/2\/datasets\/search\/\?page_size=5&q=transports%20Rennes$/);
});

test('marches_publics : champs choisis, du plus récent au plus ancien', () => {
    const adresse = decodeURIComponent(TABLE.marches_publics.adresse('nettoyage Lyon', 5));
    assert.match(adresse, /where="nettoyage Lyon"/);
    assert.match(adresse, /select=/);
    assert.match(adresse, /order_by=dateparution desc/);
});

test('formation_parcoursup : sessions récentes demandées, la dernière de chaque formation gardée', () => {
    const annee = new Date().getFullYear();
    const adresse = decodeURIComponent(TABLE.formation_parcoursup.adresse('licence droit Nantes'));
    assert.ok(adresse.includes('where="licence droit Nantes" and annee in ("' + (annee - 1) + '", "' + annee + '", "' + (annee + 1) + '")&select='));
    const formation = { etab_uai: '0442953W', etab_nom: 'Nantes Université (44)', nm: ['Licence - Droit'], fl: ['L1 - Droit'],
        tc: 'Publics', commune: 'Nantes', departement: 'Loire-Atlantique', region: 'Pays de la Loire' };
    const resultats = TABLE.formation_parcoursup.extraire({ results: [
        { ...formation, annee: '2025', fiche: 'https://dossierappel.parcoursup.fr/fiche-2025' },
        { ...formation, annee: '2026', fiche: 'https://dossierappel.parcoursup.fr/fiche-2026' },
        { ...formation, etab_uai: '0442777E', etab_nom: 'UCO (Rezé - 44)', annee: '2026', fiche: 'https://dossierappel.parcoursup.fr/uco' }
    ] });
    assert.deepStrictEqual(resultats.map(r => r.url), ['https://dossierappel.parcoursup.fr/fiche-2026', 'https://dossierappel.parcoursup.fr/uco']);
    assert.strictEqual(resultats[0].title, 'Licence - Droit - Nantes Université (44)');
    assert.strictEqual(resultats[0].desc, 'session 2026 ; Publics ; L1 - Droit ; Nantes, Loire-Atlantique, Pays de la Loire');
});

test('eau_potable : code INSEE ou nom, une ligne par prélèvement', () => {
    assert.match(TABLE.eau_potable.adresse('69266'), /&code_commune=69266$/);
    assert.match(TABLE.eau_potable.adresse('2A004'), /&code_commune=2A004$/);
    assert.match(TABLE.eau_potable.adresse('Saint-Étienne'), /&nom_commune=Saint-%C3%89tienne$/);
    const ligne = { code_commune: '69266', nom_commune: 'VILLEURBANNE', nom_distributeur: 'EAU DU GRAND LYON',
        conclusion_conformite_prelevement: 'Eau d\'alimentation conforme.' };
    const resultats = TABLE.eau_potable.extraire({ data: [
        { ...ligne, code_prelevement: 'B', date_prelevement: '2026-07-23T13:27:00Z', libelle_parametre: 'Titre alcalimétrique complet',
            resultat_alphanumerique: '17,60', libelle_unite: '°f' },
        { ...ligne, code_prelevement: 'B', date_prelevement: '2026-07-23T13:27:00Z', libelle_parametre: 'pH',
            resultat_alphanumerique: '7,5', libelle_unite: 'unité pH' },
        { ...ligne, code_prelevement: 'A', date_prelevement: '2026-07-10T08:00:00Z', libelle_parametre: 'Nitrates',
            resultat_alphanumerique: '4,2', libelle_unite: 'mg/L' }
    ] });
    assert.strictEqual(resultats.length, 2);
    assert.strictEqual(resultats[0].title, 'Eau du robinet à VILLEURBANNE, prélèvement du 2026-07-23');
    assert.strictEqual(resultats[0].desc, 'Eau d\'alimentation conforme. ; distributeur EAU DU GRAND LYON ; '
        + 'Titre alcalimétrique complet 17,60 °f, pH 7,5 unité pH');
    assert.match(resultats[1].url, /code_commune=69266$/);
    assert.deepStrictEqual(TABLE.eau_potable.extraire({}), []);
});

test('chercherBase : un service répond comme une base de Recherche', async () => {
    let vue = '';
    global.fetch = async (adresse) => {
        vue = adresse;
        return { ok: true, json: async () => ({ results: [{ nom_etablissement: 'Lycée Ampère', nom_commune: 'Lyon',
            identifiant_de_l_etablissement: '0690023A', type_etablissement: 'Lycée', libelle_academie: 'Lyon' }] }) };
    };
    const [r] = await Recherche.chercherBase(TABLE.etablissement_scolaire, 'lycée "Ampère" Lyon');
    /* Guillemets retirés par Recherche.replis : ils fermeraient la requête. */
    assert.match(decodeURIComponent(vue), /where=search\(nom_etablissement, .*nom_commune, .*"lycée Ampère Lyon"\)/);
    /* "Lille" trouvait chaque établissement de l'académie de Lille. */
    assert.doesNotMatch(decodeURIComponent(vue), /academie|mail|web/);
    assert.strictEqual(r.title, 'Lycée Ampère (Lyon)');
    assert.match(r.url, /0690023A/);
});
