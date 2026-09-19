# Fiche de sécurité - Albert Go

**Date de l'audit :** 2026-09-18
**Version auditée :** commit `0dc4789`
**Référentiel :** guide ANSSI de développement sécurisé

Albert Go est une page statique publiée sur Pages (Forge des communs numériques éducatifs). Chaque utilisateur y saisit sa propre clé API Albert. L'API Albert n'envoyant pas d'en-têtes CORS, la page passe par un webhook n8n hébergé sur la plateforme n8n interministérielle, qui relaie la requête vers Albert.

```
Navigateur (Pages) -> webhook n8n -> https://albert.api.etalab.gouv.fr
```

## Surface d'attaque

### Réseau

- **Destination unique de la page :** `https://n8n.incubateur.education.gouv.fr`, imposée par la CSP (`connect-src`). La page lit aussi ses propres consignes (`prompts/*.txt`, même origine, `connect-src 'self'`).
- **Destinations uniques du relais :** `https://albert.api.etalab.gouv.fr/v1/chat/completions` et `/v1/models`, adresses fixées dans le workflow.
- **Clé API :** en-tête `Authorization: Bearer <clé>`, jamais dans l'URL.
- **Aucun CDN, aucun service tiers, aucune télémétrie.** Marked, KaTeX et Mermaid sont servis depuis Pages.

### Stockage dans le navigateur (préfixe `albert-go.`)

- Clé API et historique des 30 dernières questions, en clair : dans `sessionStorage` si l'interrupteur "Effacer la clé et supprimer mes questions à la fermeture de l'onglet" est activé (par défaut), dans `localStorage` sinon. Avec l'interrupteur activé, ils sont effacés explicitement à la fermeture de l'onglet (`pagehide`), car le navigateur restaure `sessionStorage` quand on rouvre un onglet fermé. Un rechargement de la page redemande donc la clé. L'effacement n'a lieu que si la page est visible : un onglet gelé en arrière-plan (par le navigateur ou une extension comme Auto Tab Discard) garde la clé. Risque résiduel : un onglet fermé en arrière-plan (clic milieu, fermeture de la fenêtre) peut être rouvert avec sa clé par Ctrl+Maj+T.
- Réglages dans `localStorage` : modèle, température, contexte, thème, état de l'interrupteur d'effacement.

### Relais n8n

- Deux webhooks publics, `POST .../albert-go/v1/chat/completions` et `GET .../albert-go/v1/models` (liste des modèles affichée dans les réglages). Une requête sans en-tête `Authorization: Bearer` reçoit un 401 sans être relayée.
- Origines CORS autorisées : l'adresse Pages et `http://localhost:8642`.
- Sauvegarde des exécutions désactivée, réussies comme échouées : n8n n'enregistre ni les en-têtes ni la clé.
- La clé transite par l'instance : son administrateur peut techniquement la voir.

## Modèle de menaces

| Menace | Mesure |
|---|---|
| Vol de la clé par injection de script (XSS) | CSP `script-src 'self'`, aucun script en ligne. Questions insérées par `textContent`. HTML des réponses assaini avant insertion : balises actives, gestionnaires `on*`, attributs `style` et URL `javascript:` retirés. KaTeX en mode `trust: false`. Mermaid en `securityLevel: 'strict'`. |
| Exfiltration par la page | `connect-src` limité à n8n et à la page elle-même, `img-src 'self' data:`, `form-action 'none'`, `base-uri 'none'`. |
| Interception réseau | HTTPS de bout en bout, HSTS sur Pages, TLS 1.3 sur Pages et n8n. |
| Détournement du relais vers un autre service | URL cible fixée dans le workflow, chemins limités à deux webhooks. |
| Conservation de la clé côté serveur | Sauvegarde des exécutions n8n désactivée, vérifiée après un appel réel. |
| Bibliothèque compromise | Fichiers embarqués comparés aux paquets officiels (voir audit interne). |
| Ouverture d'un lien piégé dans une réponse | Liens ouverts avec `rel="noopener noreferrer"`. |
| Clé ou questions lues par l'utilisateur suivant d'un poste partagé | Interrupteur d'effacement, activé par défaut : clé et historique en `sessionStorage`, effacés à la fermeture de l'onglet. |
| Intégration de la page dans le cadre d'un autre site | La page détecte le cadre et n'affiche qu'un lien vers elle-même. |
| Envoi d'un texte à un service de synthèse vocale en ligne | Voix installées sur l'appareil (`localService`) en priorité. Voix en ligne seulement si l'utilisateur active "Autoriser les voix en ligne" (désactivé par défaut), et seulement en l'absence de voix locale. |
| Fichier joint piégé | Fichiers texte lus comme du texte (200 Ko au plus), images redessinées dans un canevas puis converties en JPEG avant envoi. Le contenu obtenu n'est affiché qu'à travers la réponse, donc assaini. |

