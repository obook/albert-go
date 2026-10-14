# Feuille de route

Ce qui reste à faire, du plus simple au plus long. Le détail des failles est dans [SECURITE.md](SECURITE.md).

## Sécurité

- **I11** : prendre Marked du paquet npm et vérifier qu'il est identique à `public/vendor/marked/`.
- **E1** : demander aux administrateurs n8n une limite de débit par adresse IP sur le relais.
- **E3, E5** : signaler à l'équipe de la Forge les en-têtes de sécurité manquants sur Pages.
- Relire `SECURITE.md` depuis le compteur d'appels : certaines lignes disent encore que le relais ne garde rien.

## Outils du modèle

- Tester avec un vrai modèle : outils locaux (groupes, statistiques, compteur), jours ouvrés, services de l'État, courbes (dont l'exemple à trois courbes de l'accueil), calcul formel (Giac).
- Calcul formel : essayer le chargement de Giac sur iPad (19 Mo, 256 Mo de mémoire réservés au démarrage).
- Calcul formel dans albert-atelier : son outil calcul est en Python, côté serveur, sans Giac. SymPy, déjà en option dans le projet, est le moteur naturel ; le tableau de variations y reste à construire. Reprendre aussi les libellés "Calculatrice scientifique" et "Générateur aléatoire".
- API ouvertes à étudier : Tabular API de data.gouv.fr (lire les lignes d'un fichier publié), géocodage inverse et itinéraire de l'IGN, Géorisques.
- Légifrance et Judilibre : il faut des identifiants PISTE et une route n8n, car la clé ne peut pas rester dans le navigateur.
- Wiktionnaire et autres services externes : en réflexion, car les mots cherchés partent chez un tiers.

## Documents et exports

- PDF illisible sur l'iPad d'un collègue (Chrome), relevé le 14/10/2026 : "Document illisible" par le trombone comme par la bibliothèque, avec un fichier local, pas seulement depuis OneDrive. Sur ordinateur, le même PDF passe. Déjà fait sans effet : pdf.js en version legacy, puis sa version dans l'adresse contre le cache du service worker (`de442db`). Le message donne maintenant l'erreur de pdf.js entre parenthèses (`lireContenu`, `piece-jointe.js`) : la retirer une fois le bug compris. Test prévu sur un iPad personnel :
  1. Vérifier dans "À propos" que le commit est `a2aed4f` ou plus récent ; sinon recharger la page.
  2. Déposer par le trombone un PDF qui passe sur ordinateur (un programme de physique-chimie).
  3. Relever le texte entre parenthèses après "Document illisible", ou en faire une capture.
  4. Relever la version d'iPadOS (Réglages, Général, Informations).
  5. Refaire l'essai dans Safari : Chrome sur iPad utilise le même moteur.
- Imprimerie : essayer un long document avec un vrai modèle. Le rendu du document entier n'est vérifié que sur un sujet court, avec Small et Medium.
- Ouvrir un .docx et un .odt produits dans Microsoft Word : seul LibreOffice a servi aux essais.
- Modèle de l'enseignant : son propre .odt, avec son en-tête et une balise `{contenu}` où Albert Go insère le document, sur le principe d'odtPHP.
- Recherche dans les sources (collections et `/v1/search` d'Albert) quand elles dépassent le plafond : il faut trois routes de plus dans le relais n8n et les sources seraient alors gardées chez Albert.
- Mineurs connus : un élément de liste qui commence par un bloc de code ou une image perd son numéro dans le fichier exporté ; le refus d'un fichier ne dit pas lequel ; les grands opérateurs d'une équation Word ne grandissent pas avec leur contenu.

## Interface

- Grand écran : le titre de la conversation dans le bouton du volet, comme sur L'Assistant de la DINUM. Le titre existe déjà (`Albert.libelleConversation`).

## À surveiller

- Une conversation Rédac (devenu Courrier) réaffichée en fil Trad après un rechargement forcé, vue une fois. Si elle revient, lancer dans la console du même onglet, avant de le fermer :

  ```js
  [sessionStorage, localStorage].map(s => JSON.parse(s.getItem('albert-go.conversations') || '[]').map(c => [c.id, c.outil, c.titre.slice(0, 30)])).concat([sessionStorage.getItem('albert-go.conversation-courante')])
  ```

## Raccourcis assumés

Marqués `ponytail:` dans le code, chacun avec ce qui déclencherait une version plus complète.
