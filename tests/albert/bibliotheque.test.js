/*
 * albert/bibliotheque.test.js
 * Tests de public/js/albert/bibliotheque.js : place des sources dans le contexte,
 * noms, reprise des anciennes sources et fiche de lecture.
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
require('../../public/js/i18n.js');
const Albert = require('../../public/js/albert.js');

test('joindreDocuments : un bloc par document, rien sans document', () => {
    assert.strictEqual(Albert.joindreDocuments([]), '');
    assert.strictEqual(Albert.joindreDocuments([{ nom: 'cours.pdf', texte: 'A' }, { nom: 'sujet.odt', texte: 'B' }]),
        'Contenu du fichier "cours.pdf" :\n\nA\n\nContenu du fichier "sujet.odt" :\n\nB');
});

test('plafondDocuments : 60 % du contexte, à trois caractères par jeton', () => {
    assert.strictEqual(Albert.plafondDocuments(131072), 235929);
    assert.strictEqual(Albert.plafondDocuments(null), 200000);
});

test('partDocuments : pourcentage du contexte, non plafonné', () => {
    assert.strictEqual(Albert.partDocuments([{ nom: 'a', texte: 'x'.repeat(600) }], 1000), 20);
    /* Modèle changé pour un contexte plus petit : la part dépasse 100. */
    assert.strictEqual(Albert.partDocuments([{ nom: 'a', texte: 'x'.repeat(600) }], 100), 200);
    assert.strictEqual(Albert.partDocuments([], 1000), 0);
    assert.strictEqual(Albert.partDocuments([{ nom: 'a', texte: 'x' }], null), null);
});

test('avecDocument : même nom remplacé, plafond dépassé refusé', () => {
    const cours = { nom: 'cours.pdf', texte: 'x'.repeat(100) };
    assert.deepStrictEqual(Albert.avecDocument([cours], { nom: 'sujet.odt', texte: 'y' }, 1000),
        [cours, { nom: 'sujet.odt', texte: 'y' }]);
    assert.deepStrictEqual(Albert.avecDocument([cours], { nom: 'cours.pdf', texte: 'z' }, 1000),
        [{ nom: 'cours.pdf', texte: 'z' }]);
    /* Contexte de 1000 jetons : 1800 caractères au plus. */
    assert.strictEqual(Albert.avecDocument([cours], { nom: 'gros.pdf', texte: 'x'.repeat(1701) }, 1000), null);
    assert.ok(Albert.avecDocument([cours], { nom: 'gros.pdf', texte: 'x'.repeat(1700) }, 1000));
});

test('sourcesCochees : les fichiers de la bibliothèque cochés pour ce document, dans son ordre', () => {
    const fichiers = [{ nom: 'a.pdf', texte: 'A' }, { nom: 'b.pdf', texte: 'B' }, { nom: 'c.pdf', texte: 'C' }];
    assert.deepStrictEqual(Albert.sourcesCochees(fichiers, ['c.pdf', 'a.pdf', 'absent.pdf']).map(d => d.nom), ['a.pdf', 'c.pdf']);
    assert.deepStrictEqual(Albert.sourcesCochees(fichiers, []), []);
});

test('versBibliotheque : les sources gardées avec chaque document passent dans la bibliothèque', () => {
    const anciennes = [
        { id: 'p1', outil: 'projet', messages: [], documents: [{ nom: 'cours.pdf', texte: 'A' }, { nom: 'carte.png', texte: 'B' }] },
        { id: 'p2', outil: 'projet', messages: [], documents: [{ nom: 'cours.pdf', texte: 'A' }, { nom: 'carte.png', texte: 'autre' }] },
        { id: 'd1', outil: 'discuter', messages: [] }
    ];
    const reprise = Albert.versBibliotheque(anciennes, [{ nom: 'deja.txt', texte: 'D' }]);
    assert.strictEqual(reprise.change, true);
    /* Même nom et même texte : un seul fichier. Même nom, autre texte : renommé. */
    assert.deepStrictEqual(reprise.bibliotheque.map(d => d.nom), ['deja.txt', 'cours.pdf', 'carte.png', 'carte (2).png']);
    assert.deepStrictEqual(reprise.conversations[0].sources, ['cours.pdf', 'carte.png']);
    assert.deepStrictEqual(reprise.conversations[1].sources, ['cours.pdf', 'carte (2).png']);
    assert.ok(reprise.conversations.every(c => !('documents' in c)));
    assert.ok(!('sources' in reprise.conversations[2]));
    /* Déjà reprises : rien ne change. Les entrées d'origine ne sont pas modifiées. */
    assert.strictEqual(Albert.versBibliotheque(reprise.conversations, reprise.bibliotheque).change, false);
    assert.ok('documents' in anciennes[0]);
});

