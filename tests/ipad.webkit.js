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

/**
 * Ouvre la page et attend chargement.js : HTML de pages/ placé, scripts exécutés (html[data-pret]).
 * L'événement load de la page n'attend pas ces fichiers, lus après lui.
 *
 * @param {import('playwright').Page} page - Onglet du navigateur.
 * @param {string} adresse - Adresse de la page.
 */
async function ouvrir(page, adresse) {
    await page.goto(adresse);
    await page.waitForFunction(() => 'pret' in document.documentElement.dataset);
}

/**
 * Recharge la page et attend chargement.js, comme ouvrir.
 *
 * @param {import('playwright').Page} page - Onglet du navigateur.
 */
async function recharger(page) {
    await page.reload();
    await page.waitForFunction(() => 'pret' in document.documentElement.dataset);
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

    await ouvrir(page, origine + '/');
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

    await ouvrir(page, origine + '/');
    /* typeof Rendu : pendant le rechargement, la variable n'existe pas encore. */
    await page.waitForFunction(() => typeof Rendu === 'object' && typeof Rendu.imagesCommons === 'function', null, { timeout: 10000 });
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
    });
    const page = await contexte.newPage();
    const demander = async (question) => {
        const attendues = consignes.length + 1;
        await page.fill('#saisie', question);
        await page.press('#saisie', 'Enter');
        await page.waitForFunction((n) => !annulation && $('fil').querySelectorAll('li.assistant').length === n, attendues);
    };

    await ouvrir(page, origine + '/');
    /* Les deux compétences sont activées par défaut. */
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

    await ouvrir(page, origine + '/');
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

    await ouvrir(page, origine + '/');
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

    await ouvrir(page, origine + '/');
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

test("iPad (WebKit) : un numéro de passage cité ouvre le passage sous la réponse", async (t) => {
    const serveur = await servir();
    const origine = 'http://127.0.0.1:' + serveur.address().port;
    const navigateur = await webkit.launch();
    t.after(async () => {
        await navigateur.close();
        serveur.close();
    });
    const contexte = await navigateur.newContext({ ...devices['iPad (gen 7)'], serviceWorkers: 'block' });
    /* Albert simulé : il cite le passage 1 et un passage 9 qui n'existe pas. */
    const consignes = [];
    await contexte.route((url) => url.origin !== origine, (route) => {
        if (!route.request().url().endsWith('/chat/completions')) {
            return route.abort();
        }
        const fiche = !!route.request().postDataJSON().response_format;
        if (!fiche) {
            consignes.push(route.request().postDataJSON().messages[0].content);
        }
        const contenu = fiche ? JSON.stringify({ resume: 'Les volcans.', themes: [], questions: [] }) : 'Une ouverture de la croûte [P1]【P9】.';
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

    await ouvrir(page, origine + '/');
    await page.click('#ouvrir-bibliotheque');
    await page.click('#coller-texte');
    await page.fill('#texte-colle', 'Le volcan est une ouverture de la croûte terrestre.');
    await page.click('#dialogue-coller button[value=oui]');
    await page.waitForFunction(() => !guidesEnCours.size);
    await page.evaluate(() => $('bibliotheque').close());
    await page.fill('#saisie', 'Qu\'est-ce qu\'un volcan ?');
    await page.press('#saisie', 'Enter');
    await page.waitForFunction(() => !annulation && $('fil').querySelector('.citation'));

    assert.match(consignes[0], /\[P1\]\nLe volcan est une ouverture/);
    assert.match(consignes[0], /"volcan"[^\n]*P1\./);
    assert.deepStrictEqual(await page.evaluate(() => [...$('fil').querySelectorAll('.citation')].map(b => b.textContent)), ['P1']);
    assert.strictEqual((await page.textContent('#fil li.assistant .texte')).trim(), 'Une ouverture de la croûte (P1).');
    /* Citations masquées par défaut, montrées par la case de la bibliothèque, réglage gardé au rechargement. */
    assert.ok(!await page.isVisible('#fil .citation'));
    await page.click('#ouvrir-bibliotheque');
    await page.click('#afficher-citations');
    await page.evaluate(() => $('bibliotheque').close());
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('albert-go.citations')), 'oui');
    await page.click('#fil .citation');
    assert.match(await page.textContent('#fil .passage'), /Le volcan est une ouverture de la croûte terrestre\./);
    assert.ok(await page.isVisible('#fil .passage'));
    await page.click('#fil .citation');
    assert.ok(!await page.isVisible('#fil .passage'));
    assert.deepStrictEqual(erreurs, []);
});

