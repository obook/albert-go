# Relais n8n

`albert-proxy.json` relaie vers Albert les appels de la page (`chat/completions`, `models`, `audio/transcriptions`, `embeddings`), qu'Albert refuse en direct faute de CORS. Il compte aussi les appels pour la ligne "Charge n8n" de "À propos", servie sur `albert-go/stats`. Les appels à `embeddings` ne sont pas comptés : la recherche dans une grosse source en fait plusieurs par question.

Le code et le corps de la réponse d'Albert repartent tels quels, y compris une erreur. Les nœuds HTTP lisent la réponse en `autodetect` : en `json`, la page HTML d'une panne d'Albert (502 de nginx) faisait échouer le workflow, et la page recevait un 500 "Workflow execution failed" au lieu du 502. Une coupure réseau ou un délai dépassé (120 s) donnent toujours ce 500.

## Installation

1. Créer la Data table `albert-go-compteur` dans le même projet que le workflow, avec deux colonnes : `jour` (string) et `appels` (number).
2. Importer `albert-proxy.json`, puis le publier.

## Compteur

Une ligne par jour : `jour` et `appels`, incrémenté à chaque appel accepté par Albert. Rien sur la clé ; n8n ajoute seulement à chaque ligne l'heure de sa création et de sa dernière modification. `/stats` renvoie ces lignes et supprime celles de plus de 90 jours : la table ne dépasse pas 90 lignes. Deux appels simultanés peuvent n'en compter qu'un.

Le compteur était auparavant gardé dans `$getWorkflowStaticData`. Depuis n8n 2.41.6, installé sur l'instance de l'incubateur de l'Éducation nationale le 2 octobre 2026, ces données repartent de zéro à chaque exécution en mode queue ([issue n8n #39653](https://github.com/n8n-io/n8n/issues/39653)). L'historique a été perdu ce jour-là.
