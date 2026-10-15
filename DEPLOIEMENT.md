# Déploiement

Albert Go sur un poste de l'établissement (Raspberry Pi, Ubuntu).

## Prérequis

```bash
sudo apt install git python3-venv
```

Le poste doit joindre `albert.api.etalab.gouv.fr` et `forge.apps.education.fr`.

## Installation

```bash
cd ~
git clone https://forge.apps.education.fr/booklageolivier/albert-go.git
cd albert-go
cp .env-exemple .env
nano .env
```

| Réglage du `.env` | Défaut | Effet |
|---|---|---|
| `ALBERT_API_KEY` | vide | Clé API du serveur ; inutile en kiosque |
| `ALBERT_KIOSQUE` | `non` | `oui` : l'enseignant ouvre une session de classe sur `/kiosque` avec sa clé |
| `ALBERT_PORT` | `8913` | Port du serveur |
| `ALBERT_HTTPS` | `non` | `oui` : certificat auto-signé, avertissement du navigateur à la première visite |
| `ALBERT_MISE_A_JOUR` | `oui` | `git pull` à chaque démarrage ; `non` fige la version |

Ne modifier aucun autre fichier du dépôt.

## Essai

```bash
./local.sh --no-browser
```

Le terminal affiche les adresses à ouvrir depuis un autre appareil (`Réseau : http://...:8913`). Ctrl+C arrête le serveur.

## Démarrage automatique

Dans `crontab -e` (remplacer `<utilisateur>`) :

```
@reboot /home/<utilisateur>/albert-go/deploiement/demarrage.sh
```

`demarrage.sh` attend le réseau (60 s au plus), fait le `git pull`, met à jour les dépendances Python et lance le serveur. Sans réseau ou si le pull échoue, le serveur démarre avec la version en place.

## Mise à jour et redémarrage

```bash
~/albert-go/deploiement/redemarrage.sh
```

Arrête le serveur de ce dossier et relance `demarrage.sh` en arrière-plan. À lancer aussi après une modification du `.env`.

## Journaux

`albert-go.log` couvre le dernier démarrage, `albert-go.log.1` le précédent.

```bash
tail -f ~/albert-go/albert-go.log
```

## WiFi sans ouverture de session

NetworkManager range le mot de passe WiFi dans le trousseau de l'utilisateur, ouvert seulement à la connexion : au boot, pas de réseau.

1. Dans les réglages WiFi, cocher "Disponible pour tous les utilisateurs".
2. Ranger le mot de passe dans le fichier système :

```bash
sudo nmcli connection modify "Nom_du_WiFi" wifi-sec.psk-flags 0 wifi-sec.psk "MOT_DE_PASSE"
```

`/etc/NetworkManager/system-connections/Nom_du_WiFi.nmconnection` doit contenir `psk-flags=0`.

## Dépannage

| Symptôme | Cause et remède |
|---|---|
| Rien au démarrage | `crontab -l` doit montrer la ligne `@reboot` ; lancer `./deploiement/demarrage.sh` à la main et lire le journal |
| `le port 8913 est déjà utilisé` dans le journal | Un autre serveur occupe le port : `redemarrage.sh`, ou changer `ALBERT_PORT` |
| `git pull a échoué` dans le journal | Fichier modifié sur place : `git status`, puis `git checkout -- <fichier>` |
| `Pas de réseau après 60 s` | Voir "WiFi sans ouverture de session" |