test("iPad (WebKit) : les citations donnent la page, une plage ouvre tous ses passages", async (t) => {
    const serveur = await servir();
    const navigateur = await webkit.launch();
    t.after(async () => {
        await navigateur.close();
        serveur.close();
    });
    const page = await (await navigateur.newContext({ ...devices['iPad (gen 7)'], locale: 'fr-FR', serviceWorkers: 'block' })).newPage();
    const erreurs = [];
    page.on('pageerror', (err) => erreurs.push(String(err)));
    await ouvrir(page, 'http://127.0.0.1:' + serveur.address().port + '/');

    /* Passages 1 à 4 d'un PDF (pages 4, 4, 5, 6) ; avec une note, passage 5 d'un texte sans pages. */
    const rendu = (texte, note = false) => page.evaluate(([texte, note]) => {
        const pdf = (n, page) => ({ n, nom: 'Programme.pdf', pages: true, page, chemin: '', texte: 'Texte ' + n });
        const passages = [pdf(1, 4), pdf(2, 4), pdf(3, 5), pdf(4, 6)];
        if (note) {
            passages.push({ n: 5, nom: 'Note', pages: false, page: 1, chemin: '', texte: 'Texte 5' });
        }
        const carte = document.createElement('div');
        carte.className = 'carte';
        carte.innerHTML = '<p></p><p class="passage" hidden></p>';
        carte.firstChild.textContent = texte;
        document.body.append(carte);
        lierCitations(carte.firstChild, passages, carte.lastChild);
        const boutons = [...carte.querySelectorAll('.citation')];
        const ouverts = boutons.map((b) => {
            b.click();
            return (carte.lastChild.textContent.match(/Texte \d/g) || []).join(',');
        });
        return { texte: carte.firstChild.textContent, ouverts };
    }, [texte, note]);

    assert.deepStrictEqual(await rendu('Vu [P1].'), { texte: 'Vu (p. 4).', ouverts: ['Texte 1'] });
    assert.deepStrictEqual(await rendu('Vu [P1, P2].'), { texte: 'Vu (p. 4).', ouverts: ['Texte 1,Texte 2'] });
    assert.deepStrictEqual(await rendu('Vu [P1][P4].'), { texte: 'Vu (p. 4, p. 6).', ouverts: ['Texte 1', 'Texte 4'] });
    assert.deepStrictEqual(await rendu('Vu [P2-P4].'), { texte: 'Vu (p. 4 à 6).', ouverts: ['Texte 2,Texte 3,Texte 4'] });
    assert.deepStrictEqual(await rendu('Vu [P1 à P2].'), { texte: 'Vu (p. 4).', ouverts: ['Texte 1,Texte 2'] });
    assert.deepStrictEqual(await rendu('Vu [P3-P9] et [P8].'), { texte: 'Vu (p. 5 à 6) et .', ouverts: ['Texte 3,Texte 4'] });
    /* Deux sources : le nom du document, sans extension, devant ses pages. */
    assert.deepStrictEqual(await rendu('Vu [P1, P4, P5].', true), { texte: 'Vu (Programme, p. 4, p. 6 ; Note, P5).', ouverts: ['Texte 1', 'Texte 4', 'Texte 5'] });
    /* Plage à cheval sur deux sources : numéros de passages, faute d'une page commune. */
    assert.deepStrictEqual(await rendu('Vu [P3-P9].', true), { texte: 'Vu (Programme, P3 à P5).', ouverts: ['Texte 3,Texte 4,Texte 5'] });
    assert.deepStrictEqual(await page.evaluate(() => [
        'Annexe 2 - Programme de mathématiques pour le cycle 4-480716.pdf', '26-Maths-C4-reperes-eduscol_1114756.pdf', 'Cycle 4 - Compétences'
    ].map(nomCourt)), ['Annexe 2 - Programme de mathém...', '26-Maths-C4-reperes-eduscol', 'Cycle 4 - Compétences']);

    /* Copie : citations comme à l'écran si la case les montre, retirées sinon. */
    const copie = (visibles) => page.evaluate((visibles) => {
        document.documentElement.classList.toggle('citations-visibles', visibles);
        const passages = [1, 2].map(n => ({ n, nom: 'Programme', pages: true, page: 4 + n, chemin: '', texte: '' }));
        return texteCitations('Vu [P1] et [P1-P2], fin [P9].', passages);
    }, visibles);
    assert.strictEqual(await copie(true), 'Vu (p. 5) et (p. 5 à 6), fin.');
    assert.strictEqual(await copie(false), 'Vu et, fin.');
    assert.deepStrictEqual(erreurs, []);
});

