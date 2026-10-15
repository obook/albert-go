# Albert Go

Chatbot minimal pour [Albert](https://ia.numerique.gouv.fr/outils-ia/albert-api/), l'IA de l'État portée par la DINUM.

Albert Go tourne sur un serveur : un poste de l'établissement, ou une clé USB (à venir). Le serveur garde la clé API et relaie les questions vers Albert.

## Lancer le serveur

```bash
./local.sh                # http://localhost:8913, ouvre le navigateur
./local.sh --no-browser   # sans ouvrir le navigateur
./local.sh --ssl          # HTTPS, certificat auto-signé
```

```bash
cp .env-exemple .env      # puis coller la clé API après ALBERT_API_KEY=
```

`.env` reste dans le dossier du dépôt, ignoré par git. Sans lui, le serveur le cherche dans `~/.config/albert-go/` ; le terminal affiche au lancement le fichier utilisé. Les clés s'obtiennent sur la [page d'Albert API](https://ia.numerique.gouv.fr/outils-ia/albert-api/).

## Kiosque

```bash
./local.sh --kiosque      # ou ALBERT_KIOSQUE=oui dans .env
```

L'enseignant ouvre `/kiosque`, saisit sa clé Albert API et choisit la durée (1 h, 2 h, 3 h ou la journée). Il partage ensuite le lien (bouton Partager, QR code) et le code à 4 chiffres affiché dans le bandeau. Les élèves rejoignent la session sans voir la clé ; ses réglages sont leurs valeurs de départ. Conversations et bibliothèque restent dans l'onglet. Fermer la session (menu, "Quitter la session") renvoie toute la classe vers `/kiosque`.

## Fonctionnalités

### Modules

| Module | Rôle |
|---|---|
| Discussion | Discuter avec Albert, qui corrige, reformule et traduit aussi sur demande ("Corrige ce texte : ...", "Reformule ce texte : ...", "Traduis en anglais : ..."). |
| Imprimerie | Construire un document peu à peu à partir de sources déposées (voir plus bas). |

Les modules Correction, Style, Courrier et Trad sont mis de côté : ils ne sont plus au menu, mais leurs anciennes conversations se rouvrent depuis l'historique.

### Idées pour commencer

Une discussion vide propose quatorze idées, rangées par famille : texte (corriger, reformuler, traduire, analyser), calcul (calcul, calcul formel, formule, tirage au sort), visuel (graphique, figure, schéma), code, puis Internet (recherche, services de l'État). Chaque clic remplit la saisie avec un autre exemple, parmi ceux de `public/exemples/<langue>/` : quinze ou plus par idée, dix pour chacune des trois idées d'Imprimerie.

### Réponses

Les réponses acceptent le Markdown, les formules LaTeX et les diagrammes Mermaid, graphiques en barres ou en ligne compris ; quand Mermaid refuse un diagramme, la page le renvoie une fois au modèle pour correction. La page calcule et trace elle-même la courbe d'une fonction ; elle nettoie une figure écrite en SVG par le modèle avant de l'afficher. En français, les consignes demandent les notations de France : virgule décimale, intervalles à crochets, calculs en colonne. Sous chaque réponse : copier le texte, le lire à voix haute avec une voix installée sur l'appareil, l'enregistrer en .docx ou en .odt et l'imprimer seule en PDF par l'impression du navigateur ("Enregistrer au format PDF"), avec le rendu de l'écran en thème clair. Sur iPad, l'icône de partage en haut des options d'impression mène à "Enregistrer dans Fichiers". Brave sur iPad n'ouvre pas l'impression : après le bouton PDF, passer par son menu Partager, puis "Imprimer" (pas "Créer un PDF", qui prend toute la page).

La page écrit les deux fichiers dans le navigateur, sans bibliothèque : titres, listes, tableaux, code, liens, figures et images en image. Les formules restent modifiables : équations Word dans le .docx, objets LibreOffice Math dans le .odt. Une formule que KaTeX n'a pas su lire garde sa source LaTeX. Les deux formats sont vérifiés dans LibreOffice ; Microsoft Word reste à essayer.

### Fichiers joints

Trombone, glisser-déposer ou Ctrl+V : la page lit dans le navigateur un fichier texte, un PDF, un .docx ou un .odt, formules comprises pour ces deux derniers ; le modèle Medium transcrit une image et whisper un enregistrement audio (8 minutes environ au plus), puis le texte part avec la question. Quand l'enregistrement a plusieurs voix, la transcription nomme le locuteur de chaque tour de parole. Dans Discussion et Imprimerie, l'image part aussi telle quelle et un modèle qui lit les images répond : celui choisi s'il en est capable, sinon Gemma 4 ou Medium. Un PDF scanné n'a pas de texte : il se joint comme image.

Dans Imprimerie, les fichiers déposés sont les sources du document (voir plus bas).

Dans Discussion, le bouton de bibliothèque de l'en-tête ouvre la même bibliothèque qu'Imprimerie : les sources cochées partent en entier avec chaque question et la réponse s'appuie sur elles. Une icône sous la réponse les signale ; un clic donne leurs noms. Le trombone, lui, joint un fichier à la seule question en cours.

### Imprimerie

On dépose des sources dans la bibliothèque (rapport, compte rendu, cours, ancien sujet), on coche celles qui doivent servir, puis on demande un document : note de synthèse, courrier, évaluation avec barème. Une source déposée mais pas cochée ne part pas avec la demande. Chaque demande suivante le modifie : Albert rend le document entier, mis à jour. Seule la dernière version s'affiche, sans les demandes ; elle s'enregistre en .docx ou en .odt.

- Les fichiers déposés vont dans une bibliothèque commune à tous les documents et aux conversations de Discussion. Chaque document coche ceux qu'il utilise ; un clic sur un nom télécharge le texte gardé, pas le fichier d'origine.
- Seul le texte des fichiers est gardé, dans le navigateur, selon la même règle que les conversations (voir Sécurité). Supprimer un document laisse ses sources dans la bibliothèque : on les en retire une par une ou toutes d'un coup avec "Vider la bibliothèque".
- Les sources cochées partent en entier avec chaque demande. On ne peut en cocher que 60 % du contexte du modèle au plus, soit environ 80 pages avec Large.
- Seule la version en cours du document accompagne la demande. Les dix dernières versions restent dans le volet, sous "Versions" : un clic en reprend une.
- La section "Imprimerie" du menu sert à créer, nommer, rouvrir et supprimer les documents : dix au plus, comptés à part des dix conversations de l'historique.
- Mêmes outils que Discussion, recherche web comprise.

### Recherche web

Internet est autorisé au départ, sans moteur de recherche. Dans Réglages, on peut cocher jusqu'à trois moteurs : Wikipédia, Vikidia, HAL, OpenAlex, Internet Archive, Open Library, Google et Mojeek (ces deux derniers avec une clé). Le globe de la barre de saisie apparaît quand Internet est autorisé : tant qu'il est activé, le modèle peut chercher et montrer des images Wikimedia. Le navigateur garde son état d'un chargement à l'autre. Les mots cherchés et les pages consultées s'affichent sous la réponse. Quand la recherche ne trouve rien, le modèle le dit sans compléter de mémoire.

Globe activé, le modèle a aussi dix services de l'État, sans clé : Annuaire de l'administration, Annuaire des entreprises, Annuaire de l'éducation, calendrier scolaire, Base adresse nationale, API Géo (communes), BOAMP (marchés publics), data.gouv.fr, Parcoursup et Hub'eau (eau du robinet).

### Outils

Dans Discussion, quatre outils sont activés par défaut ; on peut les désactiver dans Réglages > Outils. Tout se passe dans le navigateur. Le modèle décide seul de s'en servir ; quand un outil a servi, son icône apparaît sous la réponse et un clic montre ce qu'il a fait.

| Outil | Rôle |
|---|---|
| Calculatrice scientifique | Calcul exact avec [math.js](https://mathjs.org/) : opérations, puissances, racines, trigonométrie en degrés, logarithmes, fractions exactes, factorielles et combinaisons, unités ; décomposition en facteurs premiers, PGCD et PPCM ; statistiques d'une série (moyenne, médiane, variance, écart-type, quartiles du lycée) ; moyenne pondérée par des coefficients ; dérivée d'une expression en x. Calcul formel avec [Giac](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac_fr.html), le moteur de Xcas : valeurs exactes, équations, inéquations et systèmes, factorisation et développement, primitives et intégrales, limites, sommes, lois binomiale et normale, suites, tableau de variations. |
| Générateur aléatoire | Ordre de passage, éléments tirés ou groupes, avec la source de hasard du navigateur. |
| Calendrier | Date et heure actuelles ou dans N heures, jour de la semaine d'une date, date dans N jours ou N mois, nombre de jours entre deux dates, jours ouvrés et jours fériés en France, report d'une échéance au premier jour ouvré suivant. |
| Compteur | Nombre de mots et de caractères d'un texte ; occurrences d'une lettre, mot épelé et écrit à l'envers, anagramme vérifiée ; lisibilité (mots par phrase, phrases de plus de 20 mots, mots de 10 lettres ou plus). |

Chaque demande rappelle aussi au modèle son nom, par exemple Large (gpt-oss-120b). Dans Discussion, la date et l'heure viennent du Calendrier : son icône sous la réponse montre qu'elles viennent de l'appareil et non du modèle. Calendrier désactivé ou dans les autres modules, elles partent avec chaque demande.

### Réglages

Choix du modèle, température, top-k et contexte. Le curseur de contexte fixe le nombre d'échanges que l'IA reçoit : à 0, seule la dernière question part. S'y ajoutent un interrupteur par outil, Internet et ses moteurs, les voix en ligne pour la lecture à voix haute et le nom de l'application (12 caractères au plus). Les cartes IA et Outils ont chacune un bouton "Réglages conseillés".

### Langues

Interface en français, anglais, espagnol et allemand. Au premier lancement, la langue du navigateur ; ensuite, celle choisie par le drapeau du volet, gardée dans le navigateur. La langue suit aussi le reste : le moteur de recherche est interrogé sur le domaine de la langue, dates et nombres au format local, formules lues à voix haute dans la langue de la réponse.

## Accessibilité

La page vise la conformité [RGAA](https://accessibilite.numerique.gouv.fr/). Aucun audit n'a encore été mené.

- Langue déclarée sur `<html>` et mise à jour avec la langue choisie. Chaque champ a une étiquette visible.
- Tout se fait au clavier, avec un focus visible qui revient dans la zone de saisie après chaque réponse. Après un toucher ou un clic, un bouton qui reçoit le focus d'office n'a pas de contour.
- Les nouveaux messages et l'état ("Albert réfléchit...", erreurs) sont annoncés aux lecteurs d'écran.
- Thème clair ou sombre selon le réglage du système, contrastes d'au moins 4,5:1 pour le texte.

## Sécurité

Audit interne et externe, modèle de menaces et plan d'action : [SECURITE.md](SECURITE.md).

- Par défaut, les questions, les conversations, les documents et la bibliothèque de sources sont gardés dans `sessionStorage` et effacés après la fermeture de l'onglet (au chargement suivant). Interrupteur activé, ils restent dans `localStorage`, sans limite de durée.
- La clé API reste sur le serveur (fichier `.env`) : la page ne la voit jamais, et le serveur ignore l'en-tête `Authorization` qu'elle enverrait.
- Le serveur relaie trois routes d'Albert seulement (`/v1/models`, `/v1/chat/completions`, `/v1/audio/transcriptions`), corps limité à 10 Mo, 16 Mo pour l'audio.
- La page ne charge aucun script externe. Une politique CSP limite les connexions au serveur lui-même, aux moteurs de recherche, à Wikimedia Commons et aux services de l'État. Elle limite les scripts au site lui-même.
- La page assainit le HTML tiré des réponses d'Albert avant de l'afficher : elle retire scripts, gestionnaires d'événements et liens `javascript:`.

## Fonctionnement

La page passe par le serveur d'Albert Go, qui ajoute la clé et relaie la requête vers Albert.

```
Navigateur -> serveur d'Albert Go -> API Albert
```

- `serveur/` : le serveur Python (relais, configuration, régulation du débit par modèle), repris de L'Atelier d'Albert.
- `public/` : la page (HTML, CSS, JavaScript), servie par le serveur, avec les bibliothèques embarquées dans `public/vendor/`.
- `public/js/rendu/` : le rendu des réponses (schémas, courbes, images) et leur export : `export.js` parcourt la réponse affichée, `docx.js` et `odt.js` écrivent le fichier.
- `public/js/tools/` : les outils proposés au modèle (calculs, jours ouvrés, recherche web, images de Commons, services de l'État).
- `n8n/albert-proxy.json` : l'ancien relais n8n de la page en ligne, installation dans `n8n/README.md`.

## Développement

```bash
./local.sh     # lance le serveur sur http://localhost:8913 et ouvre le navigateur
node --test    # tests de la page
.venv/bin/python -m pytest    # tests du serveur (.venv créé par local.sh)
node --test tests/ipad.webkit.js    # la page dans WebKit, le moteur de l'iPad (Playwright, voir l'en-tête du fichier)
./images-lancement.sh    # refait les images de lancement iOS (nouvel écran : une ligne dans ECRANS)
```

Chaque MR lance ces tests sur la forge (`.gitlab-ci.yml`). Un manque relevé sur un vrai iPad s'ajoute à `SAFARI_ANCIEN` dans `tests/ipad.webkit.js` : le WebKit de Playwright est plus récent que Safari sur un iPad pas à jour.

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

Les modèles décident seuls de lancer une recherche web quand la réponse dépasse leurs connaissances.

## Auteur

Olivier Booklage, [olivier.booklage@ac-bordeaux.fr](mailto:olivier.booklage@ac-bordeaux.fr)

## Licences

| Composant | Licence |
|---|---|
| Albert Go | GPL 3.0 ou ultérieure, texte dans `LICENSE` ; le serveur reprend le code de L'Atelier d'Albert, écrit avec Romain P., Luce P.B. et Théossian S.D. (NSI, Trophées NSI 2026) |
| [Marked](https://github.com/markedjs/marked), [KaTeX](https://katex.org/), [Mermaid](https://mermaid.js.org/), [Pico](https://picocss.com/), [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | MIT |
| [PDF.js](https://mozilla.github.io/pdf.js/), [math.js](https://mathjs.org/) | Apache 2.0 |
| [highlight.js](https://highlightjs.org/) | BSD 3-Clause |
| [Giac](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac_fr.html), le moteur de calcul formel de Xcas | GPL 3.0 ou ultérieure, texte dans `public/vendor/giac/LICENSE` |
| Icônes des titres des Réglages, de [Lucide](https://lucide.dev/) | ISC |
| Logos des éditeurs de modèles (`public/images/editeurs/`) | Marques de leurs éditeurs, reprises de la [page des modèles d'Albert API](https://ia.numerique.gouv.fr/outils-ia/albert-api/mod%C3%A8les/) |
| Logos des moteurs de recherche (`public/images/moteurs/`) | Marques de leurs éditeurs, reprises de leurs sites ; OpenAlex depuis [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:OpenAlex_logo_icon.svg) (MIT) |

Les sources de Giac sont sur le site de son auteur : [giac_stable.tgz](https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac/giac_stable.tgz).

Versions et provenance des bibliothèques : `public/vendor/README.md`.
