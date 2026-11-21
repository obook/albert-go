/*
 * albert/reponses.test.js
 * Tests de public/js/albert/reponses.js : variantes de Reformuler, langue d'une
 * réponse, trace de la calculatrice, schémas Mermaid.
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

test('decouperVariantes : trois variantes, ou null si le format manque', () => {
    const reponse = '### Plus courte\nCourt.\n\n### Même longueur\nMoyen, plus fluide.\n\n### Plus soutenue\nTexte soutenu.\n\nSecond paragraphe.';
    assert.deepStrictEqual(Albert.decouperVariantes(reponse), [
        { titre: 'Plus courte', texte: 'Court.' },
        { titre: 'Même longueur', texte: 'Moyen, plus fluide.' },
        { titre: 'Plus soutenue', texte: 'Texte soutenu.\n\nSecond paragraphe.' }
    ]);
    assert.strictEqual(Albert.decouperVariantes('Une seule reformulation.'), null);
    assert.strictEqual(Albert.decouperVariantes('### Seule\nUne variante.'), null);
});

test('demandeCorrectionMermaid : code et erreur envoyés, température 0', () => {
    const demande = Albert.demandeCorrectionMermaid('large', 'A + B --> C', 'Parse error on line 1');
    assert.strictEqual(demande.model, 'large');
    assert.strictEqual(demande.temperature, 0);
    assert.strictEqual(demande.messages[0].role, 'system');
    assert.match(demande.messages[1].content, /A \+ B --> C[\s\S]*Parse error on line 1/);
});

test('codeMermaid : bloc ```mermaid retiré s\'il y en a un', () => {
    assert.strictEqual(Albert.codeMermaid('Voici :\n```mermaid\nflowchart LR\n A --> B\n```\nFin.'), 'flowchart LR\n A --> B');
    assert.strictEqual(Albert.codeMermaid('```\ngraph TD\n A --> B\n```'), 'graph TD\n A --> B');
    assert.strictEqual(Albert.codeMermaid('  graph TD\n A --> B\n'), 'graph TD\n A --> B');
});

test('langueDuTexte : traductions faites dans Chat', () => {
    assert.strictEqual(Albert.langueDuTexte('Hola, quisiera pedir cita para la semana que viene.', 'fr'), 'es');
    assert.strictEqual(Albert.langueDuTexte('Hello, I would like to make an appointment next week.', 'fr'), 'en');
    assert.strictEqual(Albert.langueDuTexte('Hallo, ich möchte nächste Woche einen Termin vereinbaren.', 'fr'), 'de');
    assert.strictEqual(Albert.langueDuTexte('Ciao, vorrei prendere un appuntamento per la settimana prossima.', 'fr'), 'it');
    assert.strictEqual(Albert.langueDuTexte('Olá, gostaria de marcar uma consulta para a próxima semana.', 'fr'), 'pt');
    assert.strictEqual(Albert.langueDuTexte('Hallo, ik wil graag een afspraak maken voor volgende week.', 'fr'), 'nl');
    assert.strictEqual(Albert.langueDuTexte('Здравствуйте, я хотел бы записаться на следующую неделю.', 'fr'), 'ru');
    assert.strictEqual(Albert.langueDuTexte('您好，我想预约下周的时间。', 'fr'), 'zh');
    assert.strictEqual(Albert.langueDuTexte('こんにちは、来週の予約をしたいです。', 'fr'), 'ja');
    assert.strictEqual(Albert.langueDuTexte('مرحبا، أود حجز موعد الأسبوع المقبل.', 'fr'), 'ar');
});

test('langueDuTexte : dans le doute, la langue de l\'interface', () => {
    const francais = 'Il suffit de doubler les quantités : 500 g de farine, 8 œufs et 1 litre de lait.';
    assert.strictEqual(Albert.langueDuTexte(francais, 'fr'), 'fr');
    /* Le code en anglais ne compte pas. */
    assert.strictEqual(Albert.langueDuTexte('Voici la boucle :\n```js\nfor (const item of the list) { if (it is not done) return; }\n```\nElle est simple.', 'fr'), 'fr');
    assert.strictEqual(Albert.langueDuTexte('OK', 'fr'), 'fr');
    assert.strictEqual(Albert.langueDuTexte('142,8571429', 'es'), 'es');
});

/* Sous la calculatrice, la ligne rendue au modèle montrait sa consigne et le tableau en LaTeX (14/10/2026). */
test('traceCalcul : un tableau de variations garde sa lecture, sans la consigne au modèle ni le LaTeX', () => {
    const ligne = "x : -\\infty ; -1 ; 1 ; +\\infty\nf'(x) : + ; 0 ; - ; 0 ; +\nf(x) : -\\infty ↗ 2 ↘ -2 ↗ +\\infty\n"
        + "La page affiche déjà ce tableau de variations sous ta réponse : n'écris aucun tableau, ni en LaTeX ni en Markdown, commente seulement les variations.\n"
        + '$$\\def\\arraystretch{1.4}\\begin{array}{c|ccc} x & -\\infty & & +\\infty \\end{array}$$';
    assert.strictEqual(Albert.traceCalcul(ligne), "x : -∞ ; -1 ; 1 ; +∞\nf'(x) : + ; 0 ; - ; 0 ; +\nf(x) : -∞ ↗ 2 ↘ -2 ↗ +∞");
    assert.strictEqual(Albert.traceCalcul('x : -\\frac{\\sqrt{3}}{3} ; \\frac{1}{e}\nConsigne.\n$$t$$'), 'x : -√3/3 ; 1/e');
    assert.strictEqual(Albert.traceCalcul('2+2 = 4'), '2+2 = 4');
});