test("iPad (WebKit) : au-delà du contexte, seuls les passages proches de la question partent", async (t) => {
    const serveur = await servir();
    const origine = 'http://127.0.0.1:' + serveur.address().port;
    const navigateur = await webkit.launch();
    t.after(async () => {
        await navigateur.close();
        serveur.close();
    });
    const contexte = await navigateur.newContext({ ...devices['iPad (gen 7)'], serviceWorkers: 'block' });
    /* Albert simulé : un vecteur [1, 0] pour ce qui parle de volcan, [0, 1] sinon. */
    const consignes = [];
    await contexte.route((url) => url.origin !== origine, (route) => {
        const url = route.request().url();
        const corps = route.request().postDataJSON();
        if (url.endsWith('/embeddings')) {
            const data = corps.input.map((texte, index) => ({ index, embedding: /volcan/i.test(texte) ? [1, 0] : [0, 1] }));
            return route.fulfill({ json: { data } });
        }
        if (!url.endsWith('/chat/completions')) {
            return route.abort();
        }
        if (!corps.response_format) {
            consignes.push(corps.messages[0].content);
        }
        const contenu = corps.response_format ? JSON.stringify({ resume: 'Géologie.', themes: [], questions: [] }) : 'Réponse [P2].';
        return route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: contenu }, finish_reason: 'stop' }] } });
    });
    await contexte.addInitScript(SAFARI_ANCIEN);
    await contexte.addInitScript(() => {
        localStorage.setItem('albert-go.cle', 'sk-test');
        sessionStorage.setItem('albert-go.cle', 'sk-test');
        localStorage.setItem('albert-go.citations', 'oui');
    });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (err) => erreurs.push(String(err)));

    await ouvrir(page, origine + '/');
    /* Plafond réduit à un passage : la source ne tient plus dans le contexte. */
    await page.evaluate(() => { Albert.plafondDocuments = () => 120; });
    await page.click('#ouvrir-bibliotheque');
    await page.click('#coller-texte');
    const paragraphe = (sujet) => 'Ce paragraphe parle ' + sujet + ' avec assez de mots pour faire un passage à lui seul.';
    await page.fill('#texte-colle', [paragraphe('des glaciers'), paragraphe('du volcan'), paragraphe('des rivières')].join('\n\n'));
    await page.click('#dialogue-coller button[value=oui]');
    await page.waitForFunction(() => !guidesEnCours.size);
    await page.evaluate(() => $('bibliotheque').close());
    await page.fill('#saisie', 'Et le volcan ?');
    await page.press('#saisie', 'Enter');
    await page.waitForFunction(() => !annulation && $('fil').querySelector('.citation'));

    assert.match(consignes[0], /\[P2\]\nCe paragraphe parle du volcan/);
    assert.doesNotMatch(consignes[0], /\[P1\]|\[P3\]/);

    /* Relais sans route des vecteurs (n8n pas réimporté) : message clair, pas de panne du relais. */
    await page.evaluate(() => { Albert.vecteurs = () => Promise.reject(new TypeError('Load failed')); });
    await page.fill('#saisie', 'Et les glaciers ?');
    await page.press('#saisie', 'Enter');
    await page.waitForFunction(() => !annulation);
    const attendu = await page.evaluate(() => t('erreur.recherche-sources', { message: 'Load failed' }));
    assert.strictEqual(await page.textContent('#etat'), attendu);
    assert.strictEqual(consignes.length, 1);
    await page.click('#fil .citation');
    assert.match(await page.textContent('#fil .passage'), /parle du volcan/);
    assert.deepStrictEqual(erreurs, []);
});

