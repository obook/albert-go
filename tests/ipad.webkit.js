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
 * Projet : Albert Go, https://github.com/obook/albert-go
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
    /* Comme sur Pages : pas de serveur.js, donc version en ligne, ici avec une clé déjà saisie. */
    await contexte.addInitScript(() => {
        localStorage.setItem('albert-go.cle', 'sk-test');
        sessionStorage.setItem('albert-go.cle', 'sk-test');
    });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (err) => erreurs.push(String(err)));

    await page.goto(origine + '/');
    await page.click('#ouvrir-bibliotheque');
    await page.setInputFiles('#fichier-sources', path.join(__dirname, 'fixtures', 'programme.pdf'));
    await page.waitForFunction(() => !depotEnCours);

    /* "À propos" lit la charge du relais : sa ligne doit exister (16/10/2026). */
    await page.evaluate(() => $('ouvrir-info').click());
    await page.evaluate(() => $('info').close());

    const { textes, etat } = await page.evaluate(() => ({ textes: bibliotheque.map((d) => d.texte), etat: $('etat').textContent }));
    assert.match(textes.join(''), /physique-chimie/, 'PDF non lu, message affiché : ' + etat);
    assert.deepStrictEqual(erreurs, []);
});

test("iPad (WebKit) : un script raté au lancement recharge la page une fois", async (t) => {
    const serveur = await servir();
    const origine = 'http://127.0.0.1:' + serveur.address().port;
    const navigateur = await webkit.launch();
    t.after(async () => {
        await navigateur.close();
        serveur.close();
    });
    const contexte = await navigateur.newContext({ ...devices['iPad (gen 7)'], serviceWorkers: 'block' });
    await contexte.route((url) => url.origin !== origine, (route) => route.abort());
    /* Comme sur le Pixel le 11/11/2026 : rendu/images.js perdu au premier chargement seulement. */
    let rates = 0;
    await contexte.route('**/js/rendu/images.js*', (route) => (rates++ ? route.continue() : route.abort()));
    const page = await contexte.newPage();
    let chargements = 0;
    page.on('request', (requete) => requete.isNavigationRequest() && chargements++);

    await page.goto(origine + '/');
    await page.waitForFunction(() => typeof Rendu.imagesCommons === 'function', null, { timeout: 10000 });
    /* serveur.js manque, comme sur Pages : il ne doit pas compter. */
    assert.strictEqual(chargements, 2);
});

test("iPad (WebKit) : chaque compétence activée part avec la consigne, et plus après l'avoir désactivée", async (t) => {
    const serveur = await servir();
    const origine = 'http://127.0.0.1:' + serveur.address().port;
    const navigateur = await webkit.launch();
    t.after(async () => {
        await navigateur.close();
        serveur.close();
    });
    const contexte = await navigateur.newContext({ ...devices['iPad (gen 7)'], serviceWorkers: 'block' });
    const consignes = [];
    await contexte.route((url) => url.origin !== origine, (route) => {
        if (!route.request().url().endsWith('/chat/completions')) {
            return route.abort();
        }
        consignes.push(route.request().postDataJSON().messages[0].content);
        return route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: 'Réponse' }, finish_reason: 'stop' }] } });
    });
    await contexte.addInitScript(() => {
        localStorage.setItem('albert-go.cle', 'sk-test');
        sessionStorage.setItem('albert-go.cle', 'sk-test');
        localStorage.setItem('albert-go.style-direct', 'oui');
    });
    const page = await contexte.newPage();
    const demander = async (question) => {
        const attendues = consignes.length + 1;
        await page.fill('#saisie', question);
        await page.press('#saisie', 'Enter');
        await page.waitForFunction((n) => !annulation && $('fil').querySelectorAll('li.assistant').length === n, attendues);
    };

    await page.goto(origine + '/');
    /* Écriture soignée activée par défaut, Style direct activé par l'utilisateur. */
    assert.ok(await page.isChecked('#ecriture-soignee'));
    assert.ok(await page.isChecked('#style-direct'));
    await demander('Bonjour');
    await page.evaluate(() => $('style-direct').click());
    await demander('Encore');
    await page.evaluate(() => $('ecriture-soignee').click());
    await demander('Fin');
    assert.match(consignes[0], /Careful writing[\s\S]*Plain style/);
    assert.match(consignes[1], /Careful writing/);
    assert.doesNotMatch(consignes[1], /Plain style/);
    assert.doesNotMatch(consignes[2], /Careful writing|Plain style/);
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('albert-go.ecriture-soignee')), 'non');
    /* Sans redite, activée par défaut, ne part qu'avec l'Imprimerie. */
    assert.ok(consignes.every(c => !/No repetition/.test(c)));
    assert.match(await page.evaluate(() => consigne('projet')), /No repetition/);
    await page.evaluate(() => $('sans-redite').click());
    assert.doesNotMatch(await page.evaluate(() => consigne('projet')), /No repetition/);
});