test('sansSource : un fichier supprimé de la bibliothèque quitte tous les documents', () => {
    const liste = [{ id: 'p1', sources: ['a.pdf', 'b.pdf'] }, { id: 'p2', sources: ['b.pdf'] }, { id: 'd1' }];
    assert.deepStrictEqual(Albert.sansSource(liste, 'b.pdf').map(c => c.sources), [['a.pdf'], [], undefined]);
    assert.deepStrictEqual(liste[0].sources, ['a.pdf', 'b.pdf']);
});

test('nomTexte : le texte d\'un fichier se télécharge en .txt, sauf s\'il est déjà du texte', () => {
    assert.strictEqual(Albert.nomTexte('cours.pdf'), 'cours.pdf.txt');
    assert.strictEqual(Albert.nomTexte('photo.PNG'), 'photo.PNG.txt');
    assert.strictEqual(Albert.nomTexte('notes.txt'), 'notes.txt');
    assert.strictEqual(Albert.nomTexte('liste.CSV'), 'liste.CSV');
    assert.strictEqual(Albert.nomTexte('sujet.tex'), 'sujet.tex');
    assert.strictEqual(Albert.nomTexte('sans extension'), 'sans extension.txt');
    /* Une page ou un script déposé revient en texte, pas sous une extension qui s'exécute. */
    assert.strictEqual(Albert.nomTexte('page.html'), 'page.html.txt');
    assert.strictEqual(Albert.nomTexte('script.js'), 'script.js.txt');
});

test('lireGuide : résumé, thèmes et questions, sans gras, même entourés d\'un bloc de code', () => {
    /* Réponse de Small le 10/11/2026 : résumé en liste de phrases, gras partout. */
    const reponse = '```json\n{"resume": ["La **Révolution** commence en 1789.", "La Bastille tombe."],'
        + ' "themes": ["**Ancien Régime**", "", 3], "questions": ["Pourquoi **1789** ?"]}\n```';
    assert.deepStrictEqual(Albert.lireGuide(reponse), {
        resume: 'La Révolution commence en 1789. La Bastille tombe.',
        themes: ['Ancien Régime'],
        questions: ['Pourquoi 1789 ?']
    });
    assert.deepStrictEqual(Albert.lireGuide('{"resume": "Court."}'), { resume: 'Court.', themes: [], questions: [] });
    assert.strictEqual(Albert.lireGuide('Désolé, je ne peux pas.'), null);
    assert.strictEqual(Albert.lireGuide('{"themes": ["sans résumé"]}'), null);
    assert.strictEqual(Albert.lireGuide('{"resume": '), null);
});

test('nomNote : "Note", puis le début de la question sur une ligne, coupé à 40 caractères', () => {
    assert.strictEqual(Albert.nomNote('Pourquoi\n  le ciel est bleu ?'), 'Note - Pourquoi le ciel est bleu ?.md');
    assert.strictEqual(Albert.nomNote('En une phrase, qu\'est-ce qu\'un volcan effusif ?'), 'Note - En une phrase, qu\'est-ce qu\'un volcan.md');
    assert.strictEqual(Albert.nomNote('a'.repeat(50)), 'Note - ' + 'a'.repeat(40) + '.md');
    /* Imprimerie : pas de question affichée. */
    assert.strictEqual(Albert.nomNote(''), 'Note.md');
});

test('demandeGuide : la source seule, après la consigne, réponse en JSON', () => {
    const demande = Albert.demandeGuide('openweight-small', 'Texte de la source');
    assert.deepStrictEqual(demande.response_format, { type: 'json_object' });
    assert.strictEqual(demande.messages.at(-1).content, 'Texte de la source');
    assert.match(demande.messages[0].content, /JSON/);
});

test('sansGras : dans Imprimerie, un document ne garde aucun gras, sauf dans le code', () => {
    const document = [
        '**ÉVALUATION : Pythagore**',
        '### **Exercice 1 : calculs (6 points)**',
        '**Durée** : 1 h, **Points** : 8',
        '| **Total** |  | **20** |',
        '**1.** Calculer __BC__.',
        'Le code `a**b` et `__init__` reste tel quel, **pas ceci**.',
        '```python',
        '# **commentaire** de code',
        'x = 2**3',
        '```',
        'Un astérisque seul * et une *italique* restent.'
    ].join('\n');
    assert.strictEqual(Albert.sansGras(document), [
        'ÉVALUATION : Pythagore',
        '### Exercice 1 : calculs (6 points)',
        'Durée : 1 h, Points : 8',
        '| Total |  | 20 |',
        '1. Calculer BC.',
        'Le code `a**b` et `__init__` reste tel quel, pas ceci.',
        '```python',
        '# **commentaire** de code',
        'x = 2**3',
        '```',
        'Un astérisque seul * et une *italique* restent.'
    ].join('\n'));
    assert.strictEqual(Albert.sansGras('Sans gras'), 'Sans gras');
});
