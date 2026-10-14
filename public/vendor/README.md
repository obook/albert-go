# Bibliothèques embarquées

Servies depuis Pages, sans CDN : aucune adresse IP n'est transmise à un tiers.

| Dossier | Version | Rôle | Licence | Provenance |
|---|---|---|---|---|
| `marked/` | 17.0.1 | Markdown vers HTML (`lib/marked.umd.js`, avec sa carte de sources) | MIT | paquet npm `marked@17.0.1`, https://github.com/markedjs/marked |
| `katex/` | 0.16.47 | Formules LaTeX, avec `contrib/mhchem.min.js` pour la chimie `\ce{...}` | MIT | paquet npm `katex@0.16.47`, https://github.com/KaTeX/KaTeX |
| `mermaid/` | 11.17.2 | Diagrammes, chargé au premier diagramme | MIT | paquet npm `mermaid@11.17.2`, https://github.com/mermaid-js/mermaid |
| `pico/` | 2.1.1 | Champs de formulaire (`css/pico.conditional.min.css` : seulement dans les éléments `.pico`) | MIT | paquet npm `@picocss/pico@2.1.1`, https://github.com/picocss/pico |
| `pdfjs/` | 6.3.289 | Texte des PDF joints, chargé au premier PDF (`legacy/build/pdf.min.mjs` et `legacy/build/pdf.worker.min.mjs`). Version legacy : la version moderne appelle `Promise.try`, absent de Safari avant 18.2, et tout PDF était illisible sur un iPad moins à jour. À chaque mise à jour, changer `PDFJS` dans `piece-jointe.js` | Apache-2.0 | paquet npm `pdfjs-dist@6.3.289`, https://github.com/mozilla/pdf.js |
| `highlight/` | 11.12.0 | Couleurs du code, chargé au premier bloc de code (`highlight.min.js` : les langages courants) | BSD-3-Clause | paquet npm `@highlightjs/cdn-assets@11.12.0`, https://github.com/highlightjs/highlight.js |
| `mathjs/` | 15.2.0 | Calculatrice du modèle (`lib/browser/math.js`, avec `LICENSE` et `NOTICE`), chargé au premier calcul | Apache-2.0 | paquet npm `mathjs@15.2.0`, https://github.com/josdejong/mathjs |
| `giac/` | 1.9.0 | Calcul formel du modèle (`giacwasm.js`, WebAssembly inclus, avec `LICENSE`), chargé au premier calcul formel, dans un worker | GPL-3.0-or-later | archive `giacjs.tar.gz`, https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac_fr.html ; sources : https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac/giac_stable.tgz |
| `luciole/` | 2019 | Police du logo (`Luciole-Regular.woff2`) | CC BY 4.0, Luciole © Laurent Bourcellier & Jonathan Perez | https://www.luciole-vision.com/, archive `Luciole_webfonts.zip` |
| `work-sans/` | 5.3.0 | Police du texte, variable : latin et latin étendu, romain et italique (quatre `.woff2`) | OFL-1.1, texte dans `LICENSE` | paquet npm `@fontsource-variable/work-sans@5.3.0`, https://github.com/weiweihuanghuang/Work-Sans |
| `qrcode-generator/` | 2.0.4 | QR code de la boîte "Partager" (`dist/qrcode.js`) | MIT, en tête du fichier : le paquet npm ne livre pas de fichier de licence | paquet npm `qrcode-generator@2.0.4`, https://github.com/kazuhikoarase/qrcode-generator |

Icônes des titres des Réglages : trois tracés de Lucide 0.460.0 (`cpu`, `wrench`, `smartphone`) copiés dans `index.html`. Licence ISC, https://lucide.dev

Mise à jour : prendre les fichiers dans le paquet npm officiel (`https://registry.npmjs.org/<nom>/-/<nom>-<version>.tgz`), puis vérifier avec `npm audit` sur un `package.json` listant les neuf versions (Luciole et Giac ne sont pas sur npm : reprendre l'archive de leur site ; pour Giac, changer aussi la version dans l'adresse de `js/tools/formel-worker.js`).
