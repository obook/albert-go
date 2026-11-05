"""Tests du kiosque à travers le serveur HTTP."""

import json

from serveur import kiosque


def _ouvrir(client, cle="sk-prof"):
    """Le prof ouvre une session ; renvoie la réponse (302 et cookie)."""
    return client.post("/kiosque", data={"action": "login", "cle_api": cle, "duree": "1h"})


def _serveur_js(client):
    texte = client.get("/serveur.js").text
    return json.loads(texte.removeprefix("var SERVEUR = ").removesuffix(";\n"))


def test_page_sans_session_renvoie_vers_kiosque(kiosque_client):
    reponse = kiosque_client.get("/")
    assert reponse.status_code == 302
    assert reponse.headers["Location"] == "/kiosque"


def test_v1_sans_session_401(kiosque_client, albert):
    reponse = kiosque_client.get("/v1/models")
    assert reponse.status_code == 401
    assert reponse.json()["kiosque"] == "terminee"
    assert albert.recues == []


def test_prof_ouvre_la_session_avec_sa_cle(kiosque_client, albert):
    reponse = _ouvrir(kiosque_client)
    assert reponse.status_code == 302 and reponse.headers["Location"] == "/"
    assert "kiosque-session=" in reponse.headers["Set-Cookie"]
    assert "HttpOnly" in reponse.headers["Set-Cookie"]
    assert albert.recues[0]["auth"] == "Bearer sk-prof"
    assert kiosque_client.get("/").status_code == 200
    kiosque_client.get("/v1/models")
    assert albert.recues[-1]["auth"] == "Bearer sk-prof"


def test_cle_refusee_par_albert(kiosque_client, albert):
    albert.reponses["/v1/models"] = (401, {"Content-Type": "application/json"}, b"{}")
    reponse = _ouvrir(kiosque_client, "sk-fausse")
    assert reponse.headers["Location"] == "/kiosque?erreur=cle-refusee"
    assert not kiosque.session_active()


def test_cle_vide(kiosque_client):
    reponse = _ouvrir(kiosque_client, "  ")
    assert reponse.headers["Location"] == "/kiosque?erreur=cle-requise"


def test_eleve_rejoint_avec_le_code(kiosque_client):
    _ouvrir(kiosque_client)
    infos = _serveur_js(kiosque_client)["kiosque"]
    assert infos["role"] == "enseignant" and len(infos["code"]) == 4
    kiosque_client.cookies.clear()
    reponse = kiosque_client.post("/kiosque", data={"action": "code", "token": infos["token"], "code": infos["code"]})
    assert reponse.status_code == 302 and reponse.headers["Location"] == "/"
    eleve = _serveur_js(kiosque_client)["kiosque"]
    assert eleve["role"] == "eleve"
    assert "token" not in eleve and "code" not in eleve


def test_mauvais_code(kiosque_client):
    _ouvrir(kiosque_client)
    token = _serveur_js(kiosque_client)["kiosque"]["token"]
    kiosque_client.cookies.clear()
    reponse = kiosque_client.post("/kiosque", data={"action": "code", "token": token, "code": "abcd"})
    assert reponse.headers["Location"].startswith("/kiosque?erreur=code&token=")


def test_prof_qui_tape_le_code_reste_prof(kiosque_client):
    _ouvrir(kiosque_client)
    infos = _serveur_js(kiosque_client)["kiosque"]
    kiosque_client.post("/kiosque", data={"action": "code", "token": infos["token"], "code": infos["code"]})
    assert _serveur_js(kiosque_client)["kiosque"]["role"] == "enseignant"


def test_reglages_du_prof_transmis_aux_eleves(kiosque_client):
    _ouvrir(kiosque_client)
    infos = _serveur_js(kiosque_client)["kiosque"]
    assert kiosque_client.post("/api/kiosque-reglages", json={"temperature": 0.7, "pirate": 1}).status_code == 200
    kiosque_client.cookies.clear()
    kiosque_client.post("/kiosque", data={"action": "code", "token": infos["token"], "code": infos["code"]})
    reglages = _serveur_js(kiosque_client)["kiosque"]["reglages"]
    assert reglages["temperature"] == 0.7 and "pirate" not in reglages
    assert kiosque_client.post("/api/kiosque-reglages", json={"temperature": 2}).status_code == 403


