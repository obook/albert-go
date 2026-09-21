# Notes diverses

## n8n sur SSPCloud (message épinglé du salon Tchap n8n)

Autre possibilité d'hébergement que la plateforme n8n interministérielle utilisée par Albert Go : une instance n8n personnelle sur SSPCloud. Texte publié sur le salon, adapté : tirets longs et points de suspension remplacés par de l'ASCII, noms d'outils d'IA remplacés par un terme générique.

> Bonjour,
>
> Un service vient d'être mis à disposition pour déployer n8n (outil d'automatisation no-code, équivalent open source de Zapier ou Make) accompagné d'un serveur MCP qui permet de piloter cette instance depuis un assistant IA compatible MCP. Le tout s'installe dans son espace SSPCloud personnel en deux minutes.
>
> ⚠️ **Statut : beta.** Le service fonctionne sur les deux espaces de test, mais aucun retour externe n'a encore été recueilli. Toute personne volontaire pour essayer sera la bienvenue : remontées de bugs, points bloquants, lacunes de documentation, tout est utile. Aucun risque pour l'espace SSPCloud : l'installation reste isolée et peut être supprimée à tout moment.
>
> **Pré-requis :** un compte SSPCloud actif et un service Jupyter SSPCloud déjà lancé.
>
> 1. Lancez un sevice Jupyter-python
> 2. Définissez le role "Edit" puis lancer, suivez les indications
> 3. Ouvrez un terminal
>
> **Installation :** dans le terminal du Jupyter, coller la commande suivante :
>
> ```bash
> curl -sL https://nic01asfr.github.io/n8n-onyxia/install.sh | bash
> ```
>
> L'installation est automatique. À la fin, un récapitulatif affiche les adresses et identifiants prêts à être utilisés.
>
> **Résultat obtenu**
>
> - Une interface n8n accessible publiquement sur une URL personnelle SSPCloud, capable de recevoir des webhooks externes (GitHub, formulaires, services tiers...) et d'appeler n'importe quelle API (Gmail, Slack, OpenAI, etc.)
> - Un endpoint MCP également public : permet à un assistant IA compatible MCP de créer, lire, modifier et déboguer les workflows n8n en langage naturel
>
> **Documentation :** https://github.com/nic01asFr/n8n-onyxia
>
> **À sauvegarder impérativement :** la clé de chiffrement affichée par le script. Sa perte rend irrécupérables tous les identifiants stockés dans n8n (Gmail, Slack, GitHub, etc.).
>
> **Persistance :** l'instance tourne en continu dans l'espace SSPCloud, indépendamment du Jupyter ayant servi à l'installation. Les webhooks reçus et les tâches planifiées s'exécutent même session fermée.
>
> **Sécurité et données personnelles**
>
> Le niveau de sécurité est équivalent à toute installation auto-hébergée de n8n : mêmes mécanismes de chiffrement des identifiants, même authentification, même protocole HTTPS. Plusieurs aspects sont même plus rassurants que dans un déploiement self-hosted classique :
>
> - Souveraineté : les données restent sur l'infrastructure publique française (INSEE/Datalab), sans intermédiaire commercial.
> - Isolation : chaque instance vit dans un espace utilisateur isolé, jamais mutualisé.
> - TLS automatique via certificats Let's Encrypt : pas de configuration à faire.
> - Aucune télémétrie : n8n est lancé sans envoyer de statistiques d'usage à l'éditeur, là où l'installation par défaut le fait.
> - Aucun accès tiers : les jetons et mots de passe générés par l'installation restent dans l'espace utilisateur, l'auteur de l'outil n'y a pas accès.

## Sources de recherche ouvertes (note d'un autre agent)

Piste pour élargir la recherche au-delà de Wikipédia. Note reçue telle quelle,
non vérifiée, et déjà contredite en partie par les essais consignés dans le
README : Marginalia et SearXNG public ont été testés le 20 septembre 2026 et ne
renvoient aucun en-tête CORS, là où la note les donne pour utilisables ou "à
vérifier". Tout retester avant d'ouvrir le chantier.

Jamais essayées ici, et c'est là que la note est utile : Wikidata, OpenAlex,
Crossref, HAL, Openverse, Internet Archive, Open Library, Nominatim,
data.gouv.fr, Recherche d'entreprises. Toutes sans clé.

### Règles d'usage

- Toujours envoyer un `User-Agent` ou un paramètre `mailto` identifiant l'application quand la source le demande (OpenAlex, Crossref, Nominatim).
- Respecter les limites de débit indiquées ; en cas de HTTP 429 ou 503, attendre puis réessayer une seule fois.
- Ne jamais placer de clé privée dans du code exécuté côté client.
- Si une source sans CORS est nécessaire depuis un navigateur, passer par un proxy côté serveur qui ajoute `Access-Control-Allow-Origin`.
- Citer la source et respecter sa licence dans les résultats restitués (Marginalia : CC-BY-NC-SA 4.0).
- Le statut CORS indiqué "à vérifier" doit être testé avant intégration (voir la dernière section).

