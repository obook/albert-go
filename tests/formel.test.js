/*
 * formel.test.js
 * Tests du calcul formel : Formel (public/js/tools/calcul/calcul.js) et son worker
 * (public/js/tools/calcul/formel-worker.js), avec le vrai Giac.
 *
 * Lancement : node --test
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
const path = require('node:path');
const vm = require('node:vm');
/* math.js, chargé à la demande dans la page, est déjà là pour les tests. */
globalThis.math = require('../public/vendor/mathjs/math.js');
require('../public/js/socle/i18n.js');
const { Formel, OUTILS_LOCAUX } = require('../public/js/tools/calcul/calcul.js');

const OUTILS = path.join(__dirname, '../public/js/tools/calcul');
const lire = adresse => fs.readFileSync(path.resolve(OUTILS, adresse.split('?')[0]), 'utf8');

/*
 * Faux Worker : seul le transport est simulé. Le fichier du worker tourne dans
 * ce processus, avec le vrai Giac, et ses messages vont au dernier worker créé.
 * mode "sourd" : prêt, mais ne répond jamais ; "casse" : ne se charge pas.
 */
class FauxWorker {
    static mode = 'giac';
    static crees = 0;
    static courant = null;
    static charge = false;

    constructor(adresse) {
        FauxWorker.crees += 1;
        FauxWorker.courant = this;
        if (FauxWorker.mode === 'casse') {
            setTimeout(() => this.onerror(new Error('introuvable')));
        } else if (FauxWorker.mode === 'sourd' || FauxWorker.charge) {
            setTimeout(() => this.onmessage({ data: { pret: true } }));
        } else {
            FauxWorker.charge = true;
            globalThis.self = globalThis;
            /* Sous Node, Giac prépare son accès aux fichiers par require. */
            globalThis.require = require;
            /* Présent dans un vrai worker : celui-ci doit le retirer. */
            globalThis.XMLHttpRequest = class {};
            globalThis.location = { href: 'http://localhost/' + adresse };
            globalThis.postMessage = message => FauxWorker.courant?.onmessage({ data: message });
            globalThis.importScripts = fichier => vm.runInThisContext(lire(fichier), { filename: fichier });
            vm.runInThisContext(lire(path.basename(adresse)), { filename: adresse });
        }
    }

    postMessage(commande) {
        if (FauxWorker.mode !== 'sourd') {
            setTimeout(() => globalThis.onmessage({ data: commande }));
        }
    }

    terminate() {
        if (FauxWorker.courant === this) {
            FauxWorker.courant = null;
        }
    }
}
globalThis.Worker = FauxWorker;

test('valeurs exactes : fraction, racine, valeur remarquable', async () => {
    assert.match(await Formel.calculer('1/3 + 1/6'), /^1\/2/);
    assert.match(await Formel.calculer('simplify(sqrt(12) + sqrt(27))'), /^5\*sqrt\(3\)/);
    assert.match(await Formel.calculer('sin(pi/3)'), /^sqrt\(3\)\/2/);
});

test('équations, inéquations et systèmes', async () => {
    assert.strictEqual(await Formel.calculer('solve(x^2 - 2 = 0, x)'), 'list[-sqrt(2),sqrt(2)]');
    assert.strictEqual(await Formel.calculer('solve(x^2 - 4 > 0, x)'), 'list[x<-2,x>2]');
    assert.strictEqual(await Formel.calculer('solve([2x + y = 5, x - y = 1], [x, y])'), 'list[[2,1]]');
});

test('calcul formel : factoriser, développer, primitive, intégrale, limite, somme', async () => {
    assert.strictEqual(await Formel.calculer('factor(x^3 - 1)'), '(x-1)*(x^2+x+1)');
    assert.strictEqual(await Formel.calculer('expand((x + 1)^3)'), 'x^3+3*x^2+3*x+1');
    assert.strictEqual(await Formel.calculer('diff(x^3, x)'), '3*x^2');
    assert.strictEqual(await Formel.calculer('integrate(x*exp(x), x)'), 'x*exp(x)-exp(x)');
    assert.match(await Formel.calculer('integrate(x^2, x, 0, 1)'), /^1\/3/);
    assert.match(await Formel.calculer('limit((1 + 1/n)^n, n, inf)'), /^exp\(1\)/);
    assert.strictEqual(await Formel.calculer('sum(2^k, k, 0, n)'), '2^(n+1)-1');
});