test("Grand écran (WebKit) : le menu s'ouvre au lancement et reste ouvert après un clic au centre", async (t) => {
    const serveur = await servir();
    const origine = 'http://127.0.0.1:' + serveur.address().port;
    const navigateur = await webkit.launch();
    t.after(async () => {
        await navigateur.close();
        serveur.close();
    });
    const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await contexte.route((url) => url.origin !== origine, (route) => route.abort());
    await contexte.addInitScript(() => {
        localStorage.setItem('albert-go.cle', 'sk-test');
        sessionStorage.setItem('albert-go.cle', 'sk-test');
    });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (err) => erreurs.push(String(err)));

    await ouvrir(page, origine + '/');
    assert.ok(await page.evaluate(() => $('menu').open), 'menu fermé au lancement');
    await page.click('#principal', { position: { x: 400, y: 300 } });
    assert.ok(await page.evaluate(() => $('menu').open), 'menu replié par un clic au centre');
    /* Seul son bouton le replie : ni une nouvelle discussion, ni un module, ni Imprimerie, ni Réglages. */
    for (const choix of ['#nouvelle', '#nouveau-projet', '[data-outil="discuter"]', '#ouvrir-reglages']) {
        /* Clic par script : le groupe des modules reste masqué tant qu'il n'y en a qu'un. */
        assert.ok(await page.evaluate((choix) => {
            const bouton = document.querySelector(choix);
            if (bouton) {
                bouton.click();
            }
            return !!bouton;
        }, choix), 'bouton absent : ' + choix);
        assert.ok(await page.evaluate(() => $('menu').open), 'menu replié par ' + choix);
        await page.evaluate(() => $('reglages').open && $('reglages').close());
    }
    /* Ouvert comme replié, son bouton montre l'icône du volet. */
    assert.ok(await page.isVisible('#ouvrir-menu .icone-volet'), 'pas d\'icône du volet sur le menu ouvert');
    await page.click('#ouvrir-menu');
    assert.ok(!await page.evaluate(() => $('menu').open), 'menu non replié par son bouton');
    assert.ok(await page.isVisible('#ouvrir-menu .icone-volet'), 'pas d\'icône du volet sur le menu replié');
    await page.click('#ouvrir-menu');

    /* Bibliothèque en colonne (80rem) : sa flèche vers la droite la replie et s'en souvient. */
    await page.click('#ouvrir-bibliotheque');
    assert.ok(await page.evaluate(() => $('bibliotheque').open && !$('bibliotheque').matches(':modal')), 'bibliothèque pas en colonne');
    await page.click('.fermer-bibliotheque');
    assert.ok(!await page.evaluate(() => $('bibliotheque').open), 'bibliothèque non repliée par sa flèche');
    assert.strictEqual(await page.evaluate(() => lire('bibliotheque-volet', null)), null);
    await recharger(page);
    assert.ok(await page.evaluate(() => $('menu').open), 'menu fermé au rechargement');
    assert.deepStrictEqual(erreurs, []);
});

test("iPad (WebKit) : 'Effacer la clé et quitter' est dans Réglages, Application", async (t) => {
    const serveur = await servir();
    const origine = 'http://127.0.0.1:' + serveur.address().port;
    const navigateur = await webkit.launch();
    t.after(async () => {
        await navigateur.close();
        serveur.close();
    });
    const contexte = await navigateur.newContext({ ...devices['iPad (gen 7)'], serviceWorkers: 'block' });
    await contexte.route((url) => url.origin !== origine, (route) => route.abort());
    await contexte.addInitScript(() => {
        /* Clé conservée, le réglage par défaut : elle est dans localStorage. */
        if (!sessionStorage.getItem('deja')) {
            sessionStorage.setItem('deja', '1');
            localStorage.setItem('albert-go.cle', 'sk-test');
        }
    });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (err) => erreurs.push(String(err)));

    await ouvrir(page, origine + '/');
    assert.strictEqual(await page.locator('#menu #changer-cle').count(), 0, 'bouton encore dans le menu');
    await page.evaluate(() => $('ouvrir-reglages').click());
    await page.click('#reglages details:has(#changer-cle) > summary');
    await page.click('#changer-cle');
    await page.click('#confirmer-cle button[value=oui]');
    assert.ok(!await page.evaluate(() => $('reglages').open), 'réglages restés ouverts');
    assert.strictEqual(await page.evaluate(() => Albert.cle), null);
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('albert-go.cle')), null);
    assert.deepStrictEqual(erreurs, []);
});

test("iPad (WebKit) : 'Autoriser la synthèse vocale en ligne' est dans Outils, sous les moteurs", async (t) => {
    const serveur = await servir();
    const origine = 'http://127.0.0.1:' + serveur.address().port;
    const navigateur = await webkit.launch();
    t.after(async () => {
        await navigateur.close();
        serveur.close();
    });
    const contexte = await navigateur.newContext({ ...devices['iPad (gen 7)'], serviceWorkers: 'block' });
    await contexte.route((url) => url.origin !== origine, (route) => route.abort());
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (err) => erreurs.push(String(err)));

    await ouvrir(page, origine + '/');
    assert.ok(await page.evaluate(() => $('choix-moteur').compareDocumentPosition($('voix-en-ligne')) & Node.DOCUMENT_POSITION_FOLLOWING),
        'voix pas sous les moteurs');
    await page.evaluate(() => $('ouvrir-reglages').click());
    await page.click('#reglages details:has(#voix-en-ligne) > summary');
    await page.click('label:has(#voix-en-ligne)');
    assert.strictEqual(await page.evaluate(() => lire('voix-en-ligne', 'non')), 'oui');
    /* Réglages conseillés de la carte Outils : voix de l'appareil seules. */
    await page.click('#outils-conseilles');
    assert.ok(!await page.evaluate(() => $('voix-en-ligne').checked), 'interrupteur resté coché');
    assert.strictEqual(await page.evaluate(() => lire('voix-en-ligne', 'non')), 'non');
    assert.deepStrictEqual(erreurs, []);
});
