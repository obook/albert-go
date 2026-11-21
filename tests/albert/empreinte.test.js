/*
 * albert/empreinte.test.js
 * Tests de public/js/albert/empreinte.js : part du contexte, jetons, énergie et
 * carbone cumulés.
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

/* Sous Node, pas de serveur.js : les tests supposent un serveur, sauf ceux de la version en ligne. */
Albert.EN_LIGNE = false;

test('occupation : pourcentage du contexte, borné, inconnu', () => {
    assert.strictEqual(Albert.occupation({ total_tokens: 12800 }, 128000), 10);
    assert.strictEqual(Albert.occupation({ prompt_tokens: 100000, completion_tokens: 40000 }, 128000), 100);
    assert.strictEqual(Albert.occupation(null, 128000), null);
    assert.strictEqual(Albert.occupation({ total_tokens: 10 }, null), null);
});

test('repondre : cumule l\'empreinte d\'Albert, valeur haute, les jetons, et compte les appels sans empreinte', async () => {
    const avant = globalThis.fetch;
    Albert.empreinte = { kwh: 0, kgco2: 0, appels: 0, renseignes: 0, lus: 0, ecrits: 0, depuis: new Date() };
    const carbon = { kWh: { min: 0.001, max: 0.002 }, kgCO2eq: { min: 0.0001, max: 0.0003 } };
    const usages = [{ prompt_tokens: 100, completion_tokens: 20, carbon }, { prompt_tokens: 100, completion_tokens: 20, impacts: { kWh: 0.002, kgCO2eq: 0.0003 } }, { prompt_tokens: 50, completion_tokens: 5 }];
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: usages.shift() }) });
    try {
        for (let i = 0; i < 3; i++) {
            await Albert.repondre({ model: 'm', messages: [] }, new AbortController().signal);
        }
        const { kwh, kgco2, appels, renseignes, lus, ecrits } = Albert.empreinte;
        assert.deepStrictEqual({ appels, renseignes, lus, ecrits }, { appels: 3, renseignes: 2, lus: 250, ecrits: 45 });
        assert.ok(Math.abs(kwh - 0.004) < 1e-12 && Math.abs(kgco2 - 0.0006) < 1e-12, kwh + ' ' + kgco2);
    } finally {
        globalThis.fetch = avant;
    }
});

test('petiteUnite : l\'unité, son millième sous 1, son millier au-dessus de 999', () => {
    /* Espaces insécables : le nombre et son unité restent sur la même ligne. */
    assert.doesNotMatch(Albert.petiteUnite(0.42, 'g CO2eq', 'fr'), / /);
    const unite = (...args) => Albert.petiteUnite(...args).replace(/\s/g, ' ');
    assert.strictEqual(unite(0.00099, 'Wh', 'fr'), '0,99 mWh');
    assert.strictEqual(unite(0.42, 'g CO2eq', 'fr'), '420 mg CO2eq');
    assert.strictEqual(unite(12.3, 'Wh', 'en'), '12 Wh');
    assert.strictEqual(unite(1234, 'Wh', 'fr'), '1,2 kWh');
    assert.strictEqual(unite(1500, 'g CO2eq', 'fr'), '1,5 kg CO2eq');
    /* Arrondi d'abord : jamais "1 000 Wh" ni "1 000 mWh". */
    assert.strictEqual(unite(999.6, 'Wh', 'fr'), '1 kWh');
    assert.strictEqual(unite(0.9996, 'Wh', 'fr'), '1 Wh');
});

test('recharge : part d\'une recharge de téléphone, en pourcentage sous une recharge', () => {
    const avant = I18n.langue;
    /* Intl sépare nombre et unité par une espace insécable. */
    const recharge = (kwh) => Albert.recharge(kwh).replace(/\s/g, ' ');
    try {
        I18n.langue = 'fr';
        assert.strictEqual(recharge(0.00042), 'Soit 2,8 % d\'une recharge de téléphone');
        assert.strictEqual(recharge(0.000001), 'Soit 0,0067 % d\'une recharge de téléphone');
        assert.strictEqual(recharge(0.021), 'Soit 1,4 recharge de téléphone');
        assert.strictEqual(recharge(0.03), 'Soit 2 recharges de téléphone');
        I18n.langue = 'en';
        assert.strictEqual(recharge(0.021), 'That is 1.4 phone charges');
    } finally {
        I18n.langue = avant;
    }
});

test('jetons : en k au-dessus de 999', () => {
    /* toLocaleString sépare les milliers par une espace insécable en français. */
    const jetons = (n, langue) => Albert.jetons(n, langue).replace(/\s/g, ' ');
    assert.doesNotMatch(Albert.jetons(12440, 'fr'), / /);
    assert.strictEqual(jetons(999, 'fr'), '999');
    assert.strictEqual(jetons(1000, 'fr'), '1 k');
    assert.strictEqual(jetons(12440, 'fr'), '12,4 k');
    assert.strictEqual(jetons(12440, 'en'), '12.4 k');
});