## Audit interne

Relecture du code de `public/`, du workflow `n8n/albert-proxy.json` et des bibliothèques embarquées.

**Intégrité des bibliothèques.** Chaque fichier de `public/vendor/` a été comparé octet par octet à sa source officielle : Mermaid 11.16.0 et KaTeX 0.16.11 (dont `mhchem`, `auto-render` et les 20 polices) au paquet npm, Marked 17.0.1 à la version minifiée de jsDelivr. Tous sont identiques.

**Vulnérabilités connues.** `npm audit` sur les trois versions embarquées :

| Bibliothèque | Avis | Exploitable ici |
|---|---|---|
| Mermaid 11.16.0 | [GHSA-6x64-9x62-f2gx](https://github.com/advisories/GHSA-6x64-9x62-f2gx) injection CSS, [GHSA-c4c3-pg64-4m4v](https://github.com/advisories/GHSA-c4c3-pg64-4m4v) et [GHSA-3rrr-jr9j-h3q3](https://github.com/advisories/GHSA-3rrr-jr9j-h3q3) pollution de prototype, [GHSA-2v8p-3f2j-5mp7](https://github.com/advisories/GHSA-2v8p-3f2j-5mp7) et [GHSA-rhh3-jpg6-66xh](https://github.com/advisories/GHSA-rhh3-jpg6-66xh) blocage de l'onglet | Oui : le diagramme vient de la réponse du modèle, qu'une question piégée peut orienter. Corrigé en 11.17.2. |
| KaTeX 0.16.11 | [GHSA-cg87-wmx4-v546](https://github.com/advisories/GHSA-cg87-wmx4-v546) `\htmlData` | Non : `\htmlData` n'est actif qu'avec `trust: true`, absent de la configuration. Corrigé en 0.16.21. |
| Marked 17.0.1 | Aucun | |

**Constats**

| N° | Gravité | Constat | Recommandation |
|---|---|---|---|
| I1 | Moyenne | Mermaid 11.16.0 est concerné par cinq avis de sécurité (tableau ci-dessus). | Passer à Mermaid 11.17.2. |
| I2 | Moyenne | Sur un poste partagé (salle informatique, CDI), la clé API reste dans `localStorage` après la fermeture de l'onglet. L'utilisateur suivant peut s'en servir. | Proposer "Ne pas mémoriser la clé" (stockage `sessionStorage`, effacé à la fermeture de l'onglet). |
| I3 | Moyenne | L'historique des 30 dernières questions est gardé en clair dans `localStorage`. Sur un poste partagé, il est lisible par l'utilisateur suivant et peut contenir des données personnelles. | Garder l'historique en `sessionStorage`, ou l'effacer avec la clé. |
| I4 | Faible | Le SVG produit par Mermaid est inséré sans passer par `Rendu.assainir`. Sa sûreté repose sur l'assainissement interne de Mermaid (`securityLevel: 'strict'`), visé par l'avis d'injection CSS. | Corrigé par I1. |
| I5 | Faible | La CSP autorise `style-src 'unsafe-inline'`, exigé par KaTeX et Mermaid. Une injection CSS reste possible, sans chargement externe grâce à `img-src` et `connect-src`. | Accepter le risque tant que KaTeX et Mermaid l'exigent. |
| I6 | Faible | KaTeX 0.16.11 est visé par un avis, non exploitable dans la configuration actuelle. | Passer à KaTeX 0.16.47, `mhchem` de la même version. |
| I7 | Info | Le webhook `/v1/models` n'est plus appelé par la page depuis le passage aux alias fixes. | Le retirer du workflow. |
| I8 | Info | Le workflow relaie la requête vers Albert même sans en-tête `Authorization`. | Répondre 401 directement si l'en-tête ne commence pas par `Bearer `. |

## Audit externe

Tests en boîte noire depuis un poste extérieur, le 2026-09-18, avec `curl` et `openssl`.

**Résultats conformes**

- Pages : redirection HTTP vers HTTPS (308), HSTS de deux ans, TLS 1.3, certificat valide, `Referrer-Policy: strict-origin-when-cross-origin`.
- n8n : TLS 1.3, certificat valide, TLS 1.1 refusé.
- Webhook : 404 sur une autre méthode, un autre chemin, une tentative de traversée (`../`) et l'adresse de test `/webhook-test/`. Un champ `url` ajouté au corps reste sans effet.
- CORS : une origine non autorisée reçoit un `Access-Control-Allow-Origin` différent du sien, le navigateur bloque la réponse.
- Clé absente ou invalide : l'erreur d'Albert (401) est renvoyée telle quelle, sans autre information.

**Constats**

| N° | Gravité | Constat | Recommandation |
|---|---|---|---|
| E1 | Moyenne | Le webhook n'a pas de limite de débit et reste appelable hors navigateur, où CORS ne s'applique pas. Dix requêtes consécutives sans clé et un corps de 2 Mo ont été relayés jusqu'à Albert. Un tiers peut ainsi solliciter l'instance n8n partagée. | Appliquer I8. Demander aux administrateurs de l'instance une limite de débit par adresse IP. |
| E2 | Faible | Pages n'envoie ni `X-Frame-Options` ni CSP `frame-ancestors` (ignoré dans une balise meta). La page peut être intégrée dans le cadre d'un autre site. Ce site ne peut pas lire la clé, mais peut tromper l'utilisateur par superposition (clickjacking). | Afficher la page uniquement hors cadre (`window.top === window.self`). Pages ne permet pas d'ajouter des en-têtes HTTP (non vérifié). |
| E3 | Faible | Pages n'envoie pas `X-Content-Type-Options: nosniff`. | Sans effet pratique ici : tous les fichiers sont servis avec leur type exact. À signaler à l'équipe de la Forge. |
| E4 | Info | Le workflow publié dans n8n n'est pas celui du dépôt : il autorise encore `http://localhost:8000` au lieu de `http://localhost:8642`. | Réimporter `n8n/albert-proxy.json` et publier. Recontrôler après chaque modification du workflow. |

## Suivi des corrections

| N° | État au 2026-09-18 |
|---|---|
| I1, I4 | Corrigé : Mermaid 11.17.2, identique au paquet npm. `npm audit` ne signale plus de vulnérabilité. |
| I2, I3 | Corrigé : interrupteur "Effacer la clé et supprimer mes questions à la fermeture de l'onglet", activé par défaut, sur l'écran de la clé et dans les réglages. |
| I5 | Accepté : exigé par KaTeX et Mermaid. |
| I6 | Corrigé : KaTeX 0.16.47 et `mhchem` de la même version, identiques au paquet npm. |
| I7 | Sans objet : le webhook `/v1/models` a été rétabli pour lister les modèles réellement disponibles, avec la même vérification de clé (I8). |
| I8 | Corrigé : nœud "Clé présente ?", publié. Une requête sans clé reçoit 401 (non distinguable de la réponse d'Albert depuis l'extérieur). |
| E1 | En partie : I8 évite de solliciter Albert sans clé. Limite de débit à demander aux administrateurs de la plateforme. |
| E2 | Corrigé : affichage bloqué dans un cadre. |
| E3 | Ouvert : à signaler à l'équipe de la Forge. |
| E4 | Corrigé : workflow du dépôt publié. Vérifié avec `curl` : origine `http://localhost:8642` acceptée, origine tierce bloquée, `/v1/models` relayé. |

## Pratiques de développement

- Aucune dépendance de construction : ni bundler, ni `npm install` pour publier.
- Bibliothèques embarquées : versions et provenances listées dans `public/vendor/README.md`.
- Pas de code dynamique : aucun `eval`, aucun script en ligne (interdit par la CSP).
- Tests : `node --test` (erreurs d'API, contexte, modèles, historique, lecture vocale, protection des formules, URL dangereuses).

## Conformité RGPD

- Aucun compte, aucun cookie, aucune collecte de données par Albert Go.
- Données transmises : questions, contenu des fichiers joints et clé, vers le relais n8n puis vers l'API Albert (DINUM).
- Hébergement de l'instance n8n et durée de conservation des requêtes par Albert : non vérifiés.
- Données conservées dans le navigateur : réglages sans limite de durée. Clé et historique des questions jusqu'à la fermeture de l'onglet par défaut, sans limite de durée si l'utilisateur désactive l'interrupteur d'effacement.

Pour signaler une vulnérabilité, ouvrez un ticket confidentiel sur la Forge : <https://forge.apps.education.fr/booklageolivier/albert-go/-/issues>
