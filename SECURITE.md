# Fiche de sécurité - Albert Go

**Date :** 2026-09-21 (audit précédent : 2026-09-18)
**Version auditée :** commit `c0332c8`, publié et vérifié en ligne le même jour
**Référentiel :** guide d'hygiène informatique de l'ANSSI, recommandations TLS,
guide ANSSI-PA-102 sur les systèmes d'IA générative. Auto-évaluation, sans revue externe.

Albert Go est une page statique publiée sur Pages (Forge des communs numériques
éducatifs). Chacun y saisit sa propre clé API Albert. Albert n'envoyant pas
d'en-têtes CORS, la page passe par un webhook n8n interministériel.

```
Navigateur (Pages) -> webhook n8n -> https://albert.api.etalab.gouv.fr
                   -> Wikipédia, Google ou Mojeek (si la recherche est activée)
```

## Surface d'attaque

### Réseau

- **Destinations de la page**, fixées par la CSP `connect-src` (vérifiée en
  ligne) : le relais n8n, et si la recherche est activée
  `{fr,en,es,de}.wikipedia.org`, `www.googleapis.com`, `www.mojeek.com`.
- **Destinations du relais :** `/v1/chat/completions` et `/v1/models` chez
  Albert, adresses fixées dans le workflow.
- **Clé Albert :** en-tête `Authorization: Bearer`, jamais dans l'URL.
- **Clé de recherche (Google, Mojeek) :** dans la chaîne de requête, c'est ainsi
  que ces API la lisent. Elle part du navigateur vers le moteur, sans relais.
  Wikipédia n'en demande aucune.
- **Sources affichées sous une réponse :** titres et adresses renvoyés par le
  moteur. Rien n'est chargé depuis ces domaines, seulement des liens à cliquer.
- **Images de Commons :** si l'outil Images est activé, le modèle cherche des
  fichiers sur Commons (mots envoyés à `commons.wikimedia.org`), et un lien vers un fichier
  de `commons.wikimedia.org` affiche sa miniature, servie par
  `upload.wikimedia.org` ou `thumb.wikimedia.org`. Wikimedia voit l'adresse IP.
  Le bouton de téléchargement récupère l'original sur `upload.wikimedia.org`
  (`connect-src`).
  Une image écrite par le modèle devient un lien : rien ne se charge sans ce
  contrôle.
- **Aucun CDN, aucune télémétrie.** Les sept bibliothèques sont servies depuis
  Pages, le QR code est calculé dans le navigateur, et la version affichée dans
  "À propos" est écrite au déploiement : aucune requête vers la forge.

### Stockage dans le navigateur (préfixe `albert-go.`)

- **Sensible** (liste `SENSIBLES` de `stockage.js`) : clé Albert, clé de
  recherche, 30 dernières questions, 10 dernières conversations. En mode
  partagé, activé par défaut, tout cela va dans `sessionStorage` et disparaît à
  la fermeture de l'onglet. Sinon dans `localStorage`, sans limite de durée.
- L'effacement est explicite, le navigateur restaurant `sessionStorage` quand on
  rouvre un onglet fermé : `pagehide` pose une marque, le chargement suivant
  efface si ce n'est pas un rechargement. Un onglet gelé en arrière-plan garde
  ses données, et Ctrl+Maj+T peut le rouvrir avec sa clé.
- **Réglages** (`localStorage`, sans limite de durée) : modèle, température,
  mémoire, thème, langue, voix en ligne, moteur, identifiant `cx`. Aucune donnée
  personnelle.

### Relais n8n

- Deux webhooks publics, `POST .../v1/chat/completions` et `GET .../v1/models`.
  Sans `Authorization: Bearer`, 401 sans relais.
- CORS : l'adresse Pages et `http://localhost:8642`. Toute autre origine reçoit
  `Access-Control-Allow-Origin: null`.
- Sauvegarde des exécutions désactivée : n8n n'enregistre ni en-têtes ni clé.
  Elle y transite quand même, son administrateur peut techniquement la voir.
