# Relais n8n

`albert-proxy.json` relaie vers Albert les appels de la page (`chat/completions`, `models`, `audio/transcriptions`), qu'Albert refuse en direct faute de CORS. Il compte aussi les appels pour la ligne "Charge n8n" de "À propos", servie sur `albert-go/stats`.

## Installation

1. Créer la Data table `albert-go-appels` dans le même projet que le workflow, avec deux colonnes de type string : `jour` et `empreinte`.
2. Importer `albert-proxy.json`, puis le publier.

## Compteur

Chaque appel accepté par Albert ajoute une ligne : le jour et une empreinte de la clé et du jour, jamais la clé. `/stats` en tire, par jour, le nombre d'appels et de clés distinctes. Les lignes de plus de 90 jours sont supprimées à chaque lecture.

Le compteur était auparavant gardé dans `$getWorkflowStaticData`. Depuis n8n 2.41.6, installé sur l'instance interministérielle le 2 octobre 2026, ces données repartent de zéro à chaque exécution en mode queue ([issue n8n #39653](https://github.com/n8n-io/n8n/issues/39653)). L'historique a été perdu ce jour-là.

Une ligne par appel : au-delà de 1000 lignes, la lecture se fait par pages et peut échouer si un appel arrive pendant ce temps. Il faudra alors passer à une ligne par jour et par empreinte.
