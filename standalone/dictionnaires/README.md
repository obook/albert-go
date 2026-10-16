# Dictionnaire du correcteur orthographique

`fr-FR-3-0.bdic` : dictionnaire français au format de Chromium, celui
qu'Electron 33 télécharge d'ordinaire chez Google. `main.js` le copie
au premier lancement dans le dossier `Dictionaries` du profil : le
correcteur marche hors ligne et sans appel à un serveur tiers.

Les autres langues de l'interface (anglais, espagnol, allemand) se
téléchargent encore à la demande.

Source : dictionnaires Hunspell de Chromium (`hunspell_dictionaries.zip`
des releases d'Electron). Français : Dicollecte, licence MPL 2.0.
