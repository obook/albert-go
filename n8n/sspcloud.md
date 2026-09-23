# n8n sur SSPCloud (message épinglé du salon Tchap n8n)

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

## Pistes pour Albert Go

1. Tester le relais : importer `albert-proxy.json` et le modifier sans toucher à celui en service.
2. Relayer un moteur de recherche web sans CORS (Marginalia, SearXNG).
3. Relais de secours si la plateforme interministérielle tombe.

Pas pour le relais en service : beta, compte personnel.

### Point 2

Un webhook appelle le moteur côté serveur et renvoie les résultats avec les en-têtes CORS, comme `albert-proxy.json` pour Albert. Dans la page, un moteur de plus dans `Recherche.MOTEURS`.

- Pour : la clé du moteur reste dans n8n, les utilisateurs n'en fournissent pas.
- Contre : l'admin n8n voit les mots cherchés ; quota partagé entre tous.

SSPCloud pour prototyper, l'instance interministérielle en service.
