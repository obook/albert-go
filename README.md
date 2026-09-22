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

Rédiger : on tape la formule d'appel ("Madame,", "Monsieur le directeur,") puis ses idées principales ; à chaque pause de frappe, Albert propose le courrier rédigé et corrigé, dans le registre qu'implique la formule d'appel. Boutons Copier, Écouter et Revoir : Revoir reconstruit le courrier, retire les redites et signale ce qu'Albert ne tranche pas seul (un jour de la semaine qui ne correspond pas à la date, une information manquante). La dernière proposition est gardée dans l'historique.

Sous chaque réponse : copier le texte, ou le lire à voix haute avec une voix installée sur l'appareil. Chrome sous Linux n'en voit aucune : le réglage "Autoriser les voix en ligne" permet alors d'utiliser la voix de Google, qui reçoit le texte lu.

Pour obtenir une clé Albert : [demande d'accès](https://albert.sites.beta.gouv.fr/access/).

## Recherche web

Désactivée par défaut : à allumer dans Réglages. Une fois allumée, le modèle reçoit un outil de recherche et décide seul de l'appeler. Les mots cherchés s'affichent sous la réponse.

**Wikipédia**, moteur par défaut : aucune clé, CORS ouvert, et Albert reçoit le résumé de l'article plus la section qui contient les mots de la question, soit le texte lui-même et non une liste de liens. C'est ce qui l'empêche d'inventer une date ou une étymologie. Les champs de l'infobox (superficie, population, dates) partent aussi : le texte brut de MediaWiki les laisse de côté, alors que ce sont justement les chiffres qu'on lui demande.

Le premier appel impose la recherche, par précaution. Essai du 21 septembre 2026, question dont la réponse n'est pas dans les poids, outil imposé puis outil libre, trois essais par modèle en libre :

| Modèle | Imposé | Libre |
|---|---|---|
| Large (`gpt-oss-120b`) | cherche | cherche |
| Medium (`mistral-small-3-2-24b`) | cherche | cherche |
| Small (`ministral-3-8b`) | cherche | cherche |
| Code (`qwen3-coder-30b`) | cherche | cherche |
| `deepseek-v4-flash-0731` | cherche | cherche |
| `gemma-4-31b-it` | cherche | cherche |

Les six appellent l'outil, même laissés libres.

Deux moteurs web restent proposés, avec une clé, et ne rendent que titres, adresses et courts extraits. Moteurs essayés le 20 septembre 2026 :

- Google Programmable Search : API JSON fermée aux nouveaux projets (403), arrêt annoncé le 1er janvier 2027.
- Mojeek : appels navigateur acceptés, API sur devis.
- Qwant : 403. Marginalia, SearXNG public, MetaGer : pas d'en-têtes CORS. Stract : CORS figé sur `localhost:8000`.

## Langues

Interface en français, anglais, espagnol et allemand. Au premier lancement, la langue du navigateur ; ensuite, celle choisie par les drapeaux de l'en-tête ou dans Réglages, gardée dans le navigateur.

- `public/js/i18n.js` : tout le texte visible, dans les deux langues, plus les phrases envoyées au modèle (demandes des outils, description de l'outil de recherche). Dans `index.html`, un texte porte `data-t`, `data-t-html` (texte avec un lien) ou `data-t-attr` (`aria-label`, `title`, `placeholder`...), relus par `I18n.appliquer()`.
- `public/prompts/<langue>/*.txt` : les consignes système, une par outil et par langue.
- La langue suit aussi le reste : Wikipédia interrogé sur le domaine de la langue, dates et nombres au format local, formules lues à voix haute dans la langue de la réponse.

Ajouter une langue : un code dans `I18n.LANGUES`, sa table dans `I18n.TEXTES`, un dossier dans `public/prompts/`, sa table dans `Lecture.FORMULES`, son drapeau et son option dans `index.html`, et le domaine Wikipédia dans la CSP.

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
- La page ne charge aucun script externe. Une politique CSP limite les connexions à l'instance n8n et aux moteurs de recherche, et les scripts au site lui-même.
- Le HTML produit à partir des réponses d'Albert est assaini avant affichage : scripts, gestionnaires d'événements et liens `javascript:` sont retirés.

## Licences

| Composant | Licence |
|---|---|
| Albert Go | [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/) (Etalab), texte dans `LICENSE` |
| [Marked](https://github.com/markedjs/marked), [KaTeX](https://katex.org/), [Mermaid](https://mermaid.js.org/) | MIT (détail dans `public/vendor/README.md`) |

## Accessibilité

La page vise la conformité [RGAA](https://accessibilite.numerique.gouv.fr/). Aucun audit n'a encore été mené.

- Langue déclarée sur `<html>` et mise à jour avec la langue choisie, chaque champ a une étiquette visible.
- Tout se fait au clavier. Le focus est visible et revient dans la zone de saisie après chaque réponse.
- Les nouveaux messages et l'état ("Albert réfléchit...", erreurs) sont annoncés aux lecteurs d'écran.
- Thème clair ou sombre selon le réglage du système, contrastes d'au moins 4,5:1 pour le texte.
