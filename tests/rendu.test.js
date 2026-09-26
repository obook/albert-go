/*
 * rendu.test.js
 * Tests de public/js/rendu.js : formules protégées, adresses dangereuses,
 * réparation des diagrammes Mermaid.
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
global.marked = require('../public/vendor/marked/marked.umd.js');
const Rendu = require('../public/js/rendu.js');

test('versHtml : les formules traversent Marked intactes', () => {
    const html = Rendu.versHtml('Soit $\\frac{a}{b}$ et\n\n\\[x_1 = \\sqrt{2}\\]\n\n**gras**');
    assert.ok(html.includes('$\\frac{a}{b}$'));
    assert.ok(html.includes('\\[x_1 = \\sqrt{2}\\]'));
    assert.ok(html.includes('<strong>gras</strong>'));
});

test('urlDangereuse : schémas exécutables refusés', () => {
    assert.ok(Rendu.urlDangereuse('href', 'java\tscript:alert(1)'));
    assert.ok(Rendu.urlDangereuse('src', 'data:image/svg+xml;base64,AAAA'));
    assert.ok(Rendu.urlDangereuse('href', 'data:text/html,<b>'));
    assert.ok(!Rendu.urlDangereuse('href', 'https://albert.api.etalab.gouv.fr'));
    assert.ok(!Rendu.urlDangereuse('src', 'data:image/png;base64,AAAA'));
    assert.ok(!Rendu.urlDangereuse('title', 'javascript:x'));
});

test('attributInterdit : gestionnaires, styles et adresses exécutables', () => {
    assert.ok(Rendu.attributInterdit('onclick', 'alert(1)'));
    assert.ok(Rendu.attributInterdit('onerror', ''));
    /* style sert aux fonds et aux positions absolues : il ne vient pas du modèle. */
    assert.ok(Rendu.attributInterdit('style', 'position:fixed'));
    assert.ok(Rendu.attributInterdit('href', 'javascript:alert(1)'));
    assert.ok(Rendu.attributInterdit('src', 'data:text/html,<b>'));
    assert.ok(!Rendu.attributInterdit('href', 'https://eduscol.education.fr'));
    assert.ok(!Rendu.attributInterdit('class', 'important'));
    assert.ok(!Rendu.attributInterdit('title', 'onclick'));
});

test('BALISES_INTERDITES : les balises qui chargent ou exécutent', () => {
    const interdites = Rendu.BALISES_INTERDITES.split(', ');
    for (const balise of ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'svg', 'style']) {
        assert.ok(interdites.includes(balise), balise + ' devrait être retirée');
    }
    /* Le texte et ses liens restent : sans eux il n'y a plus de réponse. */
    for (const balise of ['a', 'p', 'code', 'pre', 'table', 'img']) {
        assert.ok(!interdites.includes(balise), balise + ' ne doit pas être retirée');
    }
});

test('BALISES_INTERDITES_SVG : le HTML embarqué, pas le style', () => {
    const interdites = Rendu.BALISES_INTERDITES_SVG.split(', ');
    /* foreignObject rouvre la porte au HTML au milieu du SVG. */
    assert.ok(interdites.includes('foreignObject'));
    assert.ok(interdites.includes('script'));
    /* Mermaid dessine avec ses propres styles. */
    assert.ok(!interdites.includes('style'));
});

test('BALISES_INTERDITES_SVG_MODELE : ni style global ni animation', () => {
    const interdites = Rendu.BALISES_INTERDITES_SVG_MODELE.split(', ');
    /* <style> du modèle restylerait toute la page ; <set> et <animate> réécrivent un href. */
    for (const balise of ['script', 'foreignObject', 'style', 'animate', 'set']) {
        assert.ok(interdites.includes(balise), balise + ' devrait être retirée');
    }
});

test('assainir : sans DOM, le HTML repart tel quel', () => {
    /* Sous Node le nettoyage est sauté : c'est le navigateur qui le fait. */
    assert.strictEqual(typeof document, 'undefined');
    assert.strictEqual(Rendu.assainir('<p>Texte</p>'), '<p>Texte</p>');
});

test('reparerMermaid : guillemets autour des étiquettes à parenthèses', () => {
    const code = 'graph TD\n A[Début (x)] --> B{Moyenne (sur 20) ?}\n B -->|si (vrai)| C[(Base)]\n C --> D["Déjà (ok)"]';
    assert.strictEqual(Rendu.reparerMermaid(code),
        'graph TD\n A["Début (x)"] --> B{"Moyenne (sur 20) ?"}\n B -->|"si (vrai)"| C[(Base)]\n C --> D["Déjà (ok)"]');
});