test('probabilités, suites et tableau de variations', async () => {
    assert.strictEqual(await Formel.calculer('binomial(10, 3, 0.3)'), '0.266827932');
    assert.strictEqual(await Formel.calculer('binomial_cdf(10, 0.3, 3)'), '0.6496107184');
    assert.match(await Formel.calculer('normald_cdf(0, 1, 1.96)'), /^0\.97500210/);
    assert.strictEqual(await Formel.calculer('rsolve(u(n+1) = 2*u(n) + 1, u(n), u(0) = 1)'), '[2*2^n-1]');
    assert.match(await Formel.calculer('tabvar(x^3 - 3x)'), /↘.*↗/);
});

/**
 * Tableau de variations en LaTeX, comme le fait l'outil calcul.
 *
 * @param {string} commande - Par exemple "tabvar(x^3 - 3x)".
 * @returns {Promise<string>} Tableau au format array de LaTeX.
 */
async function varier(commande) {
    return Formel.tableau(await Formel.sortieTableau(commande));
}

test('tableau de variations : rendu en LaTeX, sur tout le domaine, valeurs en haut ou en bas', async () => {
    const attendu = '\\def\\arraystretch{1.4}\\begin{array}{c|ccccccc} x & -\\infty & & -1 & & 1 & & +\\infty \\\\ \\hline '
        + 'f\'(x) & & + & 0 & - & 0 & + & \\\\ \\hline '
        + '& & & 2 & & & & +\\infty \\\\ f(x) & & \\nearrow & & \\searrow & & \\nearrow & \\\\ '
        + '& -\\infty & & & & -2 & & \\end{array}';
    assert.strictEqual(await varier('tabvar(x^3 - 3x)'), attendu);
    assert.ok((await OUTILS_LOCAUX.calcul.executer({ formel: 'tabvar(x^3 - 3x)' }, 'fr')).endsWith('$$' + attendu + '$$'));
});

/* Dans le tableau LaTeX, les valeurs sur trois étages font confondre maximum et minimum au modèle. */
test('tableau de variations : lecture en ligne pour le modèle, valeur interdite comprise', async () => {
    const calcul = OUTILS_LOCAUX.calcul.executer;
    assert.ok((await calcul({ formel: 'tabvar(x^3 - 3x)' }, 'fr'))
        .startsWith('x : -\\infty ; -1 ; 1 ; +\\infty\nf\'(x) : + ; 0 ; - ; 0 ; +\nf(x) : -\\infty ↗ 2 ↘ -2 ↗ +\\infty\n'));
    assert.ok((await calcul({ formel: 'tabvar(1/x)' }, 'fr'))
        .startsWith('x : -\\infty ; 0 ; +\\infty\nf\'(x) : - ; || ; -\nf(x) : 0 ↘ -\\infty || +\\infty ↘ 0\n'));
});

test('tableau de variations : double barre à une valeur interdite, limites de part et d\'autre', async () => {
    assert.strictEqual(await varier('tabvar(1/x)'),
        '\\def\\arraystretch{1.4}\\begin{array}{c|ccc||ccc} x & -\\infty & & 0 & & & +\\infty \\\\ \\hline '
        + 'f\'(x) & & - & & & - & \\\\ \\hline '
        + '& 0 & & & +\\infty & & \\\\ f(x) & & \\searrow & & & \\searrow & \\\\ '
        + '& & & -\\infty & & & 0 \\end{array}');
});

test('tableau de variations : valeur sans extremum au milieu, 1/e écrit en fraction, commande refusée', async () => {
    assert.match(await varier('tabvar(x^3)'), /f\(x\) & & \\nearrow & 0 & \\nearrow & \\\\/);
    assert.match(await varier('tabvar(x*exp(-x))'), /& & & \\frac\{1\}\{e\} & & \\\\ f\(x\)/);
    await assert.rejects(varier('tabvar('), { message: t('calcul.invalide') });
});

test('une variable définie par un calcul ne reste pas pour le suivant', async () => {
    assert.strictEqual(await Formel.calculer('a := 5'), '5');
    assert.strictEqual(await Formel.calculer('a + 1'), 'a+1');
});

test('commande refusée par Giac : erreur de calcul', async () => {
    await assert.rejects(Formel.calculer('factor('), { message: t('calcul.invalide') });
});

