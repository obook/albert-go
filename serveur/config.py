"""Configuration du serveur : URL d'Albert, modèle, kiosque, clé API.

Fichier config, lignes nom=valeur (api_base, api_key, kiosque), # pour
commenter. Dossier ALBERT_PORTABLE_DIR (clé USB), sinon la racine du dépôt si
elle a un fichier config (modèle : config.exemple), sinon ~/.config/albert-go/.

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
    if os.path.exists(os.path.join(DEPOT, "config")):
        return DEPOT, "dépôt"
    return os.path.join(os.path.expanduser("~"), ".config", "albert-go"), "standard"


CONFIG_DIR, MODE = _config_dir()
CONFIG_FILE = os.path.join(CONFIG_DIR, "config")
API_BASE_DEFAUT = "https://albert.api.etalab.gouv.fr"


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
    """URL d'Albert, mode kiosque et clé API lus dans le fichier config.

    Le fichier est relu à chaque appel : une clé corrigée sert sans redémarrer.
    """
    valeurs = {}
    for ligne in _lignes(CONFIG_FILE):
        if "=" in ligne:
            nom, _, valeur = ligne.partition("=")
            valeurs[nom.strip()] = valeur.strip()
    return {
        "api_base": valeurs.get("api_base", API_BASE_DEFAUT),
        "kiosque": valeurs.get("kiosque", "non") == "oui",
        "api_key": valeurs.get("api_key", ""),
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