- Le corps est relayé tel quel, `stream` forcé à `false`.
- Albert voit l'adresse IP de n8n, pas celle de l'utilisateur. La recherche,
  elle, ne passe pas par le relais : le moteur voit l'adresse IP de
  l'utilisateur.

## Modèle de menaces

| Menace | Mesure |
|---|---|
| Vol de la clé par injection de script (XSS) | CSP `default-src 'self'`, aucun script en ligne. Questions et mots cherchés insérés par `textContent`. HTML des réponses assaini : balises actives retirées, gestionnaires `on*`, attributs `style` et URL `javascript:`, `vbscript:`, `data:` non-image supprimés. KaTeX en `trust: false`, Mermaid en `securityLevel: 'strict'`. Blocs ```svg du modèle : seul le `<svg>` est gardé, sans `script`, `style`, `foreignObject`, `animate`, `set`, gestionnaire ni URL exécutable ; son cadre a `contain: paint`. |
| Exfiltration par la page | `connect-src` limité au relais, à Wikipédia et aux deux moteurs. `img-src` limité à la page et aux miniatures de Wikimedia, `form-action 'none'`, `base-uri 'none'`. |
| Interception réseau | HTTPS de bout en bout. Pages et n8n en TLS 1.3, repli TLS 1.2 avec AEAD, certificats valides. HSTS de deux ans sur Pages. |
| Détournement du relais | URL cible fixée dans le workflow, deux chemins seulement, traversée refusée (404). |
| Conservation de la clé côté serveur | Sauvegarde des exécutions n8n désactivée, vérifiée après un appel réel. |
| Bibliothèque compromise | Sept bibliothèques, aucune dépendance de construction. Six identiques octet pour octet au paquet npm, la septième en I11. `npm audit` : rien. |
| Lien piégé dans une réponse | Liens ouverts avec `rel="noopener noreferrer"`, qui coupe aussi le `Referer` : la page visée ne sait pas d'où vient le clic. |
| Adresse piégée dans les sources listées sous une réponse | Ces adresses viennent du moteur, pas du modèle. Elles passent par le même contrôle que les liens d'une réponse (`Rendu.urlDangereuse`) avant de devenir cliquables, et leur titre est inséré par `textContent`. |
| Consigne cachée dans une page trouvée par la recherche | Recherche désactivée par défaut, Wikipédia par défaut, extraits tronqués, aucune capacité hors chercher. Détail en I9. |
| Clé ou questions lues sur un poste partagé | Mode partagé par défaut : tout le sensible en `sessionStorage`, effacé à la fermeture. |
| Page intégrée dans le cadre d'un autre site | La page détecte le cadre et n'affiche qu'un lien vers elle-même. |
| Texte envoyé à une synthèse vocale en ligne | Voix de l'appareil en priorité. Voix en ligne seulement si l'utilisateur les autorise (désactivé par défaut) et faute de voix locale. |
| Fichier joint piégé | Texte lu comme du texte (200 Ko au plus), images redessinées dans un canevas puis converties en JPEG. Le résultat n'apparaît qu'à travers la réponse, donc assaini. |

## Audit interne

Relecture de `public/`, du workflow `n8n/albert-proxy.json`, des bibliothèques
embarquées et de la configuration du dépôt.

**Intégrité des bibliothèques.** Comparaison octet par octet avec le paquet npm
officiel, le 2026-09-21 : KaTeX 0.16.47 (`auto-render`, `mhchem`, 20 polices),
Mermaid 11.17.2, Pico 2.1.1 et qrcode-generator 2.0.4 sont identiques,
highlight.js 11.12.0 et pdf.js 6.3.289 aussi (le 2026-09-24). Marked 17.0.1 ne
l'est pas, voir I11. `npm audit` sur les sept versions, le 2026-09-24 : rien.

**Constats**

| N° | Gravité | Constat | Recommandation |
|---|---|---|---|
| I9 | Moyenne | Recherche activée, le texte des pages trouvées entre tel quel dans le contexte du modèle (`recherche.js`). Une page bien classée sur la requête peut donc lui dicter sa réponse. Le modèle ne sait rien faire d'autre que chercher et sa réponse est assainie : le risque est une réponse orientée ou un lien trompeur présenté comme sourcé. | Afficher les adresses consultées sous la réponse, pas seulement les mots cherchés. Dire dans l'aide que les extraits viennent du web et ne sont pas vérifiés. |
| I10 | Faible | L'identifiant `cx` n'est pas encodé dans l'adresse Google, contrairement à la clé et à la question. Seul l'utilisateur remplit ce champ, et l'hôte reste fixe : il ne peut nuire qu'à lui-même. | `encodeURIComponent(this.CX)`. |
| I11 | Faible | Le Marked embarqué vient de jsDelivr (`Minified by jsDelivr using Terser v5.39.0`), un fichier généré à la demande : impossible à vérifier octet pour octet, contrairement aux quatre autres. Contrôle de repli : sortie identique à `marked@17.0.1/lib/marked.umd.js` sur 14 entrées, dont HTML brut et URL `javascript:`. | Embarquer `lib/marked.umd.js` du paquet npm. |
| I12 | Élevée | Pas de `.gitignore` dans le dépôt. Un `.env` portant une vraie clé Albert est à la racine du répertoire de travail, ignoré seulement par le `~/.config/git/ignore` du poste. Il n'a jamais été suivi et l'arbre suivi ne contient aucun secret, mais la protection ne suit pas le dépôt : ailleurs, un `git add .` publierait la clé. | Ajouter un `.gitignore`. |

## Audit externe

Boîte noire depuis un poste extérieur, le 2026-09-21, avec `curl` et `openssl`.

**Ce qui passe**

- Pages : HTTP redirigé en HTTPS (308), HSTS de deux ans, TLS 1.3 puis 1.2 en
  repli, certificat valide, `Referrer-Policy: strict-origin-when-cross-origin`.
- n8n : TLS 1.3 puis 1.2 en repli, certificat valide.
- Production conforme au dépôt : commit `c0332c8f`, CSP servie identique, sans
  domaine en plus.
- Webhooks : 401 sans clé sur les deux chemins. Traversée `../../../etc/passwd`
  (points envoyés tels quels) : 404. Adresse `/webhook-test/` : 404.
- CORS : une origine tierce reçoit `null`, l'origine Pages reçoit la sienne avec
  `Vary: Origin`.

**Constats**

| N° | Gravité | Constat | Recommandation |
|---|---|---|---|
| E1 | Moyenne | Reconduit du 2026-09-18. Pas de limite de débit, et le webhook reste appelable hors navigateur, où CORS ne s'applique pas. Revérifié : cinq requêtes sans clé toutes servies, corps de 2 Mo lu en entier avant le 401. Depuis I8, Albert n'est plus sollicité sans clé : l'abus se limite aux ressources de n8n. | Demander une limite de débit par adresse IP aux administrateurs. |
| E3 | Faible | Reconduit du 2026-09-18. Pages n'envoie pas `X-Content-Type-Options: nosniff`. Sans effet ici : tous les fichiers sont servis avec leur type exact. | À signaler à l'équipe de la Forge. |
| E5 | Info | Le HSTS de Pages n'a ni `includeSubDomains` ni `preload`. Pages n'accepte pas d'en-tête sur mesure. | À signaler avec E3. |
| E6 | Info | Recherche activée, le navigateur appelle le moteur en direct : celui-ci voit l'adresse IP de l'utilisateur et les mots de la requête. Pas un défaut, mais un périmètre nouveau depuis le dernier audit. | Le dire dans l'aide des réglages (I9) et dans la section RGPD. |

## Suivi des corrections

| N° | État au 2026-09-21 |
|---|---|
| I1, I4 | Corrigé le 2026-09-18 : Mermaid 11.17.2. Confirmé identique au paquet npm. |
| I2, I3 | Corrigé le 2026-09-18 : mode partagé par défaut, étendu depuis à la clé de recherche et aux conversations. |
| I5 | Accepté : `style-src 'unsafe-inline'` exigé par KaTeX et Mermaid, sans chargement externe possible. |
| I6 | Corrigé le 2026-09-18 : KaTeX 0.16.47. Confirmé identique, polices comprises. |
| I7 | Sans objet : `/v1/models` sert à lister les modèles disponibles, avec la même vérification de clé. |
| I8 | Corrigé le 2026-09-18 : nœud "Clé présente ?". Revérifié en ligne ce jour. |
| I9 | En partie le 2026-09-21 : les pages consultées sont listées en liens sous la réponse, avec les mots cherchés. Reste à dire dans l'aide que les extraits ne sont pas vérifiés. |
| I10 | Corrigé le 2026-09-21 : `encodeURIComponent(this.CX)`. |
| I11 | Ouvert : prendre le Marked du paquet npm. |
| I12 | Corrigé le 2026-09-21 : `.gitignore` au dépôt. Le `.env` reste, il sert aux outils du poste. |
| E1 | Ouvert : limite de débit à demander aux administrateurs. |
| E2 | Corrigé le 2026-09-18 : affichage bloqué dans un cadre. |
| E3, E5 | Ouverts : à signaler à l'équipe de la Forge. |
| E4 | Corrigé le 2026-09-18. Revérifié : le workflow publié est celui du dépôt. |
| E6 | Corrigé le 2026-09-21 : l'aide de la carte Recherche dit ce que voit le moteur, dans les quatre langues. |

## Pratiques de développement

- Aucune dépendance de construction : ni bundler, ni `npm install` pour publier.
- Cinq bibliothèques embarquées, versions et provenances dans
  `public/vendor/README.md`. Aucun appel à un CDN.
- Pas de code dynamique : aucun `eval`, aucun script en ligne (interdit par la CSP).
- Textes insérés par `textContent`. `data-t-html`, seul chemin par `innerHTML`,
  ne reçoit que du HTML écrit dans `public/js/langues/`.
- 35 tests `node --test`, tous au vert le 2026-09-21.
- Publication par la CI sur la branche par défaut seulement, avec le commit et
  sa date dans la page et une chaîne de version sur chaque ressource.

## Conformité RGPD

- Aucun compte, aucun cookie, aucune collecte par Albert Go.
- **Vers Albert (DINUM) :** questions, fichiers joints et clé, par le relais.
  Albert voit l'adresse IP de n8n, pas celle de l'utilisateur.
- **Vers le moteur, seulement si l'utilisateur active la recherche :** les mots
  de la requête, que le modèle tire de la question, plus l'adresse IP et le
  `User-Agent`, que toute requête web révèle. L'appel part du navigateur, sans
  relais. Le moteur choisi décide qui reçoit tout cela : Wikimedia Foundation
  (par défaut, sans clé), Mojeek Ltd, ou Google via `googleapis.com`, soumis au
  Cloud Act. C'est le seul tiers du parcours qui ne soit pas un service de
  l'État, d'où le réglage désactivé par défaut et Wikipédia en premier choix.
- Hébergement de l'instance n8n et conservation des requêtes par Albert : non vérifiés.
- Dans le navigateur : réglages sans limite de durée ; clés, questions et
  conversations jusqu'à la fermeture de l'onglet, sauf si le mode partagé est
  désactivé.

## Auto-évaluation ANSSI-PA-102

[Le guide](https://cyber.gouv.fr/publications/recommandations-de-securite-pour-un-systeme-dia-generative)
vise un système d'IA générative complet, de l'entraînement à l'exploitation.
Albert Go est une page cliente devant un système tiers : il n'entraîne,
n'héberge et ne sert aucun modèle. Seules figurent ici les recommandations sur
lesquelles il a prise, ou qu'il déplace vers quelqu'un d'autre.

| Reco | Statut | Ce qu'il en est |
|------|--------|-----------------|
| R3 Confiance dans les bibliothèques externes | Partielle | Sept bibliothèques embarquées, aucune dépendance de construction, aucun CDN. Six vérifiées octet pour octet, la septième par équivalence de sortie (I11). Vérification manuelle, à refaire à chaque mise à jour. |
| R5 Principes DevSecOps | Partielle | 35 tests à chaque étape, audit rejoué à chaque changement de périmètre. Pas d'analyse automatique avant fusion. |
| R7 Confidentialité dès la conception | Couverte | Rien ne quitte le navigateur en dehors d'Albert et, sur activation, du moteur. Mode partagé par défaut : tout le sensible s'efface à la fermeture de l'onglet. |
| R8 Besoin d'en connaître | Couverte | La clé appartient à l'utilisateur, le relais n'en garde qu'une empreinte du jour pour le compteur. Aucun compte, aucun identifiant. |
| R9 Pas d'usage automatisé pour des actions critiques | Sans objet | La réponse est du texte affiché. Aucune action n'en découle. |
| R10 Accès à privilèges maîtrisés | Couverte, côté utilisateur | Une clé par personne, vérifiée auprès d'Albert avant d'être enregistrée, jamais enregistrée si elle est refusée. Le projet n'administre aucun accès. |
| R13 Passerelle sécurisée si exposition Internet | Partielle | Le relais fait office de passerelle : TLS 1.3, CORS à deux origines, trois chemins dont le compteur public, 401 sans clé, rien de conservé. Il lui manque une limite de débit (E1). |
| R20 Intégrité des fichiers | Partielle | Page statique publiée par la CI, chaîne de version sur chaque ressource, bibliothèques comparées à leur source. Pas de signature ni d'empreinte publiée. |
| R22 Chaîne de déploiement sécurisée | Couverte | Publication automatique depuis la branche par défaut. Le commit publié est écrit dans la page : on vérifie de l'extérieur que la production est bien le dépôt. Refait ce jour. |
| R23 Audit de sécurité avant production | Non couverte | Aucune revue externe. Ce document en tient lieu, à ses limites près. |
| R24 Tests fonctionnels avant production | Couverte | 35 tests `node --test`, plus les tests en boîte noire ci-dessus. |
| R25 Filtrage des entrées et des sorties | Partielle | En sortie, le HTML est assaini, et les liens comme les adresses des sources passent par `Rendu.urlDangereuse`. En entrée, les fichiers joints sont bornés et convertis, mais les pages trouvées par la recherche ne sont pas filtrées (I9). |
| R26 Interactions maîtrisées | Couverte | Destinations fermées par la CSP et vérifiées en ligne. Aucune destination découverte à l'exécution, aucun CDN, aucune télémétrie. |
| R27 Limiter les actions automatiques sur entrées non maîtrisées | Partielle | Le modèle décide seul quand chercher, sur du texte venu du web ouvert (I9). Cette décision ne déclenche qu'un `GET` vers le moteur, et la réponse reste du texte. |
| R29 Journalisation | Partielle | Exécutions n8n non enregistrées, pas de télémétrie dans la page. Seul un compteur agrégé par jour (appels, empreintes de clé salées par le jour) est gardé 90 jours. Les journaux d'accès relèvent des hébergeurs. |
| R30 à R32 Contrôle du code généré par IA | Côté utilisateur | Albert Go affiche du texte, code compris, que l'utilisateur relit et exécute ailleurs s'il le veut. |
| R33 Durcissement des services grand public | Partielle | Page publique pour les agents de l'État : CSP fermée, pas de cadrage, pas de script en ligne, pas de stockage persistant par défaut. Les en-têtes manquants (E3, E5) ne sont pas à notre main. |
| R34 Pas d'IA générative publique sur données sensibles | Favorisée, avec une réserve | Le modèle est Albert, API souveraine hébergée en France. La recherche, si elle est activée, envoie en revanche les mots de la requête à un moteur tiers, Google compris (E6). |

Les recommandations R1, R2, R4, R6, R11, R12, R14 à R19, R21, R28 et R35 portent
sur l'entraînement, l'hébergement et l'exploitation d'un système d'IA. Albert Go
n'en assure aucun : elles relèvent d'Albert et des plateformes d'accueil.

Pour signaler une vulnérabilité, ouvrez un ticket confidentiel sur la Forge :
<https://forge.apps.education.fr/booklageolivier/albert-go/-/issues>
