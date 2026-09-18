# Albert Chat

Chatbot minimal pour [Albert](https://albert.api.etalab.gouv.fr), l'IA de l'État portée par la DINUM. Chaque utilisateur saisit sa propre clé API.

Page en ligne : https://booklageolivier.forge.apps.education.fr/albert-go/

## Fonctionnement

L'API Albert n'accepte pas les appels directs depuis une page web (pas d'en-têtes CORS). La page passe donc par un webhook n8n hébergé par l'Éducation nationale, qui relaie la requête vers Albert.

```
Navigateur -> webhook n8n -> API Albert
```

- `public/` : la page (HTML, CSS, JavaScript sans dépendance), publiée sur Pages.
- `n8n/albert-proxy.json` : le workflow n8n, à importer dans une instance n8n puis publier.

Pour obtenir une clé Albert : [demande d'accès](https://albert.sites.beta.gouv.fr/access/).

## Développement

```bash
./local.sh     # sert la page sur http://localhost:8642 et l'ouvre dans le navigateur
node --test    # tests
```

Le webhook n'accepte que deux origines : l'adresse Pages du projet et `http://localhost:8642`.

## Sécurité

- La clé est stockée dans le `localStorage` du navigateur. Le bouton "Changer de clé" l'efface.
- Elle part dans l'en-tête `Authorization`, jamais dans l'URL.
- Elle transite par l'instance n8n : l'administrateur de cette instance peut techniquement la voir. Le workflow n'enregistre aucune exécution, donc aucun en-tête.
- Le webhook appelle uniquement l'API Albert, dont l'adresse est fixée dans le workflow.
- La page ne charge aucun script externe. Une politique CSP limite les connexions à l'instance n8n.
- Les réponses d'Albert sont affichées comme du texte, jamais interprétées comme du HTML.

## Accessibilité

La page vise la conformité [RGAA](https://accessibilite.numerique.gouv.fr/). Aucun audit n'a encore été mené.

- Langue déclarée (`lang="fr"`), chaque champ a une étiquette visible.
- Tout se fait au clavier. Le focus est visible et revient dans la zone de saisie après chaque réponse.
- Les nouveaux messages et l'état ("Albert réfléchit...", erreurs) sont annoncés aux lecteurs d'écran.
- Thème clair ou sombre selon le réglage du système, contrastes d'au moins 4,5:1 pour le texte.
