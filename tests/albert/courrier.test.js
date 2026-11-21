/*
 * albert/courrier.test.js
 * Tests de public/js/albert/courrier.js : module Courrier (Rédiger).
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

test('doitEnvoyer : longueur minimale et texte changé', () => {
    const dix = 'a'.repeat(10);
    assert.strictEqual(Albert.doitEnvoyer('a'.repeat(9), ''), false);
    assert.strictEqual(Albert.doitEnvoyer('   ' + 'a'.repeat(9) + '\n', ''), false);
    assert.strictEqual(Albert.doitEnvoyer(dix, ''), true);
    assert.strictEqual(Albert.doitEnvoyer('absent 3 jours', ''), true);
    assert.strictEqual(Albert.doitEnvoyer(dix, dix), false);
    assert.strictEqual(Albert.doitEnvoyer(dix + '\n ', dix), false);
    assert.strictEqual(Albert.doitEnvoyer(dix + 'b', dix), true);
});

test('sansMarkdown : gras, italique et titres retirés, lignes gardées', () => {
    assert.strictEqual(Albert.sansMarkdown('**Madame,**\n\nJe vous __écris__.'), 'Madame,\n\nJe vous écris.');
    assert.strictEqual(Albert.sansMarkdown('## Objet : absence\nTexte'), 'Objet : absence\nTexte');
    assert.strictEqual(Albert.sansMarkdown('Un *mot* important'), 'Un mot important');
    assert.strictEqual(Albert.sansMarkdown('3 * 4 = 12\n- liste gardée'), '3 * 4 = 12\n- liste gardée');
});

test('separerRevue : courrier puis anomalies après %%%', () => {
    assert.deepStrictEqual(Albert.separerRevue('**Madame,**\n\nTexte.\n%%%\n- Lundi 30 septembre est un mercredi.\n\n* Heure absente.'),
        { texte: 'Madame,\n\nTexte.', anomalies: ['Lundi 30 septembre est un mercredi.', 'Heure absente.'] });
    assert.deepStrictEqual(Albert.separerRevue('Madame,\n\nTexte.\n'), { texte: 'Madame,\n\nTexte.', anomalies: [] });
    assert.deepStrictEqual(Albert.separerRevue('Madame,\n\nTexte.\n\n%%%%%\n- Heure absente.'),
        { texte: 'Madame,\n\nTexte.', anomalies: ['Heure absente.'] });
    assert.deepStrictEqual(Albert.separerRevue('Madame,\n\nTexte.\n%%% - Heure absente.\n%%%'),
        { texte: 'Madame,\n\nTexte.', anomalies: ['Heure absente.'] });
});

test('calendrier : un jour par ligne, dans la langue demandée', () => {
    const jours = Albert.calendrier(new Date(2026, 8, 22), 9, 'fr');
    assert.strictEqual(jours.length, 9);
    assert.strictEqual(jours[0], 'mardi 22 septembre 2026');
    assert.strictEqual(jours[8], 'mercredi 30 septembre 2026');
});
