"""Tests de serveur/serveur.py : fichiers de public/, routes /v1, tailles."""

import http.client

import httpx
import pytest


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
    for chemin in ("/../serveur/config.py", "/%2e%2e/serveur/config.py", "/js/../../pytest.ini", "/%2e%2e/.env"):
        assert client.get(chemin).status_code in (403, 404)


def test_routes_relayees(client, albert):
    assert client.get("/v1/models").status_code == 200
    assert client.post("/v1/chat/completions", json={"model": "m"}).status_code == 200
    assert client.post("/v1/embeddings", json={"model": "m", "input": ["a"]}).status_code == 200
    assert [r["chemin"] for r in albert.recues] == ["/v1/models", "/v1/chat/completions", "/v1/embeddings"]


def _adresse_reseau(client):
    """Adresse réseau du serveur de test : en s'y joignant, il voit un poste distant."""
    from serveur.serveur import adresses_locales
    ips = adresses_locales()
    if not ips:
        pytest.skip("aucune adresse réseau")
    return f"http://{ips[0]}:{client.base_url.port}"


def test_portable_refuse_les_autres_postes(client, albert, monkeypatch):
    from serveur import config
    monkeypatch.setattr(config, "MODE", "portable")
    reponse = httpx.get(_adresse_reseau(client) + "/v1/models", timeout=5)
    assert reponse.status_code == 403
    assert reponse.json()["reseau"] == "refuse"
    assert albert.recues == []
    # La page reste servie : l'autre poste lit le message d'erreur.
    assert httpx.get(_adresse_reseau(client) + "/", timeout=5).status_code == 200


def test_serveur_centralise_sert_le_reseau(client, albert, monkeypatch):
    from serveur import config
    monkeypatch.setattr(config, "MODE", "dépôt")
    assert httpx.get(_adresse_reseau(client) + "/v1/models", timeout=5).status_code == 200
    assert albert.recues[0]["auth"] == "Bearer sk-serveur"


def test_route_inconnue_404(client, albert):
    assert client.post("/v1/files", json={}).status_code == 404
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


def _brute(client, en_tetes, corps=b""):
    """Requête POST écrite à la main : httpx corrigerait l'en-tête Content-Length."""
    connexion = http.client.HTTPConnection("127.0.0.1", client.base_url.port, timeout=5)
    connexion.putrequest("POST", "/v1/chat/completions")
    for nom, valeur in en_tetes.items():
        connexion.putheader(nom, valeur)
    connexion.endheaders()
    if corps:
        connexion.send(corps)
    return connexion.getresponse().status


def test_content_length_negatif_ou_invalide_400(client, albert):
    assert _brute(client, {"Content-Type": "application/json", "Content-Length": "-1"}, b'{"model": "m"}') == 400
    assert _brute(client, {"Content-Type": "application/json", "Content-Length": "abc"}) == 400
    assert albert.recues == []


def test_fichier_inchange_304(client):
    """Revalidation : un fichier inchangé ne repart pas (Giac pèse 19 Mo)."""
    premiere = client.get("/js/albert.js")
    date = premiere.headers["Last-Modified"]
    seconde = client.get("/js/albert.js", headers={"If-Modified-Since": date})
    assert seconde.status_code == 304
    assert seconde.content == b""


def test_ssl_un_client_muet_ne_bloque_pas_les_autres(albert, tmp_path, monkeypatch):
    """Un iPad en veille au milieu de la poignée TLS ne doit pas figer la classe."""
    import shutil
    import socket
    import subprocess
    import threading

    import httpx
    import pytest

    from serveur import certificat
    from serveur.serveur import creer_serveur
    if not shutil.which("openssl"):
        pytest.skip("openssl absent")
    cert, cle = tmp_path / "cert.pem", tmp_path / "key.pem"
    subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
                    "-keyout", str(cle), "-out", str(cert)], check=True, capture_output=True)
    monkeypatch.setattr(certificat, "CERT_FILE", str(cert))
    monkeypatch.setattr(certificat, "KEY_FILE", str(cle))
    serveur = creer_serveur(port=0, utiliser_ssl=True)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    port = serveur.server_address[1]
    muet = socket.create_connection(("127.0.0.1", port))
    try:
        reponse = httpx.get(f"https://127.0.0.1:{port}/", verify=False, timeout=3)
        assert reponse.status_code == 200
    finally:
        muet.close()
        serveur.shutdown()
