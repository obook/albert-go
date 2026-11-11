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

import httpx

from serveur import config, proxy

COOKIE = "kiosque-session"
DUREES = {"1h": 3600, "2h": 7200, "3h": 10800, "journee": 28800}
ROLES = {"enseignant", "eleve"}
INTERRUPTEURS = ("recherche", "calcul", "tirage", "calendrier", "compteur", "ecritureSoignee", "styleDirect", "sansRedite")
# Un code faux coûte une seconde, essais en file : les 10 000 codes prennent des heures.
PAUSE_CODE_FAUX = 1.0

_session = None
_verrou = threading.Lock()
_verrou_essais = threading.Lock()
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


def _code_juste(token, code):
    if not (token.isascii() and code.isascii()):
        return False
    with _verrou:
        session = _courante()
        if session is None:
            return False
        return hmac.compare_digest(session["token"], token) and hmac.compare_digest(session["code"], code)


def verifier_code(token, code):
    """Jeton et code de la session, comparés en temps constant ; un code faux est ralenti."""
    juste = _code_juste(token, code)
    if not juste:
        with _verrou_essais:
            time.sleep(PAUSE_CODE_FAUX)
    return juste


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
    # Pas de SimpleCookie : un cookie mal formé d'une autre appli sur localhost lui fait perdre les suivants.
    for morceau in (handler.headers.get("Cookie") or "").split(";"):
        nom, egal, valeur = morceau.strip().partition("=")
        if egal and nom == COOKIE:
            return valeur
    return None


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
    for nom in INTERRUPTEURS:
        if isinstance(corps.get(nom), bool):
            propres[nom] = corps[nom]
    moteurs = corps.get("fournisseurs")
    if isinstance(moteurs, list):
        propres["fournisseurs"] = [m for m in moteurs if isinstance(m, str) and re.fullmatch(r"[a-z-]{1,30}", m)][:3]
    # Nom de l'application : 12 caractères dans les Réglages, vide pour "Albert Go".
    nom = corps.get("nom")
    if isinstance(nom, str) and nom.isprintable():
        propres["nom"] = nom.strip()[:12]
    return propres


def cle_acceptee(cle):
    """La clé ouvre-t-elle la liste des modèles d'Albert ? Proxy refusé : un essai sans, comme le relais."""
    # Un caractère invisible collé avec la clé ne passerait pas dans l'en-tête HTTP.
    if not cle.isascii():
        return False
    api_base = config.load_config()["api_base"].rstrip("/")
    proxy.tester_acces_direct(api_base)
    for essai in (1, 2):
        try:
            with proxy.creer_client_http(httpx.Timeout(10.0)) as http:
                reponse = http.get(api_base + "/v1/models", headers={"Authorization": f"Bearer {cle}"})
        except httpx.ProxyError:
            if essai == 1 and proxy.basculer_sans_proxy():
                continue
            return False
        except httpx.HTTPError:
            return False
        if reponse.status_code == 407 and essai == 1 and proxy.basculer_sans_proxy():
            continue
        return reponse.status_code == 200
    return False
