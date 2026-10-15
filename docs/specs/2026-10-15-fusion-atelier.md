# Fusion de L'Atelier d'Albert dans Albert Go

Spec du 15 octobre 2026. Plans d'exécution : `docs/plans/`, un par MR.

## But

Albert Go sur un serveur, avec le kiosque de l'atelier ; chaque fonction
écrite une seule fois.

## Décisions

| Sujet | Décision |
|---|---|
| Dépôt | albert-go ; albert-atelier archivé après la première release |
| Nom | Albert Go partout (page, application Electron, releases) |
| Licence | GPL v3+ (le code de l'atelier entre tel quel) |
| Déploiement | Toujours un serveur : clé USB ou serveur d'établissement. Fin de Pages et du relais n8n |
| Clé API | Sur le serveur seulement (fichier `keys`, rotation) |
| Gardé de l'atelier | Kiosque, version clé USB Electron, niveau et matière avec les programmes du BO |
| Abandonné | Interface de l'atelier, modules de génération, outils Python, ligne de commande (sauf le lancement), Tauri (pour l'instant), `/stats` |

## Architecture

```
Navigateur (public/)   --/v1/...-->   Serveur Python   --clé + règles-->   API Albert
outils, historique,                   kiosque, régulation,
exports, Imprimerie                   niveau, matière, BO
```

Le navigateur garde toute la logique d'Albert Go, boucle d'outils
comprise.

```
albert-go/
  public/       interface d'Albert Go
  serveur/      serveur Python issu de l'atelier
  standalone/   version Electron (Python embarqué)
  programmes/   extraits du BO, programme_<matière>_<niveau>.txt
  tests/        tests Node et WebKit, tests pytest du serveur
```

## Serveur

Repris de l'atelier : `serveur.py` (lancement, adresses réseau, `--port`,
`--ssl`), configuration (`config`, `keys`, `config.exemple`, mode portable
`ALBERT_PORTABLE_DIR`), régulation par modèle (`throttling.py`,
`garde_fou.py`), quota journalier, proxy sortant d'établissement (407).

| Route | Rôle |
|---|---|
| `/`, fichiers de `public/` | Page d'Albert Go, variables du kiosque injectées |
| `GET /v1/models` | Relayé à Albert avec la clé |
| `POST /v1/chat/completions` | Relayé en flux SSE |
| `POST /v1/audio/transcriptions` | Relayé, 16 Mo au plus |
| `/kiosque`, `/api/kiosque-*`, `/api/qrcode` | Kiosque |

Le serveur ignore l'en-tête `Authorization` reçu et met sa clé, ou celle
de la session en kiosque. Corps limité à 10 Mo.

Consigne du serveur : la page envoie `niveau` et `matiere` dans le corps ;
le serveur les retire et place en tête un message `system` (consigne de la
matière, programme du niveau). Suivent les messages `system` d'Albert Go
(date, outils, sources d'Imprimerie). La page ne peut plus retirer la
consigne du serveur, mais peut en ajouter une après : garantie plus faible
que la MR !19 de l'atelier, qui interdisait tout message `system` venu de
la page.

Un 429 d'Albert est relayé tel quel, avec son `Retry-After` ; la
régulation du serveur répond aussi 429 quand le modèle est saturé.

Dossier de configuration : `~/.config/albert-go/` (les clés de
`~/.config/albert-atelier/` sont à recopier).

## Interface

- `Albert.BASE` vaut `/v1`.
- Écran de clé et en-tête `Authorization` retirés de `cle.js` et `albert.js`.
- Volet : choix Niveau et Matière, gardés dans le navigateur.
- Partager : adresses réseau du serveur (cartes physiques d'abord) et QR code.
- Service worker retiré (une page en cache masquerait le renvoi vers
  `/kiosque`) ; le manifeste reste (icône iPad).
- À propos : crédits des deux projets et des élèves, licence.
- Surveillance du relais n8n retirée (sonde `/stats`, origines
  autorisées) : un serveur arrêté refuse la connexion tout de suite.

## Kiosque

Lancé par `--kiosque` ou `kiosque=oui` dans `config` ; sinon, Albert Go
seul. Discussion et Imprimerie ne changent pas.

- Page `/kiosque` de l'atelier (connexion prof et élève, code à 4
  chiffres), au thème d'Albert Go : sans choix "Mode de travail", titre
  et phrase d'accueil réécrits pour Albert Go (remarque du 15 octobre sur
  la page de l'atelier v3.1.0).
- Cookies signés, rôle lié à la session, expiration, déconnexion : code
  de l'atelier inchangé.
- Mode unique : les réglages du prof, injectés dans la page, sont les
  valeurs de départ des élèves.
- Prof : bandeau avec le code et Partager ; Déconnexion dans le volet.
- Élèves : mode partagé d'Albert Go forcé (conversations, questions et
  bibliothèque en `sessionStorage`).
- Garde d'expiration : sondage de `/api/kiosque-status` toutes les 20 s,
  un 401 renvoie vers `/kiosque`.
- Textes du kiosque ajoutés aux fichiers de langue d'Albert Go (FR, EN,
  ES, DE).

## Livraison

| MR | Contenu | Tests |
|---|---|---|
| 1. Serveur relais | `serveur/`, relais `/v1`, `BASE` à `/v1`, écran de clé retiré, passage en GPL v3+ | pytest : clé ajoutée, flux relayé, 429 relayé, taille bornée |
| 2. Niveau et matière | Choix du volet, consigne du serveur, `programmes/` | pytest : consigne en tête, champs retirés |
| 3. Kiosque | Page `/kiosque`, sessions, bandeau, mode partagé forcé, réglages du prof, garde, Partager, service worker retiré | Tests kiosque de l'atelier, essai dans le navigateur |
| 4. Clé USB et établissement | Electron, CI des paquets (AppImage, archive Windows), job release, autostart, `config.exemple` ; Pages ne publie plus qu'une page de renvoi vers les releases | Build des paquets en CI |

CI à chaque MR : `node --test`, WebKit, pytest. Release et archivage
sur demande, après la MR 4.

## Hors périmètre

- Reprise des données : les conversations d'Albert Go en ligne restent sur
  l'adresse de la forge ; l'historique de l'atelier v3.1.0 a un autre
  format.

## Points à vérifier en MR 1

- Flux SSE relayé sans mise en tampon par `ThreadingHTTPServer`.
- Multipart de `/v1/audio/transcriptions` relayé tel quel.
- Régulation : chaque appel de la boucle d'outils du navigateur compte
  dans la fenêtre du modèle.
