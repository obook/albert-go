# Albert Go

Chatbot minimal pour [Albert](https://ia.numerique.gouv.fr/outils-ia/albert-api/), l'IA de l'État portée par la DINUM.

Essayer Albert Go en ligne : https://booklageolivier.forge.apps.education.fr/albert-go/

Chaque utilisateur utilise sa propre clé API. Les clés s'obtiennent sur le [playground Albert](https://albert.playground.etalab.gouv.fr/).

## Fonctionnalités

### Modules

| Module | Rôle |
|---|---|
| Discussion | Discuter avec Albert, qui corrige et traduit aussi sur demande ("Corrige ce texte : ...", "Traduis en anglais : ..."). |
| Style | Reformuler un texte, avec trois propositions. |
| Courrier | Rédiger un courrier à partir de quelques idées (voir plus bas). |
| Imprimerie | Construire un document peu à peu à partir de sources déposées (voir plus bas). |

Les modules Correction et Trad sont mis de côté : ils ne sont plus au menu, leurs anciennes conversations restent dans l'historique.

### Réponses

Les réponses acceptent le Markdown, les formules LaTeX et les diagrammes Mermaid, graphiques en barres ou en ligne compris ; un diagramme refusé par Mermaid est renvoyé une fois au modèle pour correction. La courbe d'une fonction est calculée et tracée par la page ; une figure écrite en SVG par le modèle s'affiche après nettoyage. En français, les consignes demandent les notations de France : virgule décimale, intervalles à crochets, calculs en colonne. Sous chaque réponse : copier le texte, le lire à voix haute avec une voix installée sur l'appareil ou l'enregistrer en .docx ou en .odt.

Les deux fichiers sont écrits dans le navigateur, sans bibliothèque : titres, listes, tableaux, code, liens, figures et images en image. Les formules restent modifiables : équations Word dans le .docx, objets LibreOffice Math dans le .odt. Une formule que KaTeX n'a pas su lire garde sa source LaTeX. Les deux formats ont été vérifiés dans LibreOffice, pas dans Microsoft Word.

### Fichiers joints

Trombone, glisser-déposer ou Ctrl+V : un fichier texte, un PDF, un .docx ou un .odt est lu dans le navigateur, formules comprises pour ces deux derniers ; une image est transcrite par le modèle Medium, un enregistrement audio par whisper (8 minutes environ au plus), puis le texte part avec la question. S'il y a plusieurs voix dans l'enregistrement, chaque tour de parole est précédé de son locuteur. Dans Discussion et Imprimerie, l'image part aussi telle quelle et c'est un modèle qui lit les images qui répond : celui choisi s'il en est capable, sinon Gemma 4 ou Medium. Un PDF scanné n'a pas de texte : il se joint comme image.

Dans Imprimerie, les fichiers déposés sont les sources du document (voir plus bas).

### Courrier

On écrit une formule d'appel ("Madame,", "Monsieur le directeur,") puis les idées principales. À chaque pause de frappe, Albert propose le courrier rédigé et corrigé.

### Imprimerie

On dépose des sources (rapport, compte rendu, cours, ancien sujet), puis on demande un document : note de synthèse, courrier, évaluation avec barème. Chaque demande suivante le modifie : Albert rend le document entier, mis à jour. Seule la dernière version s'affiche, sans les demandes ; elle s'enregistre en .docx ou en .odt.

- Les fichiers déposés vont dans une bibliothèque commune à tous les documents. Chaque document coche ceux qu'il utilise ; un clic sur un nom télécharge le texte gardé, pas le fichier d'origine.
- Seul le texte des fichiers est gardé, dans le navigateur, selon la même règle que les conversations (voir Sécurité). Supprimer un document laisse ses sources dans la bibliothèque : on les en retire une par une ou toutes d'un coup avec "Vider la bibliothèque".
- Les sources cochées partent en entier avec chaque demande. Au moment où on les coche, leur texte ne dépasse pas 60 % du contexte du modèle, soit environ 80 pages avec Large.
- Seule la version en cours du document accompagne la demande. Les dix dernières versions restent dans le volet, sous "Versions" : un clic en reprend une.
- La section "Imprimerie" du menu sert à créer, nommer, rouvrir et supprimer les documents : dix au plus, comptés à part des dix conversations de l'historique.
- Mêmes outils que Discussion, recherche web comprise.

### Recherche web

Internet est autorisé au départ, sans moteur de recherche. Dans Réglages, on peut cocher jusqu'à trois moteurs : Wikipédia, Vikidia, HAL, OpenAlex, Internet Archive, Open Library, Google et Mojeek (ces deux derniers avec une clé). Le globe de la barre de saisie apparaît quand Internet est autorisé : tant qu'il est activé, les questions peuvent chercher et montrer des images Wikimedia. Les mots cherchés et les pages consultées s'affichent sous la réponse.

Globe activé, le modèle a aussi dix services de l'État, sans clé : Annuaire de l'administration, Annuaire des entreprises, Annuaire de l'éducation, calendrier scolaire, Base adresse nationale, API Géo (communes), BOAMP (marchés publics), data.gouv.fr, Parcoursup et Hub'eau (eau du robinet).

### Outils

Dans Discussion, cinq outils sont activés par défaut ; on peut les désactiver dans Réglages > Outils. Tout se passe dans le navigateur. Le modèle décide seul de s'en servir ; quand un outil a servi, son icône apparaît sous la réponse et un clic montre ce qu'il a fait.

| Outil | Rôle |
|---|---|
| Calculatrice | Calcul exact avec [math.js](https://mathjs.org/) : opérations, puissances, racines, trigonométrie en degrés, logarithmes, fractions exactes, factorielles et combinaisons, unités ; décomposition en facteurs premiers, PGCD et PPCM ; statistiques d'une série (moyenne, médiane, variance, écart-type, quartiles du lycée) ; moyenne pondérée par des coefficients ; dérivée d'une expression en x. Calcul formel avec [Giac](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac_fr.html), le moteur de Xcas : valeurs exactes, équations, inéquations et systèmes, factorisation et développement, primitives et intégrales, limites, sommes, lois binomiale et normale, suites, tableau de variations. |
| Tirage aléatoire | Ordre de passage, éléments tirés ou groupes, avec le générateur aléatoire du navigateur. |
| Calendrier | Date et heure actuelles ou dans N heures, jour de la semaine d'une date, date dans N jours ou N mois, nombre de jours entre deux dates, jours ouvrés et jours fériés en France, report d'une échéance au premier jour ouvré suivant. |
| Compteur | Nombre de mots et de caractères d'un texte ; occurrences d'une lettre, mot épelé et écrit à l'envers, anagramme vérifiée ; lisibilité (mots par phrase, phrases de plus de 20 mots, mots de 10 lettres ou plus). |
| Contrôle SIRET et IBAN | Clé de contrôle d'un SIREN, d'un SIRET ou d'un IBAN, pour repérer un numéro mal recopié ; l'existence du numéro n'est pas vérifiée. |

Chaque demande donne aussi au modèle son nom. Dans Discussion, la date et l'heure viennent du Calendrier : son icône sous la réponse montre qu'elles viennent de l'appareil et non du modèle. Calendrier désactivé ou dans les autres modules, elles partent avec chaque demande.

### Réglages

Choix du modèle, température, top-k et contexte. Le curseur de contexte fixe le nombre d'échanges que l'IA reçoit : à 0, seule la dernière question part. S'y ajoutent un interrupteur par outil, Internet et ses moteurs, les voix en ligne pour la lecture à voix haute et le nom de l'application (12 caractères au plus). Les cartes IA et Outils ont chacune un bouton "Réglages conseillés".

### Langues

Interface en français, anglais, espagnol et allemand. Au premier lancement, la langue du navigateur ; ensuite, celle choisie par le drapeau du volet, gardée dans le navigateur. La langue suit aussi le reste : le moteur de recherche est interrogé sur le domaine de la langue, dates et nombres au format local, formules lues à voix haute dans la langue de la réponse.

## Accessibilité

La page vise la conformité [RGAA](https://accessibilite.numerique.gouv.fr/). Aucun audit n'a encore été mené.

- Langue déclarée sur `<html>` et mise à jour avec la langue choisie, chaque champ a une étiquette visible.
- Tout se fait au clavier. Le focus est visible et revient dans la zone de saisie après chaque réponse.
- Les nouveaux messages et l'état ("Albert réfléchit...", erreurs) sont annoncés aux lecteurs d'écran.
- Thème clair ou sombre selon le réglage du système, contrastes d'au moins 4,5:1 pour le texte.

## Sécurité

Audit interne et externe, modèle de menaces et plan d'action : [SECURITE.md](SECURITE.md).

- Par défaut, la clé, les questions, les conversations, les documents et la bibliothèque de sources sont gardés dans `sessionStorage` et effacés après la fermeture de l'onglet (au chargement suivant). Interrupteur activé, ils restent dans `localStorage`, sans limite de durée.
- La clé part dans l'en-tête `Authorization`, jamais dans l'URL.
- Elle transite par l'instance n8n : l'administrateur de cette instance peut techniquement la voir. Le workflow n'enregistre aucune exécution, donc aucun en-tête.
- Le workflow compte par jour les appels acceptés par Albert (ouverture de la page et messages) : le nombre d'appels, rien d'autre, 90 jours au plus. Le total s'affiche dans "À propos", lu sur `albert-go/stats`, public.
- Le webhook appelle uniquement l'API Albert, dont l'adresse est fixée dans le workflow.
- La page ne charge aucun script externe. Une politique CSP limite les connexions à l'instance n8n, aux moteurs de recherche, à Wikimedia Commons et aux services de l'État. Elle limite les scripts au site lui-même.
- Le HTML produit à partir des réponses d'Albert est assaini avant affichage : scripts, gestionnaires d'événements et liens `javascript:` sont retirés.

## Fonctionnement

L'API Albert n'accepte pas les appels directs depuis une page web (pas d'en-têtes CORS). La page passe donc par un webhook n8n hébergé sur la plateforme n8n interministérielle, qui relaie la requête vers Albert.

```
Navigateur -> webhook n8n -> API Albert
```

- `public/` : la page (HTML, CSS, JavaScript), publiée sur Pages, avec les bibliothèques embarquées dans `public/vendor/`.
- `public/js/rendu/` : le rendu des réponses (schémas, courbes, images) et leur export : `export.js` parcourt la réponse affichée, `docx.js` et `odt.js` écrivent le fichier.
- `public/js/tools/` : les outils proposés au modèle (calculs, jours ouvrés, recherche web, images de Commons, services de l'État).
- `n8n/albert-proxy.json` : le workflow n8n, installation dans `n8n/README.md`.

## Développement

```bash
./local.sh     # sert la page sur http://localhost:8642 et l'ouvre dans le navigateur
node --test    # tests
./images-lancement.sh    # refait les images de lancement iOS (nouvel écran : une ligne dans ECRANS)
```

Le webhook n'accepte que deux origines : l'adresse Pages du projet et `http://localhost:8642`.

### Traductions

- `public/js/langues/<langue>.js` : tout le texte visible, un fichier par langue, plus les phrases envoyées au modèle (demandes des outils, description de l'outil de recherche). Dans `index.html`, un texte porte `data-t`, `data-t-html` (texte avec un lien) ou `data-t-attr` (`aria-label`, `title`, `placeholder`...), relus par `I18n.appliquer()` (`public/js/i18n.js`). `tests/i18n.test.js` vérifie qu'aucune langue n'oublie de clé.
- `public/prompts/<langue>/*.txt` : les consignes système, une par outil et par langue.

Ajouter une langue : un code dans `I18n.LANGUES`, son fichier `public/js/langues/<code>.js` chargé dans `index.html`, un dossier dans `public/prompts/`, sa table dans `Lecture.FORMULES`, son drapeau et son option dans `index.html` et le domaine Wikipédia dans la CSP.

### Modèles

Modèles disponibles en octobre 2026, selon le type de travail :

| Type de travail | Modèle |
|---|---|
| Usage courant, raisonnements longs (conseillé) | Large (`gpt-oss-120b`), plus lent |
| Questions simples, réponse rapide | Small (`ministral-3-8b`) |
| Compromis qualité et rapidité, lecture d'images | Medium (`mistral-small-3-2-24b`) |
| Lecture d'images | Gemma 4 31B (`gemma-4-31B-it`) |
| Programmation | Code (`qwen3-coder-30b`) |
| Programmation sur de longs documents | DeepSeek V4 Flash (`deepseek-v4-flash`) |

Tous les modèles savent utiliser la recherche web pour une question dont la réponse n'est pas dans leurs connaissances, ils décident de l'utiliser d'eux-mêmes.

## Auteur

Olivier Booklage, [olivier.booklage@ac-bordeaux.fr](mailto:olivier.booklage@ac-bordeaux.fr)

## Licences

| Composant | Licence |
|---|---|
| Albert Go | [Licence Ouverte 2.0](https://www.data.gouv.fr/pages/legal/licences/etalab-2.0) (Etalab), texte dans `LICENSE` |
| [Marked](https://github.com/markedjs/marked), [KaTeX](https://katex.org/), [Mermaid](https://mermaid.js.org/), [Pico](https://picocss.com/), [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | MIT |
| [PDF.js](https://mozilla.github.io/pdf.js/), [math.js](https://mathjs.org/) | Apache 2.0 |
| [highlight.js](https://highlightjs.org/) | BSD 3-Clause |
| [Giac](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac_fr.html), le moteur de calcul formel de Xcas | GPL 3.0 ou ultérieure, texte dans `public/vendor/giac/LICENSE` |
| Icônes des titres des Réglages, de [Lucide](https://lucide.dev/) | ISC |
| Logos des éditeurs de modèles (`public/images/editeurs/`) | Marques de leurs éditeurs, reprises de la [page des modèles d'Albert API](https://ia.numerique.gouv.fr/outils-ia/albert-api/mod%C3%A8les/) |
| Logos des moteurs de recherche (`public/images/moteurs/`) | Marques de leurs éditeurs, reprises de leurs sites ; OpenAlex depuis [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:OpenAlex_logo_icon.svg) (MIT) |

Versions et provenance des bibliothèques : `public/vendor/README.md`.
