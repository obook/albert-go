# Dictionnaires du correcteur orthographique

Les quatre langues de l'interface, au format de Chromium : `fr-FR-3-0.bdic`,
`en-US-10-1.bdic`, `es-ES-3-0.bdic` et `de-DE-3-0.bdic`. Electron les
télécharge d'ordinaire chez Google ; `main.js` les copie au premier lancement
dans le dossier `Dictionaries` du profil : le correcteur marche hors ligne et
sans appel à un serveur tiers.

Source : dictionnaires Hunspell de Chromium (`hunspell_dictionaries.zip` de
la release 44.8.0 d'Electron), avec leurs licences dans l'archive (`LICENSE`
et `COPYING*`). Français : Dicollecte, licence MPL 2.0. Anglais : SCOWL.
Allemand : de_DE_neu d'OpenOffice.org.
