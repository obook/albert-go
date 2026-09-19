# Bibliothèques embarquées

Servies depuis Pages, sans CDN : aucune adresse IP n'est transmise à un tiers.

| Dossier | Version | Rôle | Licence | Provenance |
|---|---|---|---|---|
| `marked/` | 17.0.1 | Markdown vers HTML | MIT | albert-board, https://github.com/markedjs/marked |
| `katex/` | 0.16.47 | Formules LaTeX, avec `contrib/mhchem.min.js` pour la chimie `\ce{...}` | MIT | paquet npm `katex@0.16.47`, https://github.com/KaTeX/KaTeX |
| `mermaid/` | 11.17.2 | Diagrammes, chargé au premier diagramme | MIT | paquet npm `mermaid@11.17.2`, https://github.com/mermaid-js/mermaid |
| `qrcode-generator/` | 2.0.4 | QR code de la boîte "Partager" (`dist/qrcode.js`) | MIT | paquet npm `qrcode-generator@2.0.4`, https://github.com/kazuhikoarase/qrcode-generator |

Mise à jour : prendre les fichiers dans le paquet npm officiel (`https://registry.npmjs.org/<nom>/-/<nom>-<version>.tgz`), puis vérifier avec `npm audit` sur un `package.json` listant les quatre versions.
