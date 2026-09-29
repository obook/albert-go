/*
 * recherche.test.js
 * Tests de public/js/tools/recherche.js : mise en forme et clé refusée.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
require('../public/js/i18n.js');
const Recherche = require('../public/js/tools/recherche.js');

test('formater : un numéro par résultat, rien sans résultat', () => {
    const bloc = Recherche.formater(Recherche.numeroter([
        { title: 'Eduscol', url: 'https://eduscol.education.fr', desc: 'Portail' },
        { title: 'Data', link: 'https://data.gouv.fr', snippet: 'Données' }
    ], []));
    assert.strictEqual(bloc.split('\n').length, 2);
    assert.ok(bloc.includes('[1] Eduscol (https://eduscol.education.fr) : Portail'));
    assert.ok(bloc.includes('[2] Data (https://data.gouv.fr) : Données'));
    assert.strictEqual(Recherche.formater([]), '');
});

test('outil : format attendu par le champ tools de l\'API', () => {
    const outil = Recherche.outil();
    assert.strictEqual(outil.type, 'function');
    assert.strictEqual(outil.function.name, 'recherche_web');
    assert.deepStrictEqual(outil.function.parameters.required, ['q']);
    assert.ok(outil.function.description.length > 40);
});

test('outil : la description nomme le moteur et prévient pour un catalogue', () => {
    const encyclopedie = Recherche.outil('wikipedia').function.description;
    const catalogue = Recherche.outil('hal').function.description;
    assert.ok(encyclopedie.includes('Wikipédia'));
    assert.ok(catalogue.includes('HAL'));
    /* Les catalogues ne rendent rien sur une phrase : le modèle doit le savoir. */
    assert.ok(catalogue.length > encyclopedie.length);
    assert.ok(!encyclopedie.includes(t('recherche.description-catalogue')));
});

test('wiki : le domaine suit la langue de l\'interface', () => {
    I18n.definir = (langue) => { I18n.langue = langue; };
    I18n.definir('en');
    assert.strictEqual(Recherche.wiki('wikipedia'), 'https://en.wikipedia.org/w/api.php');
    I18n.definir('fr');
    assert.strictEqual(Recherche.wiki('wikipedia'), 'https://fr.wikipedia.org/w/api.php');
});

test('wiki : Vikidia ignore les langues qu\'elle n\'a pas', () => {
    I18n.definir('es');
    assert.strictEqual(Recherche.wiki('vikidia'), 'https://es.vikidia.org/w/api.php');
    I18n.definir('de');
    assert.strictEqual(Recherche.wiki('vikidia'), 'https://fr.vikidia.org/w/api.php');
    I18n.definir('fr');
});

test('sansCle : seuls Google et Mojeek demandent une clé', () => {
    assert.ok(Recherche.sansCle('wikipedia'));
    assert.ok(Recherche.sansCle('hal'));
    assert.ok(!Recherche.sansCle('google'));
    assert.ok(!Recherche.sansCle('mojeek'));
    /* Un moteur enregistré puis retiré du code. */
    assert.ok(!Recherche.sansCle('qwant'));
});

test('chercherBase : HAL rend ses champs, la description est bornée', async () => {
    let vue = '';
    global.fetch = async (adresse) => {
        vue = adresse;
        return { ok: true, json: async () => ({ response: { docs: [
            { label_s: 'These', uri_s: 'https://hal.science/tel-01', abstract_s: ['x'.repeat(2000)] },
            { label_s: 'Sans adresse' }
        ] } }) };
    };
    const resultats = await Recherche.chercherBase(Recherche.MOTEURS.hal, 'these');
    assert.ok(vue.includes('q=these'));
    assert.ok(!vue.includes('key='));
    /* Sans adresse, le résultat ne serait pas consultable sous la réponse. */
    assert.strictEqual(resultats.length, 1);
    assert.strictEqual(resultats[0].title, 'These');
    assert.strictEqual(resultats[0].desc.length, Recherche.TAILLE_RESUME);
});

test('replis : la phrase, puis ses mots les plus longs dans l\'ordre', () => {
    assert.deepStrictEqual(Recherche.replis('population française 2024 INSEE estimation'), [
        'population française 2024 INSEE estimation',
        'population française estimation',
        'population estimation',
        'population'
    ]);
    /* Deux mots ou moins : aucun catalogue n'a besoin qu'on raccourcisse. */
    assert.deepStrictEqual(Recherche.replis('population France'), ['population France']);
    /* À trois mots, le premier repli refaisait la même requête. */
    assert.deepStrictEqual(Recherche.replis('population française INSEE'),
        ['population française INSEE', 'population française', 'population']);
});

