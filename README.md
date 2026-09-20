# Albert Go

Chatbot minimal pour [Albert](https://albert.api.etalab.gouv.fr), l'IA de l'État portée par la DINUM. Chaque utilisateur saisit sa propre clé API.

Page en ligne : https://booklageolivier.forge.apps.education.fr/albert-go/

## Fonctionnement

L'API Albert n'accepte pas les appels directs depuis une page web (pas d'en-têtes CORS). La page passe donc par un webhook n8n hébergé sur la plateforme n8n interministérielle, qui relaie la requête vers Albert.

```
Navigateur -> webhook n8n -> API Albert
```

- `public/` : la page (HTML, CSS, JavaScript), publiée sur Pages. Les réponses gèrent le Markdown, les formules LaTeX et les diagrammes Mermaid, avec des bibliothèques embarquées dans `public/vendor/`.
- `n8n/albert-proxy.json` : le workflow n8n, à importer dans une instance n8n puis publier.

Réglages : modèle (liste des modèles de conversation lue sur l'API Albert, alias et nom réel au survol), température et contexte. Contexte désactivé, seule la dernière question part. Un trait en bas de la zone de saisie montre la part du contexte du modèle occupée par la conversation (rouge au-delà de 80 %).

Fichiers joints (trombone, glisser-déposer ou Ctrl+V) : un fichier texte est lu dans le navigateur ; une image est transcrite par le modèle Medium, puis son texte part avec la question. Les PDF ne sont pas pris en charge.

Sous chaque réponse : copier le texte, ou le lire à voix haute avec une voix installée sur l'appareil. Chrome sous Linux n'en voit aucune : le réglage "Autoriser les voix en ligne" permet alors d'utiliser la voix de Google, qui reçoit le texte lu.

Pour obtenir une clé Albert : [demande d'accès](https://albert.sites.beta.gouv.fr/access/).

## Recherche web

Le code existe (`public/js/recherche.js`) mais la fonction est masquée et sans effet : aucun moteur n'est utilisable depuis un navigateur.

Le modèle reçoit un outil de recherche et décide seul de l'appeler. Il obtient titres, adresses et extraits, jamais le texte des pages. Les mots cherchés s'affichent sous la réponse.

Moteurs essayés le 20 septembre 2026 :

- Google Programmable Search : API JSON fermée aux nouveaux projets (403), arrêt annoncé le 1er janvier 2027.
- Mojeek : appels navigateur acceptés, API sur devis.
- Qwant : 403. Marginalia, SearXNG public, MetaGer : pas d'en-têtes CORS. Stract : CORS figé sur `localhost:8000`.

Pour rouvrir : `RECHERCHE_OUVERTE` à `true` dans `recherche.js`, et retirer `hidden` du bloc "Recherche web" dans `index.html`.

## Développement

```bash
./local.sh     # sert la page sur http://localhost:8642 et l'ouvre dans le navigateur
node --test    # tests
```

Le webhook n'accepte que deux origines : l'adresse Pages du projet et `http://localhost:8642`.

## Sécurité

Audit interne et externe, modèle de menaces et plan d'action : [SECURITE.md](SECURITE.md).

- Par défaut (interrupteur "Effacer la clé et supprimer mes questions à la fermeture de l'onglet" activé), la clé et l'historique des questions sont gardés dans `sessionStorage` et effacés à la fermeture de l'onglet. Interrupteur désactivé, ils restent dans `localStorage`. Le bouton "Changer de clé" des réglages efface la clé.
- Elle part dans l'en-tête `Authorization`, jamais dans l'URL.
- Elle transite par l'instance n8n : l'administrateur de cette instance peut techniquement la voir. Le workflow n'enregistre aucune exécution, donc aucun en-tête.
- Le webhook appelle uniquement l'API Albert, dont l'adresse est fixée dans le workflow.
- La page ne charge aucun script externe. Une politique CSP limite les connexions à l'instance n8n et les scripts au site lui-même.
- Le HTML produit à partir des réponses d'Albert est assaini avant affichage : scripts, gestionnaires d'événements et liens `javascript:` sont retirés.

## Licences

| Composant | Licence |
|---|---|
| Albert Go | [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/) (Etalab), texte dans `LICENSE` |
| [Marked](https://github.com/markedjs/marked), [KaTeX](https://katex.org/), [Mermaid](https://mermaid.js.org/) | MIT (détail dans `public/vendor/README.md`) |

## Accessibilité

La page vise la conformité [RGAA](https://accessibilite.numerique.gouv.fr/). Aucun audit n'a encore été mené.

- Langue déclarée (`lang="fr"`), chaque champ a une étiquette visible.
- Tout se fait au clavier. Le focus est visible et revient dans la zone de saisie après chaque réponse.
- Les nouveaux messages et l'état ("Albert réfléchit...", erreurs) sont annoncés aux lecteurs d'écran.
- Thème clair ou sombre selon le réglage du système, contrastes d'au moins 4,5:1 pour le texte.
