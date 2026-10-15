"""Tests de serveur/serveur.py : fichiers de public/, routes /v1, tailles."""

import http.client


def test_page_servie(client):
    reponse = client.get("/")
    assert reponse.status_code == 200
    assert reponse.headers["Content-Type"].startswith("text/html")
    assert "<html" in reponse.text.lower()


def test_script_sans_cache(client):
    reponse = client.get("/js/albert.js")
    assert reponse.status_code == 200
    assert reponse.headers["Cache-Control"] == "no-cache"
    assert reponse.headers["Content-Type"].startswith("application/javascript")


def test_fichier_absent_404(client):
    assert client.get("/js/absent.js").status_code == 404


def test_chemin_hors_public_refuse(client):
    for chemin in ("/../serveur/config.py", "/%2e%2e/serveur/config.py", "/js/../../pytest.ini"):
        assert client.get(chemin).status_code in (403, 404)


def test_routes_relayees(client, albert):
    assert client.get("/v1/models").status_code == 200
    assert client.post("/v1/chat/completions", json={"model": "m"}).status_code == 200
    assert [r["chemin"] for r in albert.recues] == ["/v1/models", "/v1/chat/completions"]


def test_route_inconnue_404(client, albert):
    assert client.post("/v1/embeddings", json={}).status_code == 404
    assert albert.recues == []


def test_corps_trop_gros_413(client, albert):
    # Seul l'en-tête annonce la taille : le serveur doit refuser sans lire le corps.
    connexion = http.client.HTTPConnection("127.0.0.1", client.base_url.port, timeout=5)
    connexion.putrequest("POST", "/v1/chat/completions")
    connexion.putheader("Content-Type", "application/json")
    connexion.putheader("Content-Length", str(10 * 1024 * 1024 + 1))
    connexion.endheaders()
    assert connexion.getresponse().status == 413
    assert albert.recues == []


def test_audio_jusqu_a_16_mo(client, albert):
    corps = b"x" * (12 * 1024 * 1024)
    reponse = client.post("/v1/audio/transcriptions", content=corps, headers={"Content-Type": "multipart/form-data; boundary=b"})
    assert reponse.status_code == 200