test('chercherBase : la requête raccourcit tant que rien ne vient', async () => {
    const vues = [];
    global.fetch = async (adresse) => {
        vues.push(decodeURIComponent(adresse.split('q=')[1]));
        /* Ces catalogues exigent tous les mots : seule la requête courte répond. */
        const trouve = vues[vues.length - 1] === 'population';
        return { ok: true, json: async () => ({ data: trouve
            ? [{ title: 'Recensement', page: 'https://www.data.gouv.fr/datasets/recensement' }] : [] }) };
    };
    const resultats = await Recherche.chercherBase(Recherche.MOTEURS['data-gouv'], 'quelle est la population');
    assert.strictEqual(vues.length, 4);
    assert.strictEqual(resultats.length, 1);
    assert.strictEqual(resultats[0].title, 'Recensement');
});

test('chercherBase : une base injoignable remonte son code', async () => {
    global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await assert.rejects(Recherche.chercherBase(Recherche.MOTEURS.openalex, 'test'), /503/);
});

test('resumeInverse : le résumé d\'OpenAlex revient en phrase', () => {
    assert.strictEqual(Recherche.resumeInverse({ Le: [0], chat: [1], dort: [2] }), 'Le chat dort');
    assert.strictEqual(Recherche.resumeInverse(null), '');
});

test('chercher : clé refusée, le message de Mojeek remonte', async () => {
    global.fetch = async () => ({
        ok: true,
        json: async () => ({ response: { status: 'Access Denied: invalid key/password', results: [] } })
    });
    await assert.rejects(Recherche.chercher('mojeek', 'fausse', 'test'), /invalid key/);
});

test('chercher : clé refusée, le message de Google remonte', async () => {
    global.fetch = async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 403, message: 'API key not valid' } })
    });
    await assert.rejects(Recherche.chercher('google', 'fausse', 'test'), /API key not valid/);
});

test('chercher : la clé et la question sont encodées dans l\'adresse', async () => {
    let vue = '';
    global.fetch = async (adresse) => {
        vue = adresse;
        return { ok: true, json: async () => ({ response: { results: [{ url: 'https://x' }] } }) };
    };
    const resultats = await Recherche.chercher('mojeek', 'clé/1', 'chat de l\'État');
    assert.ok(vue.includes('api_key=cl%C3%A9%2F1'));
    assert.ok(vue.includes('q=chat%20de%20l\'%C3%89tat') || vue.includes('q=chat%20de%20l%27%C3%89tat'));
    assert.strictEqual(resultats.length, 1);
});

test('chercher : Google renvoie items, avec le moteur cx dans l\'adresse', async () => {
    let vue = '';
    global.fetch = async (adresse) => {
        vue = adresse;
        return { ok: true, json: async () => ({ items: [{ title: 'A', link: 'https://a', snippet: 'b' }] }) };
    };
    const resultats = await Recherche.chercher('google', 'cle', 'test');
    assert.ok(vue.startsWith(Recherche.GOOGLE + '?'));
    assert.ok(vue.includes('cx=' + Recherche.CX));
    assert.strictEqual(resultats[0].link, 'https://a');
});

test('passages : le résumé, puis la section qui répond', () => {
    const article = 'Résumé de l\'article.\n'
        + '== Géographie ==\nLa commune borde l\'océan.\n'
        + '== Toponymie ==\nLe nom est attesté sous la forme Cap Bertou en 1170.';
    const garde = Recherche.passages(article, 'Quelle est l\'origine du nom, sa toponymie ?');
    assert.ok(garde.startsWith('Résumé de l\'article.'));
    assert.ok(garde.includes('Cap Bertou'));
    assert.ok(!garde.includes('borde l\'océan'));
});

test('passages : aucune section ne répond, le résumé seul', () => {
    const article = 'Résumé.\n== Géographie ==\nLa commune borde l\'océan.';
    assert.strictEqual(Recherche.passages(article, 'toponymie étymologie'), 'Résumé.');
});

