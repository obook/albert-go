"""Configuration du serveur : URL d'Albert, modèle, kiosque, clés API.

Dossier ~/.config/albert-go/, ou ALBERT_PORTABLE_DIR (clé USB) :
    config : lignes nom=valeur (api_base, model, kiosque), # pour commenter ;
    keys   : une clé API par ligne, utilisées à tour de rôle.

Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
Auteurs : O. Booklage ; Romain P., Luce P.B., Théossian S.D. (L'Atelier d'Albert)
Licence : GPL-3.0-or-later
"""

import os
import threading


def _config_dir():
    portable = os.environ.get("ALBERT_PORTABLE_DIR", "").strip()
    if portable:
        return portable
    return os.path.join(os.path.expanduser("~"), ".config", "albert-go")


CONFIG_DIR = _config_dir()
CONFIG_FILE = os.path.join(CONFIG_DIR, "config")
KEYS_FILE = os.path.join(CONFIG_DIR, "keys")
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
    """URL d'Albert, modèle par défaut et mode kiosque lus dans le fichier config."""
    valeurs = {}
    for ligne in _lignes(CONFIG_FILE):
        if "=" in ligne:
            nom, _, valeur = ligne.partition("=")
            valeurs[nom.strip()] = valeur.strip()
    return {
        "api_base": valeurs.get("api_base", API_BASE_DEFAUT),
        "model": valeurs.get("model", ""),
        "kiosque": valeurs.get("kiosque", "non") == "oui",
    }


def load_web_keys():
    """Clés API du fichier keys, dans l'ordre."""
    return _lignes(KEYS_FILE)


_rang = 0
_verrou = threading.Lock()


def prochaine_cle():
    """Clé suivante, à tour de rôle ; None si le fichier keys est vide.

    Le fichier est relu à chaque appel : une clé corrigée sert sans redémarrer.
    """
    global _rang
    cles = load_web_keys()
    if not cles:
        return None
    with _verrou:
        _rang += 1
        return cles[(_rang - 1) % len(cles)]


def reinitialiser_pour_tests():
    """Repart de la première clé (réservé aux tests)."""
    global _rang
    with _verrou:
        _rang = 0


def config_affichee():
    """Ligne de lancement : fichier de config utilisé, avec ~ pour le dossier personnel."""
    home = os.path.expanduser("~")
    chemin = str(CONFIG_FILE)
    if chemin.startswith(home + os.sep):
        chemin = "~" + chemin[len(home):]
    mode = "portable" if os.environ.get("ALBERT_PORTABLE_DIR", "").strip() else "standard"
    absent = "" if os.path.exists(CONFIG_FILE) else " (absent : valeurs par défaut)"
    return f"Configuration ({mode}) : {chemin}{absent}"