test("iPad (WebKit) : Discussion régénère une réponse, modifie la question et passe d'une version à l'autre", async (t) => {
    const serveur = await servir();
    const origine = 'http://127.0.0.1:' + serveur.address().port;
    const navigateur = await webkit.launch();
    t.after(async () => {
        await navigateur.close();
        serveur.close();
    });
    const contexte = await navigateur.newContext({ ...devices['iPad (gen 7)'], serviceWorkers: 'block' });
    /* Albert simulé : chaque réponse porte son numéro et la dernière question reçue. */
    let appels = 0;
    await contexte.route((url) => url.origin !== origine, (route) => {
        if (!route.request().url().endsWith('/chat/completions')) {
            return route.abort();
        }
        appels += 1;
        const question = route.request().postDataJSON().messages.at(-1).content;
        return route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: 'Réponse ' + appels + ' à ' + question }, finish_reason: 'stop' }] } });
    });
    await contexte.addInitScript(SAFARI_ANCIEN);
    await contexte.addInitScript(() => {
        localStorage.setItem('albert-go.cle', 'sk-test');
        sessionStorage.setItem('albert-go.cle', 'sk-test');
    });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (err) => erreurs.push(String(err)));
    const fil = () => page.evaluate(() => ({
        textes: [...$('fil').children].map(li => li.querySelector('.texte') ? li.querySelector('.texte').textContent.trim() : li.textContent.replace(t('vous'), '')),
        numero: ($('fil').querySelector('.versions-echange span') || {}).textContent
    }));
    const attendre = () => page.waitForFunction(() => !annulation);

    await page.goto(origine + '/');
    await page.fill('#saisie', 'Bonjour');
    await page.press('#saisie', 'Enter');
    await attendre();
    await page.click('#fil .actions-reponse [aria-label="' + await page.evaluate(() => t('reponse.regenerer')) + '"]');
    await attendre();
    assert.deepStrictEqual(await fil(), { textes: ['Bonjour', 'Réponse 2 à Bonjour'], numero: '2/2' });

    await page.click('#fil .version-precedente');
    assert.deepStrictEqual(await fil(), { textes: ['Bonjour', 'Réponse 1 à Bonjour'], numero: '1/2' });
    /* Le focus reste sur les flèches : la précédente, grisée, le passe à la suivante. */
    assert.ok(await page.evaluate(() => document.activeElement.classList.contains('version-suivante')));

    await page.click('#fil li.user .bouton-echange');
    assert.strictEqual(await page.inputValue('#saisie'), 'Bonjour');
    await page.fill('#saisie', 'Bonsoir');
    await page.press('#saisie', 'Enter');
    await attendre();
    assert.deepStrictEqual(await fil(), { textes: ['Bonsoir', 'Réponse 3 à Bonsoir'], numero: '3/3' });

    /* Question suivante : l'échange précédent perd ses flèches et ses boutons. */
    await page.fill('#saisie', 'Merci');
    await page.press('#saisie', 'Enter');
    await attendre();
    const apres = await page.evaluate(() => ({
        fleches: $('fil').querySelectorAll('.versions-echange').length,
        modifier: $('fil').querySelectorAll('li.user .bouton-echange').length,
        envoyes: conversation.length
    }));
    assert.deepStrictEqual(apres, { fleches: 0, modifier: 1, envoyes: 4 });
    assert.deepStrictEqual(erreurs, []);
});