test('chercherMediaWiki : sans clé, articles dans l\'ordre de la recherche', async () => {
    const vues = [];
    const textes = { Premier: 'A.', Second: 'B.' };
    global.fetch = async (adresse) => {
        vues.push(adresse);
        if (adresse.includes('list=search')) {
            return { ok: true, json: async () => ({ query: { search: [{ title: 'Premier' }, { title: 'Second' }] } }) };
        }
        /* Une requête par titre : le corps ne porte qu'une page. */
        const titre = adresse.includes('Premier') ? 'Premier' : 'Second';
        return { ok: true, json: async () => ({ query: { pages: { '7': {
            title: titre, fullurl: 'https://fr.wikipedia.org/wiki/' + titre, extract: textes[titre]
        } } } }) };
    };
    const resultats = await Recherche.chercherMediaWiki('wikipedia', 'chat de l\'État');
    assert.ok(vues[0].startsWith(Recherche.wiki('wikipedia') + '?'));
    assert.ok(vues.every(adresse => adresse.includes('origin=*')));
    assert.ok(vues.every(adresse => !adresse.includes('key=')));
    /* Jamais deux titres dans la même requête. */
    assert.ok(vues.slice(1).every(adresse => adresse.includes('explaintext=1')));
    assert.strictEqual(vues.length, 3);
    assert.deepStrictEqual(resultats.map(r => r.title), ['Premier', 'Second']);
    assert.strictEqual(resultats[0].desc, 'A.');
    assert.strictEqual(resultats[1].desc, 'B.');
});

test('chercherMediaWiki : une erreur de l\'API remonte', async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ error: { info: 'paramètre inconnu' } }) });
    await assert.rejects(Recherche.chercherMediaWiki('wikipedia', 'test'), /paramètre inconnu/);
});

test('fiche : les champs chiffrés de l\'infobox, que le texte brut perd', () => {
    const wikitexte = '{{Infobox Aire protégée\n'
        + '|nom=Parc provincial de Clearwater River\n'
        + '|pays={{Canada}}\n'
        + '|latitude=<!-- Sur Wikidata -->\n'
        + '|superficie={{unité|2363.1|km|2}}\n'
        + '|site web=\n'
        + '}}\n'
        + 'Le \'\'\'parc\'\'\' est en [[Saskatchewan|Saskatchewan]].';
    const fiche = Recherche.fiche(wikitexte);
    assert.ok(fiche.includes('superficie : 2363.1 km 2'));
    assert.ok(fiche.includes('pays : Canada'));
    /* Champ vide ou réduit à un commentaire : rien à dire au modèle. */
    assert.ok(!fiche.includes('site web'));
    assert.ok(!fiche.includes('latitude'));
    /* Le texte de l'article n'est pas une ligne d'infobox. */
    assert.ok(!fiche.includes('Saskatchewan'));
});

test('fiche : pas d\'infobox, pas de fiche', () => {
    assert.strictEqual(Recherche.fiche('Un article sans infobox.'), '');
    assert.strictEqual(Recherche.avecFiche('', 'Résumé.'), 'Résumé.');
    assert.strictEqual(Recherche.avecFiche('a : b', 'Résumé.'), 'Fiche : a : b\nRésumé.');
});

test('numeroter : les deux jeux de champs, sans les résultats sans adresse', () => {
    const numerotes = Recherche.numeroter([
        { title: 'Eduscol', url: 'https://eduscol.education.fr', desc: 'Portail' },
        { title: 'Data', link: 'https://data.gouv.fr', snippet: 'Données' },
        /* Un résultat sans adresse n'est pas consultable. */
        { title: 'Sans lien', desc: 'Rien à ouvrir' }
    ], []);
    assert.deepStrictEqual(numerotes.map(r => [r.numero, r.titre, r.url, r.extrait]), [
        [1, 'Eduscol', 'https://eduscol.education.fr', 'Portail'],
        [2, 'Data', 'https://data.gouv.fr', 'Données']
    ]);
    assert.deepStrictEqual(Recherche.numeroter([], []), []);
});

test('numeroter : la deuxième recherche continue, une page garde son numéro', () => {
    const faites = [{ mots: 'eduscol', sources: [
        { numero: 1, titre: 'Eduscol', url: 'https://eduscol.education.fr' },
        { numero: 2, titre: 'Data', url: 'https://data.gouv.fr' }
    ] }];
    const numerotes = Recherche.numeroter([
        /* Déjà vue au tour précédent : le modèle ne doit pas la citer deux fois. */
        { title: 'Eduscol', url: 'https://eduscol.education.fr', desc: 'Portail' },
        { title: 'Insee', url: 'https://www.insee.fr', desc: 'Statistiques' }
    ], faites);
    assert.deepStrictEqual(numerotes.map(r => [r.numero, r.connue]), [[1, true], [3, false]]);
});

