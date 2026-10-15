/*
 * calcul.test.js
 * Tests de public/js/tools/calcul.js.
 *
 * Lancement : node --test
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
/* math.js, chargé à la demande dans la page, est déjà là pour les tests. */
globalThis.math = require('../public/vendor/mathjs/math.js');
require('../public/js/i18n.js');
const { Calcul, Calendrier, Compteur, Controle, Tirage, Statistiques, Facteurs, OUTILS_LOCAUX } = require('../public/js/tools/calcul.js');

test('evaluer : priorités, parenthèses, puissance, point décimal', () => {
    assert.strictEqual(Calcul.evaluer('2 + 3 * 4'), 14);
    assert.strictEqual(Calcul.evaluer('(12.5 + 3) * 2^3'), 124);
    assert.strictEqual(Calcul.evaluer('2^3^2'), 512);
    assert.strictEqual(Calcul.evaluer('-2^2'), -4);
    assert.strictEqual(Calcul.evaluer('0.1 + 0.2'), 0.3);
    assert.strictEqual(Calcul.evaluer('sqrt(16) + pi * 0'), 4);
    /* Dix chiffres significatifs, comme l'affichage de la NumWorks. */
    assert.strictEqual(Calcul.evaluer('2 / 3'), 0.6666666667);
    assert.strictEqual(Calcul.evaluer('1 + pi'), 4.141592654);
});

test('evaluer : fonctions scientifiques, angles en degrés', () => {
    assert.strictEqual(Calcul.evaluer('sin(30)'), 0.5);
    assert.strictEqual(Calcul.evaluer('cos(90) + sin(180)'), 0);
    assert.strictEqual(Calcul.evaluer('tan(45)'), 1);
    assert.strictEqual(Calcul.evaluer('acos(0.5)'), 60);
    assert.strictEqual(Calcul.evaluer('log(1000) + ln(e)'), 4);
    assert.strictEqual(Calcul.evaluer('round(abs(-2.6))'), 3);
});

test('calendrier : jour, décalage, écart, date impossible', () => {
    assert.strictEqual(Calendrier.repondre({ date: '2026-09-24' }, 'fr'), 'jeudi 24 septembre 2026');
    assert.strictEqual(Calendrier.repondre({ date: '2027-07-14' }, 'en'), 'Wednesday, July 14, 2027');
    assert.match(Calendrier.repondre({ date: '2026-09-24', jours: 45 }, 'fr'), /dimanche 8 novembre 2026/);
    /* Traverse le passage à l'heure d'hiver du 25 octobre 2026. */
    assert.match(Calendrier.repondre({ date: '2026-09-24', fin: '2026-12-19' }, 'fr'), /86/);
    assert.throws(() => Calendrier.repondre({ date: '2027-02-29' }, 'fr'));
    assert.throws(() => Calendrier.repondre({ date: 'demain' }, 'fr'));
    /* Sans date : aujourd'hui, avec l'heure de l'appareil. */
    assert.match(Calendrier.repondre({}, 'fr'), /^Nous sommes le .+, il est \d\d:\d\d:\d\d/);
    assert.match(Calendrier.repondre({ jours: 1 }, 'fr'), /\+ 1 jour : /);
    assert.match(Calendrier.repondre({ jours: 2 }, 'fr'), /\+ 2 jours : /);
    assert.match(Calendrier.repondre({ date: '2026-05-04', fin: '2026-05-05' }, 'fr'), /^1 jour sépare /);
    assert.match(Calendrier.repondre({ date: '2026-05-04', fin: '2026-05-06' }, 'fr'), /^2 jours séparent /);
    assert.match(Calendrier.repondre({ date: '2026-05-04', heures: 1 }, 'fr'), /\+ 1 heure : /);
    assert.match(Calendrier.repondre({ date: '2026-05-13', jours: 1, ouvres: true }, 'fr'), /\+ 1 jour ouvré : /);
    assert.match(Calendrier.repondre({ date: '2026-05-04', fin: '2026-05-04', ouvres: true }, 'fr'), /^1 jour ouvré /);
    /* En heures : 24 heures après le 24 septembre à minuit, le 25 à minuit. */
    assert.match(Calendrier.repondre({ date: '2026-09-24', heures: 24 }, 'fr'), /\+ 24 heures : vendredi 25 septembre 2026, 00:00:00/);
    assert.match(Calendrier.repondre({ heures: -2 }, 'fr'), /\+ -2 heures : /);
});

