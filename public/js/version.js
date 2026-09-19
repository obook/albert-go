/*
 * version.js
 * Version affichée dans "À propos".
 *
 * Au déploiement, la CI (.gitlab-ci.yml) remplace ce fichier par le commit
 * publié et sa date. Sert à vérifier qu'un appareil n'a pas gardé une
 * ancienne version en cache.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

/** Commit publié et sa date (ISO 8601) ; "locale" hors déploiement. */
const VERSION = { commit: 'locale', date: '' };