def test_eleve_suit_les_reglages_pendant_la_session(kiosque_client):
    _ouvrir(kiosque_client)
    infos = _serveur_js(kiosque_client)["kiosque"]
    prof = dict(kiosque_client.cookies)
    assert "reglages" not in kiosque_client.get("/api/kiosque-status").json()
    kiosque_client.cookies.clear()
    kiosque_client.post("/kiosque", data={"action": "code", "token": infos["token"], "code": infos["code"]})
    eleve = dict(kiosque_client.cookies)
    kiosque_client.cookies = prof
    kiosque_client.post("/api/kiosque-reglages", json={"calcul": False, "nom": "Mythos"})
    kiosque_client.cookies = eleve
    reglages = kiosque_client.get("/api/kiosque-status").json()["reglages"]
    assert reglages["calcul"] is False and reglages["nom"] == "Mythos"


def test_deconnexion_du_prof_termine_la_session(kiosque_client):
    _ouvrir(kiosque_client)
    reponse = kiosque_client.post("/kiosque", data={"action": "logout"})
    assert reponse.headers["Location"] == "/kiosque"
    assert "Max-Age=0" in reponse.headers["Set-Cookie"]
    assert not kiosque.session_active()


def test_deconnexion_d_un_eleve_garde_la_session(kiosque_client):
    _ouvrir(kiosque_client)
    infos = _serveur_js(kiosque_client)["kiosque"]
    kiosque_client.cookies.clear()
    kiosque_client.post("/kiosque", data={"action": "code", "token": infos["token"], "code": infos["code"]})
    kiosque_client.post("/kiosque", data={"action": "logout"})
    assert kiosque.session_active()


def test_statut_lie_au_cookie(kiosque_client):
    """La garde de la page ne regarde que la session de ce navigateur."""
    assert kiosque_client.get("/api/kiosque-status").json()["active"] is False
    _ouvrir(kiosque_client)
    statut = kiosque_client.get("/api/kiosque-status").json()
    assert statut["active"] and statut["temps_restant"] > 3500
    kiosque_client.cookies.clear()
    assert kiosque_client.get("/api/kiosque-status").json()["active"] is False


def test_ancienne_session_renvoyee_avec_message(kiosque_client):
    """Le prof rouvre une session : l'ancien navigateur est renvoyé vers /kiosque, avec le motif."""
    _ouvrir(kiosque_client)
    ancien = kiosque_client.cookies.get("kiosque-session")
    _ouvrir(kiosque_client)
    kiosque_client.cookies.clear()
    kiosque_client.cookies.set("kiosque-session", ancien)
    assert kiosque_client.get("/api/kiosque-status").json()["active"] is False
    assert kiosque_client.get("/").headers["Location"] == "/kiosque?erreur=terminee"


def test_cle_non_ascii_sans_coupure(kiosque_client):
    reponse = _ouvrir(kiosque_client, "sk-\u200babc")
    assert reponse.headers["Location"] == "/kiosque?erreur=cle-refusee"


def test_serveur_js_hors_kiosque(client):
    texte = client.get("/serveur.js")
    assert texte.headers["Cache-Control"] == "no-store"
    donnees = json.loads(texte.text.removeprefix("var SERVEUR = ").removesuffix(";\n"))
    assert donnees["kiosque"] is None
    assert isinstance(donnees["adresses"], list)


def test_page_de_connexion_sans_mode_de_travail(kiosque_client):
    page = kiosque_client.get("/kiosque").text
    assert 'name="cle_api"' in page and 'name="duree"' in page and 'name="code"' in page
    assert 'name="niveau"' not in page
    assert "<title>Albert Go</title>" in page


def test_sans_kiosque_la_page_kiosque_renvoie_a_l_accueil(client):
    # Une page ouverte pendant une ancienne session kiosque y mène encore (Pixel 8, 16/10/2026).
    for adresse in ("/kiosque", "/kiosque?erreur=terminee"):
        reponse = client.get(adresse)
        assert reponse.status_code == 302 and reponse.headers["Location"] == "/"
