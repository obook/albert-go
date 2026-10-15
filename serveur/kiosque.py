"""Mode kiosque : l'enseignant ouvre une session de classe avec sa clé API.

Les élèves rejoignent la session par un lien (QR code) et un code à
4 chiffres, sans voir la clé. Une seule session à la fois. Le rôle
(enseignant ou élève) est signé dans le cookie : un élève ne peut pas
se déclarer enseignant.

Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
Repris de L'Atelier d'Albert (Romain P., Luce P.B., Théossian S.D., O. Booklage)
Licence : GPL-3.0-or-later
"""

import hashlib
import hmac
import math
import re
import secrets
import threading
import time
from http.cookies import SimpleCookie

import httpx

from serveur import config, proxy

COOKIE = "kiosque-session"
DUREES = {"1h": 3600, "2h": 7200, "3h": 10800, "journee": 28800}
ROLES = {"enseignant", "eleve"}
OUTILS = ("recherche", "calcul", "tirage", "calendrier", "compteur")

_session = None
_verrou = threading.Lock()
# Secret tiré au lancement : les cookies ne survivent pas à un redémarrage.
_secret = secrets.token_bytes(32)


def _signature(token, role):
    return hmac.new(_secret, f"{token}|{role}".encode(), hashlib.sha256).hexdigest()


def _courante():
    """Session en cours, ou None ; une session expirée est effacée. Sous verrou."""
    global _session
    if _session is not None and time.time() > _session["expiration"]:
        _session = None
    return _session


def creer_session(cle_api, duree_code):
    """Ouvre une session (remplace la précédente) ; renvoie (jeton, code à 4 chiffres)."""
    global _session
    with _verrou:
        _session = {
            "token": secrets.token_urlsafe(24),
            "code": f"{secrets.randbelow(10000):04d}",
            "cle_api": cle_api,
            "expiration": time.time() + DUREES.get(duree_code, DUREES["2h"]),
            "reglages": None,
        }
        return _session["token"], _session["code"]


def terminer_session():
    global _session
    with _verrou:
        _session = None


def session_active():
    with _verrou:
        return _courante() is not None


def temps_restant():
    with _verrou:
        session = _courante()
        return max(0, int(session["expiration"] - time.time())) if session else 0


def cle_api():
    with _verrou:
        session = _courante()
        return session["cle_api"] if session else None


def infos_enseignant():
    """Jeton et code de la session : réservés à la page de l'enseignant."""
    with _verrou:
        session = _courante()
        return {"token": session["token"], "code": session["code"]} if session else None


def verifier_code(token, code):
    """Jeton et code de la session, comparés en temps constant."""
    if not (token.isascii() and code.isascii()):
        return False
    with _verrou:
        session = _courante()
        if session is None:
            return False
        return hmac.compare_digest(session["token"], token) and hmac.compare_digest(session["code"], code)


def cookie(role):
    """Valeur signée "<jeton>.<rôle>.<signature>" ; rôle inconnu : élève."""
    role = role if role in ROLES else "eleve"
    with _verrou:
        session = _courante()
        if session is None:
            return None
        token = session["token"]
    return f"{token}.{role}.{_signature(token, role)}"


def role_du_cookie(valeur):
    """Rôle signé dans le cookie, ou None : signature fausse, autre session, session expirée."""
    morceaux = (valeur or "").split(".")
    if len(morceaux) != 3:
        return None
    token, role, signature = morceaux
    # isascii : compare_digest lève TypeError sur une chaîne non ASCII.
    if role not in ROLES or not (token.isascii() and signature.isascii()):
        return None
    if not hmac.compare_digest(signature, _signature(token, role)):
        return None
    with _verrou:
        session = _courante()
        if session is None or not hmac.compare_digest(session["token"], token):
            return None
    return role


def valeur_cookie(handler):
    """Valeur du cookie de session envoyé par le navigateur, ou None."""
    cookies = SimpleCookie()
    try:
        cookies.load(handler.headers.get("Cookie", ""))
    except Exception:
        return None
    morceau = cookies.get(COOKIE)
    return morceau.value if morceau else None


def role_de_la_requete(handler):
    return role_du_cookie(valeur_cookie(handler))


def enregistrer_reglages(reglages):
    """Range les réglages du prof ; l'heure d'expiration sert d'identifiant de session."""
    with _verrou:
        session = _courante()
        if session is None:
            return False
        session["reglages"] = dict(reglages, session=int(session["expiration"]))
        return True


def reglages():
    with _verrou:
        session = _courante()
        return session["reglages"] if session else None


def _nombre(valeur):
    """Nombre fini, ni booléen ni texte ; None sinon."""
    if isinstance(valeur, bool) or not isinstance(valeur, (int, float)) or not math.isfinite(valeur):
        return None
    return valeur


def valider_reglages(corps):
    """Garde les réglages connus, avec des valeurs sûres : tout le reste est ignoré."""
    propres = {}
    modele = corps.get("modele")
    if isinstance(modele, str) and re.fullmatch(r"[\w.:/-]{1,100}", modele):
        propres["modele"] = modele
    bornes = {"temperature": (0, 2), "topK": (1, 50), "echanges": (0, 11)}
    for nom, (minimum, maximum) in bornes.items():
        valeur = _nombre(corps.get(nom))
        if valeur is not None:
            valeur = min(maximum, max(minimum, valeur))
            propres[nom] = valeur if nom == "temperature" else int(valeur)
    for nom in OUTILS:
        if isinstance(corps.get(nom), bool):
            propres[nom] = corps[nom]
    moteurs = corps.get("fournisseurs")
    if isinstance(moteurs, list):
        propres["fournisseurs"] = [m for m in moteurs if isinstance(m, str) and re.fullmatch(r"[a-z-]{1,30}", m)][:3]
    return propres


def cle_acceptee(cle):
    """La clé ouvre-t-elle la liste des modèles d'Albert ?"""
    api_base = config.load_config()["api_base"].rstrip("/")
    try:
        with proxy.creer_client_http(httpx.Timeout(10.0)) as http:
            reponse = http.get(api_base + "/v1/models", headers={"Authorization": f"Bearer {cle}"})
    except httpx.HTTPError:
        return False
    return reponse.status_code == 200