test('reparerMermaid : fautes reprises d\'albert-board', () => {
    assert.strictEqual(Rendu.reparerMermaid('graph TD\n A[\\"X\\"] → B'), 'graph TD\n A["X"] --> B');
    assert.strictEqual(Rendu.reparerMermaid('graph TD\n J["Triglycéride"} --> K'), 'graph TD\n J["Triglycéride"] --> K');
    assert.strictEqual(Rendu.reparerMermaid('flowchart TD\n subgraph L[""]\n A -->|""| B\n end'),
        'flowchart TD\n subgraph L\n A --> B\n end');
});

test('reparerMermaid : flèche Unicode gardée dans une étiquette', () => {
    assert.strictEqual(Rendu.reparerMermaid('graph TD\n A["x → y"] → B'), 'graph TD\n A["x → y"] --> B');
});

test('reparerMermaid : plage d\'axe xychart seule sur sa ligne', () => {
    assert.strictEqual(Rendu.reparerMermaid('xychart-beta\n y-axis "k€"\n 0 --> 100\n bar [30, 45.5]'),
        'xychart-beta\n y-axis "k€" 0 --> 100\n bar [30, 45.5]');
});

test('reparerMermaid : ligne title avant le type de diagramme', () => {
    assert.strictEqual(Rendu.reparerMermaid('title "Relatifs"\ngraph TD\n A --> B'),
        '---\ntitle: Relatifs\n---\ngraph TD\n A --> B');
});

test('reparerMermaid : A + B devient A & B dans un flowchart', () => {
    assert.strictEqual(Rendu.reparerMermaid('flowchart LR\n HA + BOH -->|Transfert (H⁺)| A & BH\n A & BH --> HA + BOH'),
        'flowchart LR\n HA & BOH -->|"Transfert (H⁺)"| A & BH\n A & BH --> HA & BOH');
    assert.strictEqual(Rendu.reparerMermaid('flowchart LR\n A["Acide (HA)"] + B["Base"] --> C'),
        'flowchart LR\n A["Acide (HA)"] & B["Base"] --> C');
    assert.strictEqual(Rendu.reparerMermaid('flowchart LR\n A["x + y"] --> B'), 'flowchart LR\n A["x + y"] --> B');
    assert.strictEqual(Rendu.reparerMermaid('classDiagram\n class A {\n  +int age\n  B + C\n }'),
        'classDiagram\n class A {\n  +int age\n  B + C\n }');
});

test('chimieMermaid : \\ce{} écrit en texte, indices et charges en Unicode', () => {
    assert.strictEqual(Rendu.chimieMermaid('A["Glycérol, \\ce{C3H8O3}"] --> B["\\ce{SO4^{2-}}"]'),
        'A["Glycérol, C₃H₈O₃"] --> B["SO₄²⁻"]');
    assert.strictEqual(Rendu.chimieMermaid('A["\\ce{I = \\frac{V}{R}}"]'), 'A["I = (V)/(R)"]');
    assert.strictEqual(Rendu.chimieMermaid('A["\\ce{C3H8"]'), 'A["\\ce{C3H8"]');
    assert.strictEqual(Rendu.chimieMermaid('A["Texte { avec } accolades"]'), 'A["Texte { avec } accolades"]');
});

test('nomFigure : date d\'abord, puis le sujet sans rien que Windows refuse', () => {
    const date = new Date(2026, 8, 6, 1, 5, 9);
    assert.strictEqual(Rendu.nomFigure(date, 'png', 'Réaction acide/base : HA + B⁻ ?'), '2026-09-06-01-05-09-reaction-acide-base-ha-b.png');
    assert.strictEqual(Rendu.nomFigure(date, 'svg', 'Cœur *"<>|\\'), '2026-09-06-01-05-09-coeur.svg');
    assert.strictEqual(Rendu.nomFigure(date, 'png', 'En mermaid, fais le schéma de la réaction acide/base'),
        '2026-09-06-01-05-09-en-mermaid-fais-le-schema-de-la-reaction.png');
    assert.strictEqual(Rendu.nomFigure(date, 'png', ''), '2026-09-06-01-05-09-figure.png');
    assert.strictEqual(Rendu.nomFigure(date, 'png', '→ ∑'), '2026-09-06-01-05-09-figure.png');
});

