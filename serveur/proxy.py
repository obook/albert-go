# Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
# Repris de L'Atelier d'Albert (Romain P., Luce P.B., Théossian S.D., O. Booklage)
# Licence : GPL-3.0-or-later
"""Bascule automatique sans proxy en cas de refus du proxy système.

Sur certains réseaux d'administration, Windows déclare un proxy système
qui échoue (authentification exigée, délai dépassé, inspection TLS),
même quand l'accès direct à Albert fonctionne.

Ce module fournit :
    - tester_acces_direct() : essaie d'abord Albert en direct et ignore
      le proxy système s'il répond.
    - creer_client_http()   : fabrique de clients httpx qui respecte la
      bascule (le proxy système est ignoré une fois la bascule activée).
    - basculer_sans_proxy() : active la bascule pour toute la session.

La bascule est mémorisée au niveau du processus : toutes les requêtes
suivantes partent en accès direct. Les réseaux où seul le proxy passe
ne sont pas affectés : le test direct échoue et le proxy reste en place.
"""

import threading
import urllib.request

import httpx

# Vrai quand le proxy système est écarté : on l'ignore désormais
_ignorer_proxy = False
# Vrai une fois l'accès direct testé (un seul test par processus)
_acces_teste = False
_verrou = threading.Lock()


def tester_acces_direct(api_base):
    """Ignore le proxy système si Albert répond en direct.

    Toute réponse HTTP d'Albert, même un 401, prouve que le direct passe.
    Rien n'est testé si aucun proxy système n'est déclaré.
    """
    global _ignorer_proxy, _acces_teste
    with _verrou:
        if _acces_teste:
            return
        _acces_teste = True
        if _ignorer_proxy or not urllib.request.getproxies():
            return
        try:
            with httpx.Client(timeout=5.0, trust_env=False) as client:
                client.get(f"{api_base}/v1/models")
        except httpx.HTTPError:
            return
        _ignorer_proxy = True


def creer_client_http(timeout):
    """Crée un client httpx, sans proxy système si la bascule est active."""
    return httpx.Client(timeout=timeout, trust_env=not _ignorer_proxy)


def basculer_sans_proxy():
    """Active la bascule sans proxy.

    Renvoie True si elle vient d'être activée (l'appelant peut alors
    réessayer sa requête), False si elle l'était déjà (inutile de
    réessayer : l'échec a une autre cause).
    """
    global _ignorer_proxy
    with _verrou:
        if _ignorer_proxy:
            return False
        _ignorer_proxy = True
        return True
