/*
 * ipad.webkit.js
 * Albert Go dans WebKit, le moteur de tous les navigateurs de l'iPad : la page
 * se charge sans erreur et un PDF entre dans la bibliothèque.
 *
 * Le WebKit de Playwright est plus récent que le Safari d'un iPad pas à jour :
 * SAFARI_ANCIEN lui retire ce qui manque sur un vrai iPad.
 *
 * Lancement (job "tests" de .gitlab-ci.yml) :
 *   npm i --no-save playwright@1.63.0 && npx playwright install --with-deps webkit
 *   node --test tests/ipad.webkit.js
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { webkit, devices } = require('playwright');

const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain'
};

/* Ce qu'un vrai iPad n'a pas : ajouter ici chaque manque qu'il révèle. */
const SAFARI_ANCIEN = () => {
    /* Parcours d'un flux par for await : absent de l'iPad essayé le 14/10/2026 (getTextContent de pdf.js). */
    delete ReadableStream.prototype[Symbol.asyncIterator];
    /* Absent avant Safari 18.2 (version moderne de pdf.js, vendor/README.md). */
    delete Promise.try;
};

/**
 * Sert public/ sur un port libre.
 *
 * @returns {Promise<http.Server>} Serveur à l'écoute.
 */
function servir() {
    const serveur = http.createServer((requete, reponse) => {
        const chemin = path.join(PUBLIC, decodeURIComponent(new URL(requete.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
        fs.readFile(chemin, (err, contenu) => {
            reponse.writeHead(err ? 404 : 200, { 'Content-Type': TYPES[path.extname(chemin)] || 'application/octet-stream' });
            reponse.end(err ? '' : contenu);
        });
    });
    return new Promise((pret) => serveur.listen(0, '127.0.0.1', () => pret(serveur)));
}

test("iPad (WebKit) : la page se charge sans erreur et un PDF entre dans la bibliothèque", async (t) => {
    const serveur = await servir();
    const origine = 'http://127.0.0.1:' + serveur.address().port;
    const navigateur = await webkit.launch();
    t.after(async () => {
        await navigateur.close();
        serveur.close();
    });
    const contexte = await navigateur.newContext({ ...devices['iPad (gen 7)'], serviceWorkers: 'block' });
    /* Rien hors de la page : ni Albert ni les moteurs de recherche. */
    await contexte.route((url) => url.origin !== origine, (route) => route.abort());
    await contexte.addInitScript(SAFARI_ANCIEN);
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (err) => erreurs.push(String(err)));

    await page.goto(origine + '/');
    await page.click('#ouvrir-bibliotheque');
    await page.setInputFiles('#fichier-sources', path.join(__dirname, 'fixtures', 'programme.pdf'));
    await page.waitForFunction(() => !depotEnCours);

    const { textes, etat } = await page.evaluate(() => ({ textes: bibliotheque.map((d) => d.texte), etat: $('etat').textContent }));
    assert.match(textes.join(''), /physique-chimie/, 'PDF non lu, message affiché : ' + etat);
    assert.deepStrictEqual(erreurs, []);
});
