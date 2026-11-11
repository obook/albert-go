# Feuille de route

Ce qui reste à faire, du plus simple au plus long. Le détail des failles est dans [SECURITE.md](docs/SECURITE.md).

## Sécurité

- [ ] **I13** : passer à Mermaid 12.2.0, qui embarque sa propre copie de KaTeX (KaTeX 0.18.11 fait le 26/10/2026). Mermaid 12 exige Safari 17.4 et change l'allure des diagrammes (`layout: 'dagre'` pour garder l'ancienne) : vérifier d'abord la version des iPad des élèves (Réglages > Général > Informations > Version d'iPadOS, 17.4 au moins).
- [ ] albert-atelier : passer aussi KaTeX de 0.16.47 à 0.18.11, même avis (GHSA-238p-pmpm-9mq7).
- [ ] **E1** : demander aux administrateurs n8n une limite de débit par adresse IP sur le relais.
- [ ] **E3, E5** : signaler à l'équipe de la Forge les en-têtes de sécurité manquants sur Pages.
- [x] Relire `SECURITE.md` depuis le compteur d'appels : certaines lignes disent encore que le relais ne garde rien.

## Outils du modèle

- [ ] Tester avec un vrai modèle : outils locaux (groupes, statistiques, compteur), jours ouvrés, services de l'État, courbes (dont l'exemple à trois courbes de l'accueil), calcul formel (Giac).
- [ ] Calcul formel : essayer le chargement de Giac sur iPad (19 Mo, 256 Mo de mémoire réservés au démarrage).
- [ ] Calcul formel dans albert-atelier : son outil calcul est en Python, côté serveur, sans Giac. SymPy, déjà en option dans le projet, est le moteur naturel ; le tableau de variations y reste à construire. Reprendre aussi les libellés "Calculatrice scientifique" et "Générateur aléatoire".
- [ ] API ouvertes à étudier : Tabular API de data.gouv.fr (lire les lignes d'un fichier publié), géocodage inverse et itinéraire de l'IGN, Géorisques.
- [ ] Légifrance et Judilibre : il faut des identifiants PISTE et une route n8n, car la clé ne peut pas rester dans le navigateur.
- [ ] Wiktionnaire et autres services externes : en réflexion, car les mots cherchés partent chez un tiers.
- [ ] Images : Albert écrit parfois "Les sources fournies ne donnent aucune information" en parlant des résultats d'`image_commons`. La règle "Sources" de `discuter.txt`, faite pour la Bibliothèque, s'applique à tort aux résultats des outils (vu le 11/11/2026). Non reproduit le même jour sur 42 réponses de Large (images simulées, pertinentes ou non) : à son retour, noter la question et les sources cochées.

## Documents et exports

- [ ] PDF illisible sur iPad, relevé le 14/10/2026 : `getTextContent` de pdf.js parcourt un flux par `for await`, que WebKit ne sait pas faire, donc aucun navigateur de l'iPad. `lirePdf` lit maintenant le flux à la main (`tests/pdf.test.js`). Reste à le confirmer sur l'iPad, puis à retirer l'erreur de pdf.js recopiée entre parenthèses après "Document illisible" (`lireContenu`, `piece-jointe.js`).
- [ ] Imprimerie : essayer un long document avec un vrai modèle. Le rendu du document entier n'est vérifié que sur un sujet court, avec Small et Medium.
- [ ] Ouvrir un .docx et un .odt produits dans Microsoft Word : seul LibreOffice a servi aux essais.
- [ ] Modèle de l'utilisateur : son propre .odt, avec son en-tête et une balise `{contenu}` où Albert Go insère le document, sur le principe d'odtPHP.
- [ ] Stockage : passer à IndexedDB (directement ou avec Dexie) ou à OPFS si le quota du localStorage gêne ou pour garder images et PDF avec les conversations. OPFS n'écrit hors d'un worker que depuis Safari 26.
- [ ] Mineurs connus : un élément de liste qui commence par un bloc de code ou une image perd son numéro dans le fichier exporté ; le refus d'un fichier ne dit pas lequel ; les grands opérateurs d'une équation Word ne grandissent pas avec leur contenu.

## Bibliothèque

- [x] Fiche de lecture de chaque source : à son dépôt, un court résumé, ses thèmes clés et quelques questions à lui poser, cliquables. Fait le 10/11/2026, ouvert par le nom de la source.
- [x] Fiche de lecture : coût mesuré le 10/11/2026, celui d'une question posée avec la source cochée. 50 pages (35 000 caractères) : 11 000 jetons, 2 s avec Small, 15 s avec Large. 150 000 caractères avec Large : 46 000 jetons, 10 s. S'il gêne, ne le rédiger qu'à la première ouverture, comme le fait déjà le repli.
- [ ] Fiche de lecture : l'essayer sur iPad (boîte, tiroir de la bibliothèque, question placée dans la saisie) et dans la version en ligne, par le relais n8n.
- [x] Fiche de lecture : un bouton "Refaire la fiche", si elle déçoit ou après un changement de langue. Elle reste dans la langue de l'interface au moment du dépôt. Température 0,7, sinon la fiche refaite est presque la même.
- [x] Fiche de lecture : un échec au dépôt ne se voit pas (le nom cesse de pulser). Gardé ainsi : le repli à l'ouverture le rattrape, et une erreur sur une action non demandée ferait du bruit.
- [ ] Supports en un clic à partir des sources cochées : fiche de révision, FAQ, chronologie, quiz, cartes mémoire et carte mentale (Mermaid). Les proposer aussi dans la boîte de la fiche de lecture, pour cette seule source.
- [x] Notes : épingler une réponse dans la bibliothèque, puis la cocher comme une source. Fait le 10/11/2026 : bouton sous la réponse, note non cochée, fiche de lecture rédigée à l'ouverture.
- [ ] Citations : des numéros dans la réponse qui ouvrent le passage exact de la source, surligné.
- [x] Texte collé comme source, fait le 10/11/2026.
- [ ] Autres sources que les fichiers : page web par son adresse (le navigateur ne peut pas la lire seul : passer par le relais), transcription d'une vidéo.
- [ ] Carnets : plusieurs bibliothèques séparées, chacune avec ses sources, au lieu d'une seule filtrée par les cases.
- [ ] Résumé audio à deux voix, comme une émission de radio : dialogue écrit par le modèle à partir des sources, lu par la synthèse vocale du navigateur.
- [ ] Recherche dans les sources (collections et `/v1/search` d'Albert) quand elles dépassent le plafond : il faut trois routes de plus dans le relais n8n et les sources seraient alors gardées chez Albert.
- [ ] Variante sans rien garder chez Albert, un vrai RAG dans le navigateur : découper le texte des sources, calculer leurs vecteurs avec `/v1/embeddings` d'Albert (une route de plus dans le relais), les garder dans IndexedDB et n'envoyer avec la question que les passages les plus proches. Utile pour interroger toute une collection d'un coup : les 37 bulletins officiels du dossier de l'utilisateur font environ 2 millions de caractères, quand la limite est à 60 % du contexte (environ 240 000 caractères avec Large). Inutile tant que les sources cochées tiennent dans le contexte : le modèle les lit alors en entier. Point faible : les tableaux des programmes, mal extraits, se couperaient entre deux passages.

## Serveur

- [ ] Niveau et matière (MR 2 du plan de fusion avec l'atelier) : choix dans le volet, consigne du serveur avec les extraits des programmes du BO dans `programmes/`.
- [x] llm-proxy : inutile, `regulation.py` gère déjà le quota. À revoir si d'autres outils partagent le compte Albert sur radio-host.

## Réglages du modèle

Paramètres de l'API standard d'OpenAI, déclarés par Albert (spécification 0.8.0, lue le 25/10/2026). Tous acceptés par Albert, essayés par le relais le 26/10/2026 avec Medium et Large.

- [ ] `logprobs` et `top_logprobs` : montrer, quand on touche un mot (les élèves sont sur iPad : pas de survol), les autres mots possibles et leur probabilité. Avec Large, la liste commence par les tokens de sa réflexion, à sauter.
- [ ] `seed` : rejouer la même réponse avec la même graine. Albert ne promet qu'un "best effort", mais le texte est revenu identique deux fois sur les deux modèles.
- [ ] `n` : plusieurs réponses côte à côte, pour voir l'effet de la température. Chaque réponse compte dans le quota.
- [ ] `frequency_penalty` et `presence_penalty` (-2 à 2) : comparer les deux. Une valeur négative devrait faire répéter le modèle.
- [ ] `max_completion_tokens` : couper la réponse, pour montrer les tokens et la raison d'arrêt `length`. Avec Large, la coupure tombe dans la réflexion : réponse vide.
- [ ] `stop` : arrêter la réponse sur une séquence choisie. Même limite avec Large.
- [ ] `top_p` : un second filtre à côté du curseur `top_k`, qui garde les mots les plus probables jusqu'à p % de probabilité cumulée.
- [x] Vérifier que le relais n8n transmet ces paramètres à Albert.

## Compétences

Mesure du 11/11/2026 avec Large, 6 questions x 3, sans outils : les réponses sont relues pour chaque défaut.

- [ ] Style direct : les tirets longs remontent (6 contre 3 avec Écriture soignée seule) et la virgule décimale tombe (3 contre 14). Lire les réponses pour savoir pourquoi, puis corriger `style-direct.txt`.
- [ ] Sans redite : mesurer son effet sur un document de l'Imprimerie construit par ajouts, avec et sans la compétence.

## Interface

- [ ] Script perdu au lancement : sur le Pixel 8, `rendu/images.js` et `rendu/export.js` n'étaient pas arrivés (10/11/2026), plus d'images ni d'exports. La page se recharge maintenant d'elle-même, mais la cause reste inconnue. Si ça revient, lire l'état par adb et CDP avant de recharger (note Obsidian "debogage-pixel8").
- [x] Grand écran : le titre de la conversation dans le bouton du volet, comme sur L'Assistant de la DINUM. Fait le 14/10/2026, dans l'en-tête à côté du bouton.

## À surveiller

- Albert n'annonce plus quels modèles lisent les images (type `text-generation` pour tous depuis OpenGateLLM 0.9.0). albert-go lit déjà `input_modalities` si Albert le fournit ; sinon la liste `MODELES` décide. Quand [OpenGateLLM #641](https://github.com/etalab-ia/OpenGateLLM/issues/641) sera livré, vérifier le nom du champ et alléger `MODELES`.

- Une conversation Rédac (devenu Courrier) réaffichée en fil Trad après un rechargement forcé, vue une fois. Si elle revient, lancer dans la console du même onglet, avant de le fermer :

  ```js
  [sessionStorage, localStorage].map(s => JSON.parse(s.getItem('albert-go.conversations') || '[]').map(c => [c.id, c.outil, c.titre.slice(0, 30)])).concat([sessionStorage.getItem('albert-go.conversation-courante')])
  ```

## Raccourcis assumés

Marqués `ponytail:` dans le code, chacun avec ce qui déclencherait une version plus complète.