test('calendrier : jours fériés, dont Pâques et l\'Alsace-Moselle', () => {
    assert.deepStrictEqual(Calendrier.paques(2026), new Date(2026, 3, 5));
    assert.deepStrictEqual(Calendrier.paques(2027), new Date(2027, 2, 28));
    assert.strictEqual(Calendrier.feries(2026).length, 11);
    assert.strictEqual(Calendrier.feries(2026, true).length, 13);
    const liste = Calendrier.repondre({ feries: 2026 }, 'fr');
    assert.match(liste, /lundi 6 avril 2026 \(Lundi de Pâques\)/);
    assert.match(liste, /jeudi 14 mai 2026 \(Ascension\)/);
    assert.match(liste, /lundi 25 mai 2026 \(Lundi de Pentecôte\)/);
    assert.doesNotMatch(liste, /Vendredi saint/);
    assert.match(Calendrier.repondre({ feries: 2026, alsace_moselle: true }, 'fr'), /vendredi 3 avril 2026 \(Vendredi saint/);
    assert.throws(() => Calendrier.repondre({ feries: 12 }, 'fr'));
});

test('calendrier : jours ouvrés, sans week-end ni jour férié', () => {
    /* Le vendredi 8 mai est férié : trois jours ouvrés après le jeudi 7 mènent au mercredi 13. */
    assert.match(Calendrier.repondre({ date: '2026-05-07', jours: 3, ouvres: true }, 'fr'), /mercredi 13 mai 2026/);
    assert.match(Calendrier.repondre({ date: '2026-05-13', jours: 1, ouvres: true }, 'fr'), /vendredi 15 mai 2026/);
    assert.match(Calendrier.repondre({ date: '2026-05-11', jours: -1, ouvres: true }, 'fr'), /jeudi 7 mai 2026/);
    /* Mai 2026 : 21 jours de semaine, dont 4 fériés. */
    assert.match(Calendrier.repondre({ date: '2026-05-01', fin: '2026-05-31', ouvres: true }, 'fr'), /^17 jours ouvrés/);
    assert.match(Calendrier.repondre({ date: '2026-05-31', fin: '2026-05-01', ouvres: true }, 'fr'), /^17 jours ouvrés/);
    assert.throws(() => Calendrier.repondre({ date: '2026-05-07', jours: 100000, ouvres: true }, 'fr'));
});

test('controle : SIREN, SIRET et IBAN, La Poste à part', async () => {
    assert.deepStrictEqual(Controle.verifier('130 025 265'), { type: 'SIREN', valide: true });
    assert.deepStrictEqual(Controle.verifier('13002526500013'), { type: 'SIRET', valide: true });
    assert.deepStrictEqual(Controle.verifier('13002526500014'), { type: 'SIRET', valide: false });
    /* Établissement de La Poste : la clé de Luhn est fausse, la somme des chiffres est un multiple de 5. */
    assert.strictEqual(Controle.verifier('35600000033203').valide, true);
    assert.deepStrictEqual(Controle.verifier('FR14 2004 1010 0505 0001 3M02 606'), { type: 'IBAN', valide: true });
    assert.strictEqual(Controle.verifier('FR15 2004 1010 0505 0001 3M02 606').valide, false);
    assert.throws(() => Controle.verifier('12345'));
    /* Outil retiré de OUTILS_LOCAUX le 2026-10-11.
    assert.match(await OUTILS_LOCAUX.controle.executer({ numero: '13002526500014' }, 'fr'), /SIRET 13002526500014/);
    */
});

test('evaluer : refuse le code et les expressions fausses', () => {
    for (const faux of ['alert(1)', '2 +', '(1', '1 / 0', '1 2', '', 'tan(90)', 'sqrt(-1)', 'constructor(1)',
        'import({}, {})', 'evaluate("1")', 'createUnit("x")', 'parse("1")', 'f(x) = x^2', '12,5']) {
        assert.throws(() => Calcul.evaluer(faux), faux);
    }
});

test('compteur : mots, caractères, sans espaces', () => {
    assert.deepStrictEqual(Compteur.compter("  L'école est  finie.\n"), { mots: 3, caracteres: 19, sansEspaces: 16 });
    assert.deepStrictEqual(Compteur.compter(''), { mots: 0, caracteres: 0, sansEspaces: 0 });
    assert.deepStrictEqual(Compteur.compter('Combien de mots dans cette phrase ?'), { mots: 6, caracteres: 35, sansEspaces: 29 });
    assert.strictEqual(Compteur.compter('Oui - 12 fois !').mots, 3);
    assert.strictEqual(OUTILS_LOCAUX.compteur.executer({ texte: 'a' }), '1 mot, 1 caractère (1 sans les espaces).');
    assert.strictEqual(OUTILS_LOCAUX.compteur.executer({ texte: 'ab cd' }), '2 mots, 5 caractères (4 sans les espaces).');
});

test('compteur : lettre, épellation, anagramme, lisibilité', () => {
    assert.strictEqual(Compteur.occurrences('Strawberry', 'r'), 3);
    /* Sans accent, la lettre compte ses formes accentuées ; avec accent, elle seule. */
    assert.strictEqual(Compteur.occurrences('Élève réservé', 'e'), 6);
    assert.strictEqual(Compteur.occurrences('Élève réservé', 'é'), 3);
    assert.throws(() => Compteur.occurrences('abc', 'ab'));
    assert.deepStrictEqual(Compteur.epeler('chat noir'), { lettres: 'c-h-a-t n-o-i-r', envers: 'rion tahc' });
    assert.strictEqual(Compteur.trier('Chien'), Compteur.trier('niche'));
    assert.notStrictEqual(Compteur.trier('chien'), Compteur.trier('chine s'));
    assert.deepStrictEqual(Compteur.lisibilite('Il pleut. Le chat dort sur le canapé ! Anticonstitutionnellement ?'),
        { phrases: 3, moyenne: 3, max: 6, longues: 0, longs: 1 });
    assert.throws(() => Compteur.lisibilite(' ... '));
    const ligne = OUTILS_LOCAUX.compteur.executer({ texte: 'chien', lettre: 'i', epeler: true, anagramme: 'niche', lisibilite: true }, 'fr');
    assert.strictEqual(ligne, '1 mot, 5 caractères (5 sans les espaces). Lettre "i" : 1 dans le texte. Lettres : c-h-i-e-n. À l\'envers : neihc.'
        + ' Anagramme : oui, mêmes lettres (cehin). Phrases : 1. Mots par phrase : 1 en moyenne, 1 au plus.'
        + ' Phrases de plus de 20 mots : 0. Mots de 10 lettres ou plus : 0.');
});

test('calendrier : échéance en mois et report au premier jour ouvré', () => {
    /* Le quantième absent donne le dernier jour du mois. */
    assert.match(Calendrier.repondre({ date: '2027-01-31', mois: 1 }, 'fr'), /: dimanche 28 février 2027\.$/);
    assert.match(Calendrier.repondre({ date: '2028-01-31', mois: 1 }, 'fr'), /: mardi 29 février 2028\.$/);
    assert.match(Calendrier.repondre({ date: '2026-03-15', mois: -3 }, 'fr'), /: lundi 15 décembre 2025\.$/);
    /* 1er mai 2027 : samedi férié. */
    assert.match(Calendrier.repondre({ date: '2027-03-01', mois: 2, report: true }, 'fr'),
        /2 mois : samedi 1 mai 2027\. Ce jour n'est pas ouvré : report au lundi 3 mai 2027\.$/);
    assert.doesNotMatch(Calendrier.repondre({ date: '2027-03-03', mois: 2, report: true }, 'fr'), /report/);
    /* 14 juillet 2026 : mardi férié. */
    assert.match(Calendrier.repondre({ date: '2026-07-10', jours: 4, report: true }, 'fr'), /report au mercredi 15 juillet 2026\.$/);
    assert.throws(() => Calendrier.repondre({ date: '2026-07-10', mois: 5000 }, 'fr'));
});

test('calcul : moyenne pondérée et dérivée', async () => {
    const calcul = OUTILS_LOCAUX.calcul.executer;
    assert.deepStrictEqual(Statistiques.ponderer([12, 8, 15], [2, 1, 3]), { moyenne: 77 / 6, total: 6 });
    assert.strictEqual(await calcul({ valeurs: [12, 8, 15], coefficients: [2, 1, 3] }, 'fr'),
        'Moyenne pondérée 12,83333333 (somme des coefficients 6).');
    assert.throws(() => Statistiques.ponderer([12, 8], [1]));
    assert.throws(() => Statistiques.ponderer([12, 8], [0, 0]));
    assert.throws(() => Statistiques.ponderer([12, 8], [2, -1]));
    assert.strictEqual(await calcul({ derivee: 'x^3 + 2x' }, 'fr'), 'd/dx (x^3 + 2x) = 3 * x ^ 2 + 2');
    /* ln népérien et log décimal, comme dans evaluer. */
    assert.strictEqual(Calcul.deriver('ln(x)'), '1 / x');
    assert.match(Calcul.deriver('log(x)'), /^0\.434294\d+ \/ x$/);
    assert.strictEqual(Calcul.deriver('x^x'), 'x ^ x * (ln(x) + 1)');
    assert.throws(() => Calcul.deriver('2 +'));
    assert.throws(() => Calcul.deriver('import({}, {}) * x'));
    /* La dérivée ne dérègle pas le calcul en degrés. */
    assert.strictEqual(Calcul.evaluer('sin(30)'), 0.5);
});

test('tirage : tout le monde une fois, groupes égaux à un près', () => {
    const noms = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    assert.deepStrictEqual(Tirage.melanger(noms).sort(), noms);
    const groupes = Tirage.repartir(noms, 3);
    assert.deepStrictEqual(groupes.map(g => g.length), [3, 2, 2]);
    assert.deepStrictEqual(groupes.flat().sort(), noms);
});

test('tirage : sans nombre, la liste mélangée nomme le premier tiré', () => {
    const animaux = ['chat', 'chien', 'lapin', 'cheval', 'tortue'];
    const ligne = OUTILS_LOCAUX.tirage.executer({ elements: animaux });
    const ordre = ligne.match(/^Ordre : (.*) \(premier tiré : (\w+)\)$/);
    assert.ok(ordre, ligne);
    assert.deepStrictEqual(ordre[1].split(', ').sort(), [...animaux].sort());
    assert.strictEqual(ordre[2], ordre[1].split(', ')[0]);
    assert.match(OUTILS_LOCAUX.tirage.executer({ elements: animaux, nombre: 1 }), /^Tirés : \w+$/);
});

test('statistiques : médiane, quartiles du lycée, série invalide', () => {
    const s = Statistiques.calculer(['12', '8', '15,5', 10, 9, 14, 11, 13]);
    assert.strictEqual(s.effectif, 8);
    assert.strictEqual(s.moyenne, 11.5625);
    assert.strictEqual(s.mediane, 11.5);
    assert.strictEqual(s.q1, 9);
    assert.strictEqual(s.q3, 13);
    assert.strictEqual(s.interquartile, 4);
    assert.strictEqual(s.etendue, 7.5);
    assert.strictEqual(s.variance, 5.71484375);
    assert.throws(() => Statistiques.calculer([]));
    assert.throws(() => Statistiques.calculer(['douze']));
});

test('calcul avec valeurs : statistiques de la série', async () => {
    const ligne = await OUTILS_LOCAUX.calcul.executer({ valeurs: [12, 8, 15.5, 10, 9, 14, 11, 13] }, 'fr');
    assert.match(ligne, /^Effectif 8, moyenne 11,5625, médiane 11,5, variance 5,71484375, écart-type 2,390573937/);
    await assert.rejects(OUTILS_LOCAUX.calcul.executer({ valeurs: ['douze'] }, 'fr'));
});

test('outils locaux : chaque outil a ses textes dans les quatre langues', () => {
    for (const langue of ['fr', 'es', 'en', 'de']) {
        I18n.langue = langue;
        for (const [nom, local] of Object.entries(OUTILS_LOCAUX)) {
            const def = local.outil().function;
            const cles = ['reglages.' + nom, 'reponse.' + nom, 'reponse.note-' + nom, nom + '.invalide', nom + '.description',
                ...Object.keys(def.parameters.properties).map(p => nom + '.' + p)];
            for (const cle of cles) {
                assert.ok(I18n.existe(cle), langue + ' ' + cle);
            }
        }
    }
    I18n.langue = 'fr';
});

test('evaluer : ce que math.js ajoute', () => {
    assert.strictEqual(Calcul.evaluer('pgcd(84, 126) + ppcm(84, 126)'), 294);
    assert.strictEqual(Calcul.evaluer('fraction(1, 3) + fraction(1, 4)'), '7/12');
    assert.strictEqual(Calcul.evaluer('5! + combinations(5, 2)'), 130);
    assert.strictEqual(Calcul.evaluer('5 cm + 2 mm'), '5.2 cm');
    /* Complexes écrits avec i ; sqrt(-1) reste refusé (voir plus haut). */
    assert.strictEqual(Calcul.evaluer('(1 + 2i) * (3 - i)'), '5 + 5i');
});

test('calcul avec nombres : facteurs premiers, nombre premier, bornes', async () => {
    const calcul = OUTILS_LOCAUX.calcul.executer;
    assert.deepStrictEqual(Facteurs.decomposer(477843), [[3, 1], [149, 1], [1069, 1]]);
    assert.strictEqual(await calcul({ nombres: [477843] }), '477843 = 3 × 149 × 1069');
    assert.strictEqual(await calcul({ nombres: [360] }), '360 = 2^3 × 3^2 × 5');
    assert.match(await calcul({ nombres: [1069] }), /1069/);
    assert.throws(() => Facteurs.decomposer(1));
    assert.throws(() => Facteurs.decomposer(2.5));
    assert.throws(() => Facteurs.decomposer(1e13));
    /* Sans nombres, l'expression reste la règle. */
    assert.strictEqual(await calcul({ expression: '2 + 3', nombres: [] }, 'fr'), '2 + 3 = 5');
});

test('calcul avec plusieurs nombres : PGCD et PPCM', async () => {
    assert.strictEqual(await OUTILS_LOCAUX.calcul.executer({ nombres: [12, 18] }), '12 = 2^2 × 3 ; 18 = 2 × 3^2 ; PGCD 6, PPCM 36.');
    assert.strictEqual(Facteurs.pgcd(1071, 462), 21);
    assert.strictEqual(Facteurs.ppcm([4, 6, 10]), '60');
    /* Au-delà de 2^53 : le PPCM reste exact. */
    assert.strictEqual(Facteurs.ppcm([999999999989, 999999999959]), '999999999948000000000451');
});