test("iPad (WebKit) : la fiche de lecture d'une source s'ouvre par son nom et sa question arrive dans la saisie", async (t) => {
    const serveur = await servir();
    const origine = 'http://127.0.0.1:' + serveur.address().port;
    const navigateur = await webkit.launch();
    t.after(async () => {
        await navigateur.close();
        serveur.close();
    });
    const contexte = await navigateur.newContext({ ...devices['iPad (gen 7)'], serviceWorkers: 'block' });
    /* Albert simulé : une fiche de lecture en JSON, avec du gras, comme la rend Small. */
    const guide = { resume: 'Le **programme** de physique-chimie.', themes: ['Énergie'], questions: ['Que dit le programme ?'] };
    await contexte.route((url) => url.origin !== origine, (route) => (route.request().url().endsWith('/chat/completions')
        ? route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: JSON.stringify(guide) }, finish_reason: 'stop' }] } })
        : route.abort()));
    await contexte.addInitScript(SAFARI_ANCIEN);
    await contexte.addInitScript(() => {
        localStorage.setItem('albert-go.cle', 'sk-test');
        sessionStorage.setItem('albert-go.cle', 'sk-test');
    });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (err) => erreurs.push(String(err)));

    await page.goto(origine + '/');
    await page.click('#ouvrir-bibliotheque');
    await page.setInputFiles('#fichier-sources', path.join(__dirname, 'fixtures', 'programme.pdf'));
    await page.waitForFunction(() => !depotEnCours && !guidesEnCours.size);
    /* Décochée : la question du guide la recoche. */
    await page.click('#liste-documents input[type=checkbox]');
    await page.click('#liste-documents .nom-source');
    assert.strictEqual(await page.textContent('#resume-guide'), 'Le programme de physique-chimie.');
    await page.click('#questions-guide .suggestion');
    assert.strictEqual(await page.inputValue('#saisie'), 'Que dit le programme ?');
    assert.ok(await page.evaluate(() => !$('guide').open && sourcesProjet.length === 1));
    assert.deepStrictEqual(erreurs, []);
});

test("iPad (WebKit) : un texte collé devient une source cochée et une réponse devient une note", async (t) => {
    const serveur = await servir();
    const origine = 'http://127.0.0.1:' + serveur.address().port;
    const navigateur = await webkit.launch();
    t.after(async () => {
        await navigateur.close();
        serveur.close();
    });
    const contexte = await navigateur.newContext({ ...devices['iPad (gen 7)'], serviceWorkers: 'block' });
    /* Albert simulé : une fiche de lecture en JSON, sinon une réponse. */
    await contexte.route((url) => url.origin !== origine, (route) => {
        if (!route.request().url().endsWith('/chat/completions')) {
            return route.abort();
        }
        const fiche = !!route.request().postDataJSON().response_format;
        const contenu = fiche ? JSON.stringify({ resume: 'Les volcans.', themes: [], questions: [] }) : 'Un volcan effusif émet de la lave fluide.';
        return route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: contenu }, finish_reason: 'stop' }] } });
    });
    await contexte.addInitScript(SAFARI_ANCIEN);
    await contexte.addInitScript(() => {
        localStorage.setItem('albert-go.cle', 'sk-test');
        sessionStorage.setItem('albert-go.cle', 'sk-test');
    });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (err) => erreurs.push(String(err)));

    await page.goto(origine + '/');
    await page.click('#ouvrir-bibliotheque');
    await page.click('#coller-texte');
    await page.fill('#texte-colle', 'Le volcan est une ouverture de la croûte terrestre.');
    await page.click('#dialogue-coller button[value=oui]');
    await page.waitForFunction(() => !guidesEnCours.size);
    /* Noms dans la langue du navigateur, l'anglais pour Playwright. */
    const [colle, note] = await page.evaluate(() => [t('documents.texte-colle'), t('documents.note')]);
    assert.deepStrictEqual(await page.evaluate(() => ({ noms: bibliotheque.map(d => d.nom), coches: sourcesProjet, fiche: !!bibliotheque[0].guide })),
        { noms: [colle], coches: [colle], fiche: true });

    await page.evaluate(() => $('bibliotheque').close());
    await page.fill('#saisie', 'Volcan effusif ?');
    await page.press('#saisie', 'Enter');
    await page.waitForFunction(() => !annulation);
    await page.click('#fil li.assistant [aria-label="' + await page.evaluate(() => t('reponse.vers-bibliotheque')) + '"]');
    /* La note n'est pas cochée : la réponse est déjà dans la conversation. */
    assert.deepStrictEqual(await page.evaluate(() => ({ noms: bibliotheque.map(d => d.nom), coches: sourcesProjet, texte: bibliotheque[1].texte })),
        { noms: [colle, note + ' - Volcan effusif ?.md'], coches: [colle], texte: 'Un volcan effusif émet de la lave fluide.' });
    assert.deepStrictEqual(erreurs, []);
});
