/*
 * albert/mesure.test.js
 * Tests de public/js/albert/mesure.js : parts de l'envoi par origine, total réel
 * ou estimé, capacité du modèle, durées et appels multiples.
 *
 * i18n.js d'abord : albert.js lit ses textes avec t, variable globale.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
require('../../public/js/socle/i18n.js');
const Albert = require('../../public/js/albert.js');

test('partsEnvoi : total réel d\'Albert, parts au prorata des caractères, de la plus grande à la plus petite', () => {
    const envoi = Albert.partsEnvoi({ sources: 57000, competences: 4500, discussion: 1500, consigne: 900 }, 21300);
    assert.strictEqual(envoi.total, 21300);
    assert.strictEqual(envoi.estime, false);
    assert.deepStrictEqual(envoi.parts.map(p => [p.origine, p.pourcent]),
        [['sources', 89], ['competences', 7], ['discussion', 2], ['consigne', 1]]);
    assert.strictEqual(envoi.parts[0].jetons, 19000);
});

test('partsEnvoi : sans usage, total estimé à 3 caractères par jeton, origine vide absente', () => {
    const envoi = Albert.partsEnvoi({ sources: 0, competences: 0, discussion: 300, consigne: 900 }, null);
    assert.strictEqual(envoi.estime, true);
    assert.strictEqual(envoi.total, 400);
    assert.deepStrictEqual(envoi.parts.map(p => [p.origine, p.jetons, p.pourcent]), [['consigne', 300, 75], ['discussion', 100, 25]]);
});

test('mesurer : un appel, capacité du modèle, durées en pourcentage du total', () => {
    const mesure = Albert.mesurer({
        caracteres: { sources: 9000, consigne: 1000 },
        appels: [{ usage: { prompt_tokens: 3400, completion_tokens: 620 }, duree: 20000 }],
        rechercheMs: 2000,
        totalMs: 22050,
        contexte: 128000
    });
    assert.strictEqual(mesure.envoi.total, 3400);
    assert.strictEqual(mesure.recus, 620);
    assert.strictEqual(mesure.capacite, 3);
    assert.strictEqual(mesure.appels, 1);
    /* Un seul appel : les 50 ms de mise en forme ne font pas une ligne "outils". */
    assert.deepStrictEqual(mesure.durees, [{ nom: 'recherche', ms: 2000, pourcent: 9 }, { nom: 'albert', ms: 20000, pourcent: 91 }]);
});

test('mesurer : appels avec outils, envoi du dernier, reçus et durées additionnés', () => {
    const mesure = Albert.mesurer({
        caracteres: { discussion: 600, consigne: 2400 },
        appels: [
            { usage: { prompt_tokens: 900, completion_tokens: 40 }, duree: 3000 },
            { usage: { prompt_tokens: 1100, completion_tokens: 500 }, duree: 9000 }
        ],
        rechercheMs: 0,
        totalMs: 14000,
        contexte: null
    });
    assert.strictEqual(mesure.envoi.total, 1100);
    assert.strictEqual(mesure.recus, 540);
    assert.strictEqual(mesure.capacite, null);
    assert.strictEqual(mesure.appels, 2);
    assert.deepStrictEqual(mesure.durees, [{ nom: 'albert', ms: 12000, pourcent: 86 }, { nom: 'outils', ms: 2000, pourcent: 14 }]);
});

test('mesurer : sans usage, reçus inconnus et envoi estimé', () => {
    const mesure = Albert.mesurer({ caracteres: { consigne: 3000 }, appels: [{ usage: null, duree: 5000 }], rechercheMs: 0, totalMs: 5000, contexte: 1000 });
    assert.strictEqual(mesure.recus, null);
    assert.strictEqual(mesure.envoi.estime, true);
    assert.strictEqual(mesure.envoi.total, 1000);
    assert.strictEqual(mesure.capacite, 100);
});