test('titreFigure : title de Mermaid ou <title> du SVG', () => {
    assert.strictEqual(Rendu.titreFigure('---\ntitle: Relatifs\n---\ngraph TD\n A --> B'), 'Relatifs');
    assert.strictEqual(Rendu.titreFigure('xychart-beta\n title "Dépenses"\n bar [1, 2]'), 'Dépenses');
    assert.strictEqual(Rendu.titreFigure('<svg viewBox="0 0 1 1"><title>Triangle</title></svg>'), 'Triangle');
    assert.strictEqual(Rendu.titreFigure('graph TD\n A --> B'), '');
});

test('lienCourt : le site, puis la fin du chemin', () => {
    assert.strictEqual(Rendu.lienCourt('https://commons.wikimedia.org/wiki/File:Tour_Eiffel_Wikimedia_Commons.jpg'),
        'commons.wikimedia.org › File:Tour_Eiffel_Wikimedia_Commons.jpg');
    assert.strictEqual(Rendu.lienCourt('https://www.education.gouv.fr/'), 'education.gouv.fr');
    assert.strictEqual(Rendu.lienCourt('https://fr.wikipedia.org/wiki/Ch%C3%A2teau_de_Versailles?x=1#Histoire'), 'fr.wikipedia.org › Château_de_Versailles');
    assert.strictEqual(Rendu.lienCourt('https://exemple.fr/' + 'a'.repeat(60)), 'exemple.fr › ' + 'a'.repeat(40) + '...');
    assert.strictEqual(Rendu.lienCourt('pas une adresse'), 'pas une adresse');
    assert.strictEqual(Rendu.lienCourt('https://exemple.fr/100%'), 'exemple.fr › 100%');
});

test('nomImage : nom du fichier Commons, sans rien que Windows refuse', () => {
    assert.strictEqual(Rendu.nomImage('File:Tour_Eiffel_Wikimedia_Commons.jpg'), 'tour-eiffel-wikimedia-commons.jpg');
    assert.strictEqual(Rendu.nomImage('File:Château de Versailles ? "vue" *2*.JPEG'), 'chateau-de-versailles-vue-2.jpeg');
    assert.strictEqual(Rendu.nomImage('File:→.png'), 'image.png');
});

test('telechargerAvecAttente : bouton inactif pendant la préparation, rendu ensuite, même en échec', async () => {
    const classes = new Set();
    const bouton = { disabled: false, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
    const avant = Rendu.telecharger;
    const recus = [];
    Rendu.telecharger = (fichier, nom) => recus.push(nom);
    global.t = (cle) => cle;
    global.toast = (texte) => recus.push(texte);
    try {
        let finir;
        const attente = Rendu.telechargerAvecAttente(bouton, () => new Promise((r) => { finir = r; }), 'image.jpg');
        assert.ok(bouton.disabled && classes.has('en-cours'));
        finir('contenu');
        await attente;
        assert.ok(!bouton.disabled && !classes.has('en-cours'));
        await Rendu.telechargerAvecAttente(bouton, () => Promise.reject(new Error('réseau')), 'x');
        assert.ok(!bouton.disabled);
        assert.deepStrictEqual(recus, ['image.jpg', 'toast.telechargement-impossible']);
    } finally {
        Rendu.telecharger = avant;
        delete global.t;
        delete global.toast;
    }
});

test('imageApprochee : nom inventé, vraie image qui reprend tous ses mots, sinon rien', async () => {
    const cherches = [];
    global.Recherche = {
        chercherImages: async (mots) => {
            cherches.push(mots);
            return [{ titre: 'File:Munch - Weeping Woman.jpg', desc: '' }, { titre: 'File:Le Chat de Giacometti.jpg', desc: '' },
                { titre: "File:Les Demoiselles d'Avignon (79).jpg", desc: 'Picasso homage' }];
        },
        imageCommons: async (titre) => ({ page: titre })
    };
    try {
        assert.deepStrictEqual(await Rendu.imageApprochee("File:Picasso,_Les_Demoiselles_d'Avignon_(1907).jpg"), { page: "File:Les Demoiselles d'Avignon (79).jpg" });
        assert.strictEqual(cherches[0], "Picasso Les Demoiselles d'Avignon");
        assert.strictEqual(await Rendu.imageApprochee('File:Tour_Eiffel_de_nuit.jpg'), null);
        assert.strictEqual(await Rendu.imageApprochee('File:Picasso_Weeping_Woman_1937.jpg'), null);
    } finally {
        delete global.Recherche;
    }
});