test('le worker n\'a plus de réseau : read ne lit pas une adresse', async () => {
    assert.strictEqual(typeof XMLHttpRequest, 'undefined');
    assert.strictEqual(typeof fetch, 'undefined');
    await assert.rejects(Formel.calculer('read("http://exemple.invalid/")'), { message: t('calcul.invalide') });
});

test('l\'outil calcul passe formel à Giac', async () => {
    assert.strictEqual(await OUTILS_LOCAUX.calcul.executer({ formel: 'factor(x^2 - 5x + 6)' }, 'fr'), 'factor(x^2 - 5x + 6) : (x-3)*(x-2)');
    const parametres = OUTILS_LOCAUX.calcul.outil().function.parameters.properties;
    assert.match(parametres.formel.description, /Xcas/);
});

test('commande Xcas écrite dans expression : passée à Giac quand math.js la refuse', async () => {
    const calcul = OUTILS_LOCAUX.calcul.executer;
    assert.strictEqual(await calcul({ expression: 'integrate(x*exp(x), x, 0, 1)' }, 'fr'), 'integrate(x*exp(x), x, 0, 1) : 1');
    assert.strictEqual(await calcul({ expression: 'solve(x^2 - 5x + 6 = 0, x)' }, 'fr'), 'solve(x^2 - 5x + 6 = 0, x) : list[2,3]');
    /* Ce que math.js sait calculer lui reste ; une virgule décimale reste une erreur. */
    assert.strictEqual(await calcul({ expression: 'sum(1, 2, 3)' }, 'fr'), 'sum(1, 2, 3) = 6');
    await assert.rejects(calcul({ expression: '3,5 + 2' }, 'fr'), { message: t('calcul.invalide') });
});

test('adresse de Giac : le fichier existe dans public/', () => {
    const adresse = /const GIAC = '([^']+)'/.exec(lire('formel-worker.js'))[1];
    const url = new URL(adresse, 'https://exemple.fr/js/tools/calcul/formel-worker.js');
    assert.ok(fs.existsSync(path.join(__dirname, '../public', url.pathname)));
});

test('calcul trop long : le worker est arrêté, le suivant en relance un', async () => {
    const [delai, avant] = [Formel.DELAI_MS, FauxWorker.crees];
    Formel.DELAI_MS = 30;
    FauxWorker.mode = 'sourd';
    Formel.arreter();
    try {
        await assert.rejects(Formel.calculer('ifactor(2^257 - 1)'), { message: t('calcul.long') });
        assert.strictEqual(FauxWorker.courant, null);
    } finally {
        Formel.DELAI_MS = delai;
        FauxWorker.mode = 'giac';
    }
    assert.match(await Formel.calculer('1/3 + 1/6'), /^1\/2/);
    assert.strictEqual(FauxWorker.crees, avant + 2);
});

/* L'appelant (executerOutil) remplace toute erreur par calcul.invalide : ces deux textes passent comme résultat. */
test('l\'outil calcul dit au modèle qu\'un calcul formel est trop long ou que le moteur manque', async () => {
    const delai = Formel.DELAI_MS;
    Formel.DELAI_MS = 30;
    FauxWorker.mode = 'sourd';
    Formel.arreter();
    try {
        assert.strictEqual(await OUTILS_LOCAUX.calcul.executer({ formel: 'ifactor(2^257 - 1)' }, 'fr'), t('calcul.long'));
        FauxWorker.mode = 'casse';
        assert.strictEqual(await OUTILS_LOCAUX.calcul.executer({ formel: '1 + 1' }, 'fr'), t('calcul.indisponible'));
    } finally {
        Formel.DELAI_MS = delai;
        FauxWorker.mode = 'giac';
    }
    await assert.rejects(OUTILS_LOCAUX.calcul.executer({ formel: 'factor(' }, 'fr'), { message: t('calcul.invalide') });
});

test('moteur qui ne se charge pas : indisponible, puis nouvel essai possible', async () => {
    FauxWorker.mode = 'casse';
    Formel.arreter();
    try {
        await assert.rejects(Formel.calculer('1 + 1'), { message: t('calcul.indisponible') });
    } finally {
        FauxWorker.mode = 'giac';
    }
    assert.strictEqual(await Formel.calculer('1 + 1'), '2');
});