test('fichierCommons : titre d\'un lien vers un fichier de Commons', () => {
    assert.strictEqual(Recherche.fichierCommons('https://commons.wikimedia.org/wiki/File:Amanda_Lear_1979.jpg'), 'File:Amanda_Lear_1979.jpg');
    assert.strictEqual(Recherche.fichierCommons('https://commons.wikimedia.org/wiki/Fichier:Tour_Eiffel%C3%A9.jpg'), 'Fichier:Tour_Eiffelé.jpg');
    assert.strictEqual(Recherche.fichierCommons('https://commons.wikimedia.org/wiki/Category:Paris'), null);
    assert.strictEqual(Recherche.fichierCommons('https://evil.example/wiki/File:x.jpg'), null);
    assert.strictEqual(Recherche.fichierCommons('https://upload.wikimedia.org/wikipedia/commons/a/a8/Tour_Eiffel.jpg'), 'File:Tour_Eiffel.jpg');
    assert.strictEqual(Recherche.fichierCommons('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel.jpg/480px-Tour_Eiffel.jpg'), 'File:Tour_Eiffel.jpg');
    assert.strictEqual(Recherche.fichierCommons('https://upload.wikimedia.org/wikipedia/fr/a/a8/Logo.png'), null);
});

test('lireImageCommons : miniature, auteur et licence, seulement une image', () => {
    const corps = (mime, thumburl) => ({ query: { pages: { 1: { title: 'File:A.jpg', imageinfo: [{
        mime, thumburl, url: 'https://upload.wikimedia.org/a/A.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:A.jpg',
        extmetadata: { Artist: { value: '<a href="x">Jean <b>Dupont</b></a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' },
            ImageDescription: { value: '<p>Picasso&#039;s  <i>homage</i></p>' },
            DateTimeOriginal: { value: 'between 1975 and 1981<div style="display: none;">date QS:P,+1950-00-00T00:00:00Z/7</div>' } }
    }] } } } });
    assert.deepStrictEqual(Recherche.lireImageCommons(corps('image/jpeg', 'https://upload.wikimedia.org/a/480px-A.jpg')), {
        src: 'https://upload.wikimedia.org/a/480px-A.jpg', description: "Picasso's homage", date: '1975-1981', original: 'https://upload.wikimedia.org/a/A.jpg', auteur: 'Jean Dupont', licence: 'CC BY-SA 4.0',
        page: 'https://commons.wikimedia.org/wiki/File:A.jpg'
    });
    assert.strictEqual(Recherche.lireImageCommons(corps('image/png', 'https://thumb.wikimedia.org/b.png')).src, 'https://thumb.wikimedia.org/b.png');
    assert.strictEqual(Recherche.lireImageCommons(corps('application/pdf', 'https://upload.wikimedia.org/a.jpg')), null);
    assert.strictEqual(Recherche.lireImageCommons(corps('image/jpeg', 'https://evil.example/a.jpg')), null);
    assert.strictEqual(Recherche.lireImageCommons({ query: { pages: { '-1': { missing: '' } } } }), null);
});

test('lireImagesTrouvees : vrais fichiers de Commons, dans l\'ordre, avec leur page', () => {
    const corps = { query: { pages: {
        9: { index: 2, title: 'File:Bordeaux nuit.jpg', imageinfo: [{ extmetadata: { ImageDescription: { value: '<p>Quais de la <b>Garonne</b></p>' } } }] },
        4: { index: 1, title: 'File:Place de la Bourse.jpg', imageinfo: [{}] }
    } } };
    assert.deepStrictEqual(Recherche.lireImagesTrouvees(corps), [
        { titre: 'File:Place de la Bourse.jpg', url: 'https://commons.wikimedia.org/wiki/File:Place_de_la_Bourse.jpg', desc: '' },
        { titre: 'File:Bordeaux nuit.jpg', url: 'https://commons.wikimedia.org/wiki/File:Bordeaux_nuit.jpg', desc: 'Quais de la Garonne' }
    ]);
    assert.strictEqual(Recherche.fichierCommons(Recherche.lireImagesTrouvees(corps)[0].url), 'File:Place_de_la_Bourse.jpg');
    assert.deepStrictEqual(Recherche.lireImagesTrouvees({}), []);
});

test('outilImages : outil image_commons avec un paramètre q', () => {
    const outil = Recherche.outilImages();
    assert.strictEqual(outil.function.name, 'image_commons');
    assert.deepStrictEqual(outil.function.parameters.required, ['q']);
});

test('garderNomsPropres : chaque nom propre cherché doit figurer dans le nom ou la description', () => {
    const images = [
        { titre: 'File:Mädchen vor Spiegel (Ernst Ludwig Kirchner).jpg', desc: 'Girl in Front of a Mirror' },
        { titre: 'File:The Blue Room.jpg', desc: 'The Blue Room, by Pablo Picasso' }
    ];
    assert.deepStrictEqual(Recherche.garderNomsPropres(images, 'Picasso girl mirror').map(i => i.titre), ['File:The Blue Room.jpg']);
    assert.strictEqual(Recherche.garderNomsPropres(images, 'girl mirror').length, 2);
});
