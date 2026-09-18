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

Réglages : modèle (Medium, Large, Small, Code), température et mémoire de la conversation. Mémoire désactivée, seule la dernière question part.

Fichiers joints (trombone, glisser-déposer ou Ctrl+V) : un fichier texte est lu dans le navigateur ; une image est transcrite par le modèle Medium, puis son texte part avec la question. Les PDF ne sont pas pris en charge.

Sous chaque réponse : copier le texte, ou le lire à voix haute avec une voix installée sur l'appareil.

Pour obtenir une clé Albert : [demande d'accès](https://albert.sites.beta.gouv.fr/access/).

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
| [Marked](https://github.com/markedjs/marked), [KaTeX](https://katex.org/), [Mermaid](https://mermaid.js.org/) | MIT (détail dans `public/vendor/README.md`) |

## Accessibilité

La page vise la conformité [RGAA](https://accessibilite.numerique.gouv.fr/). Aucun audit n'a encore été mené.

- Langue déclarée (`lang="fr"`), chaque champ a une étiquette visible.
- Tout se fait au clavier. Le focus est visible et revient dans la zone de saisie après chaque réponse.
- Les nouveaux messages et l'état ("Albert réfléchit...", erreurs) sont annoncés aux lecteurs d'écran.
- Thème clair ou sombre selon le réglage du système, contrastes d'au moins 4,5:1 pour le texte.
