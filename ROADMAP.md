# Feuille de route

Ce qui reste à faire, du plus simple au plus long. Le détail des failles est dans [SECURITE.md](SECURITE.md).

## Sécurité

- **I11** : prendre Marked du paquet npm et vérifier qu'il est identique à `public/vendor/marked/`.
- **E1** : demander aux administrateurs n8n une limite de débit par adresse IP sur le relais.
- **E3, E5** : signaler à l'équipe de la Forge les en-têtes de sécurité manquants sur Pages.
- Relire `SECURITE.md` depuis le compteur d'appels : certaines lignes disent encore que le relais ne garde rien.

## Outils du modèle

- Tester les outils locaux (groupes, statistiques, compteur) avec un vrai modèle.
- Wiktionnaire et autres services externes : en réflexion, car les mots cherchés partent chez un tiers.

## Interface

- Grand écran : le titre de la conversation dans le bouton du volet, comme sur L'Assistant de la DINUM. Le titre existe déjà (`Albert.libelleConversation`).

## À surveiller

- Une conversation Rédac (devenu Courrier) réaffichée en fil Trad après un rechargement forcé, vue une fois. Si elle revient, lancer dans la console du même onglet, avant de le fermer :

  ```js
  [sessionStorage, localStorage].map(s => JSON.parse(s.getItem('albert-go.conversations') || '[]').map(c => [c.id, c.outil, c.titre.slice(0, 30)])).concat([sessionStorage.getItem('albert-go.conversation-courante')])
  ```

## Raccourcis assumés

Marqués `ponytail:` dans le code, chacun avec ce qui déclencherait une version plus complète.
