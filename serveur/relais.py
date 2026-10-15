"""Relais vers l'API Albert : la clé du serveur remplace celle de la page.

La réponse d'Albert est recopiée au fil de l'eau (flux SSE compris), avec
son code, son type et son Retry-After. Avant un appel de conversation, la
régulation par modèle peut répondre 429 à la place d'Albert.

Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
Licence : GPL-3.0-or-later
"""

import json
import math

import httpx

from serveur import config, proxy, regulation

# Au-delà des 120 s de la page (Albert.DELAI_MS) : c'est elle qui abandonne.
DELAI_LECTURE = 130.0
EN_TETES_RECOPIES = ("content-type", "retry-after")


def repondre_json(handler, statut, donnees, en_tetes=None):
    """Envoie une réponse JSON complète."""
    corps = json.dumps(donnees, ensure_ascii=False).encode("utf-8")
    handler.send_response(statut)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(corps)))
    for nom, valeur in (en_tetes or {}).items():
        handler.send_header(nom, valeur)
    handler.end_headers()
    handler.wfile.write(corps)


def _modele(corps):
    """Modèle demandé dans un corps JSON, ou None."""
    try:
        donnees = json.loads(corps or b"{}")
    except ValueError:
        return None
    modele = donnees.get("model") if isinstance(donnees, dict) else None
    return modele if isinstance(modele, str) else None


def _retry_after(valeur):
    try:
        return float(valeur)
    except (TypeError, ValueError):
        return None


def relayer(handler, methode, chemin, corps=b"", type_contenu=None):
    """Relaie une requête /v1/... vers Albert et recopie sa réponse."""
    api_base = config.load_config()["api_base"].rstrip("/")
    throttler = None
    if chemin == "/v1/chat/completions":
        throttler = regulation.obtenir_throttler(api_base, _modele(corps))
        attente = throttler.delai_avant_prochaine_requete(debounce=False)
        if attente > 0:
            repondre_json(handler, 429, {"detail": "Albert est très demandé, patientez."},
                          {"Retry-After": str(math.ceil(attente))})
            return
    cle = config.prochaine_cle()
    if not cle:
        # 500 : la page affiche ce détail, alors qu'un 503 y devient "Albert ne répond pas".
        repondre_json(handler, 500, {"detail": f"Aucune clé API sur le serveur : ajoutez-en une dans {config.KEYS_FILE}."})
        return
    en_tetes = {"Authorization": f"Bearer {cle}"}
    if type_contenu:
        en_tetes["Content-Type"] = type_contenu
    proxy.tester_acces_direct(api_base)
    envoye = False
    for essai in (1, 2):
        try:
            with proxy.creer_client_http(httpx.Timeout(DELAI_LECTURE, connect=10.0)) as http:
                with http.stream(methode, api_base + chemin, content=corps or None, headers=en_tetes) as reponse:
                    if reponse.status_code == 407 and essai == 1 and proxy.basculer_sans_proxy():
                        continue
                    if throttler and reponse.status_code == 429:
                        throttler.record_rate_limit(_retry_after(reponse.headers.get("retry-after")))
                    elif throttler and reponse.status_code < 400:
                        throttler.record_request()
                    handler.send_response(reponse.status_code)
                    for nom in EN_TETES_RECOPIES:
                        if nom in reponse.headers:
                            handler.send_header(nom, reponse.headers[nom])
                    handler.send_header("Cache-Control", "no-cache")
                    handler.end_headers()
                    envoye = True
                    # iter_bytes décompresse : la page reçoit toujours du texte lisible.
                    for morceau in reponse.iter_bytes():
                        handler.wfile.write(morceau)
                        handler.wfile.flush()
                    return
        except httpx.ProxyError:
            if not envoye and essai == 1 and proxy.basculer_sans_proxy():
                continue
            break
        except httpx.HTTPError:
            break
    # Coupure en plein flux : les en-têtes sont partis, la page verra une réponse tronquée.
    if not envoye:
        repondre_json(handler, 502, {"detail": "Albert ne répond pas."})
