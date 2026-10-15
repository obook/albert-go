"""Configuration du serveur : URL d'Albert, clé API, kiosque, port, HTTPS.

Fichier .env, lignes NOM=valeur (ALBERT_API_URL, ALBERT_API_KEY, ALBERT_KIOSQUE,
ALBERT_PORT, ALBERT_HTTPS ; ALBERT_MISE_A_JOUR est lu par deploiement/demarrage.sh),
# pour commenter ; modèle : .env-exemple. Dossier ALBERT_PORTABLE_DIR (clé USB),
sinon la racine du dépôt.

Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
Auteurs : O. Booklage ; Romain P., Luce P.B., Théossian S.D. (L'Atelier d'Albert)
Licence : GPL-3.0-or-later
"""

import os


DEPOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _config_dir():
    """Dossier de configuration et son mode, affiché au lancement."""
    portable = os.environ.get("ALBERT_PORTABLE_DIR", "").strip()
    if portable:
        return portable, "portable"
    return DEPOT, "dépôt"


CONFIG_DIR, MODE = _config_dir()
CONFIG_FILE = os.path.join(CONFIG_DIR, ".env")
API_BASE_DEFAUT = "https://albert.api.etalab.gouv.fr"
PORT_DEFAUT = 8913


def _lignes(chemin):
    """Lignes utiles d'un fichier (ni vides ni commentées) ; [] s'il manque."""
    if not os.path.exists(chemin):
        return []
    try:
        with open(chemin, encoding="utf-8") as f:
            texte = f.read()
    except UnicodeDecodeError:
        with open(chemin, encoding="latin-1") as f:
            texte = f.read()
    return [l.strip() for l in texte.splitlines() if l.strip() and not l.strip().startswith("#")]


def load_config():
    """URL d'Albert, mode kiosque, clé API, port et HTTPS lus dans le .env.

    Les lignes des autres outils (graft) sont ignorées. Le fichier est relu à
    chaque appel : une clé corrigée sert sans redémarrer.
    """
    valeurs = {}
    for ligne in _lignes(CONFIG_FILE):
        if "=" in ligne:
            nom, _, valeur = ligne.partition("=")
            valeur = valeur.strip()
            if len(valeur) >= 2 and valeur[0] == valeur[-1] and valeur[0] in "\"'":
                valeur = valeur[1:-1]
            valeurs[nom.strip()] = valeur
    # Avec ou sans /v1, comme ALBERT_API_URL de llm-proxy : le relais l'ajoute.
    api_base = (valeurs.get("ALBERT_API_URL") or API_BASE_DEFAUT).rstrip("/").removesuffix("/v1")
    return {
        "api_base": api_base,
        "kiosque": valeurs.get("ALBERT_KIOSQUE", "non") == "oui",
        "api_key": valeurs.get("ALBERT_API_KEY", ""),
        "port": int(valeurs["ALBERT_PORT"]) if valeurs.get("ALBERT_PORT", "").isdigit() else PORT_DEFAUT,
        "https": valeurs.get("ALBERT_HTTPS", "non") == "oui",
    }


def chemin_config():
    """Fichier de config utilisé, avec ~ pour le dossier personnel."""
    home = os.path.expanduser("~")
    chemin = str(CONFIG_FILE)
    return "~" + chemin[len(home):] if chemin.startswith(home + os.sep) else chemin


def config_affichee():
    """Ligne de lancement : fichier de config utilisé."""
    chemin = chemin_config()
    absent = "" if os.path.exists(CONFIG_FILE) else " (absent : valeurs par défaut)"
    return f"Configuration ({MODE}) : {chemin}{absent}"