### Tableau récapitulatif

| Source | Contenu | Clé | CORS navigateur |
|---|---|---|---|
| MediaWiki (Wikipédia) | Encyclopédie | Non | Oui, avec `origin=*` |
| Wikidata | Entités structurées | Non | Oui, avec `origin=*` |
| Marginalia | Web indépendant | `public` (partagée) | À vérifier |
| SearXNG auto-hébergé | Méta-moteur web | Non | Oui si configuré |
| DuckDuckGo Instant Answer | Réponses instantanées | Non | Non, JSONP via `callback` |
| OpenAlex | Publications scientifiques | Non | Oui |
| Crossref | Métadonnées DOI | Non | Oui |
| HAL | Archive ouverte française | Non | Oui |
| Openverse | Images et sons CC | Non | Oui |
| Internet Archive | Livres, médias, archives | Non | Oui |
| Open Library | Livres | Non | Oui |
| Nominatim (OSM) | Géocodage | Non | Oui |
| data.gouv.fr | Jeux de données publics | Non | Oui |
| Recherche d'entreprises | Entreprises françaises | Non | Oui |

### Recherche web généraliste

#### Marginalia

```
GET https://api.marginalia.nu/public/search/{requete}?count=10
```

Réponse JSON : `results[]` avec `url`, `title`, `description`. La clé `public` a une limite de débit partagée entre tous les utilisateurs (HTTP 503 quand elle est atteinte). Une clé dédiée s'obtient par courriel auprès de l'auteur. Index orienté "petit web" non commercial.

#### SearXNG auto-hébergé

```
GET https://{instance}/search?q={requete}&format=json
```

Les instances publiques désactivent presque toutes le format JSON. Sur une instance personnelle, ajouter `json` dans `search.formats` de `settings.yml` et l'en-tête CORS dans le reverse proxy.

#### DuckDuckGo Instant Answer

```
GET https://api.duckduckgo.com/?q={requete}&format=json&no_html=1
```

Ne renvoie pas de liste de résultats web, seulement `AbstractText`, `AbstractURL` et `RelatedTopics`. À réserver aux définitions et résumés.

### Sources encyclopédiques

```
GET https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch={requete}&format=json&origin=*
GET https://www.wikidata.org/w/api.php?action=wbsearchentities&search={requete}&language=fr&format=json&origin=*
```

### Sources scientifiques et documentaires

```
GET https://api.openalex.org/works?search={requete}&per-page=10&mailto={courriel}
GET https://api.crossref.org/works?query={requete}&rows=10&mailto={courriel}
GET https://api.archives-ouvertes.fr/search/?q={requete}&wt=json&fl=title_s,uri_s,authFullName_s&rows=10
GET https://archive.org/advancedsearch.php?q={requete}&fl[]=identifier&fl[]=title&rows=10&output=json
GET https://openlibrary.org/search.json?q={requete}&limit=10
GET https://api.openverse.org/v1/images/?q={requete}&license_type=commercial
```

Openverse : filtrer par licence selon l'usage prévu ; le débit anonyme est limité.

### Sources géographiques et administratives

```
GET https://nominatim.openstreetmap.org/search?q={requete}&format=json&limit=5
GET https://www.data.gouv.fr/api/1/datasets/?q={requete}&page_size=10
GET https://recherche-entreprises.api.gouv.fr/search?q={requete}&per_page=10
```

Nominatim : une requête par seconde au maximum, `User-Agent` explicite obligatoire, pas d'usage intensif sur l'instance publique.

### Choix de la source

- Question factuelle ou définition : Wikipédia, puis Wikidata.
- Recherche web ouverte : SearXNG si une instance est disponible, sinon Marginalia.
- Référence scientifique : OpenAlex ; Crossref pour résoudre un DOI ; HAL pour la recherche française en éducation.
- Illustration libre de droits : Openverse.
- Lieu ou adresse : Nominatim.
- Données publiques ou entreprise française : data.gouv.fr, Recherche d'entreprises.

### Format de sortie normalisé

Quelle que soit la source, restituer chaque résultat sous cette forme :

```json
{
  "source": "openalex",
  "titre": "...",
  "url": "...",
  "extrait": "...",
  "licence": "..."
}
```

### Vérification du CORS

```bash
curl -s -I -H "Origin: https://exemple.org" "{url_de_requete}" | grep -i access-control
```

Une ligne `access-control-allow-origin: *` (ou reprenant l'origine) confirme l'appel possible depuis un navigateur. Aucune ligne : passer par un proxy.
