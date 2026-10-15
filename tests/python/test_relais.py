"""Tests de serveur/relais.py, à travers un mini serveur qui n'appelle que relayer."""

import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest

from conftest import gzipe
from serveur import config, relais


@pytest.fixture
def mini(albert):
    """Serveur minimal : GET et POST relayés tels quels."""
    class Gestionnaire(BaseHTTPRequestHandler):
        def do_GET(self):
            relais.relayer(self, "GET", self.path)

        def do_POST(self):
            n = int(self.headers.get("Content-Length") or 0)
            relais.relayer(self, "POST", self.path, self.rfile.read(n), self.headers.get("Content-Type"))

        def log_message(self, *args):
            pass

    serveur = ThreadingHTTPServer(("127.0.0.1", 0), Gestionnaire)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    with httpx.Client(base_url=f"http://127.0.0.1:{serveur.server_address[1]}", timeout=10) as c:
        yield c
    serveur.shutdown()


def test_cle_du_serveur_remplace_celle_de_la_page(mini, albert):
    reponse = mini.get("/v1/models", headers={"Authorization": "Bearer sk-page"})
    assert reponse.status_code == 200
    assert albert.recues[0]["auth"] == "Bearer sk-serveur"


def test_corps_et_type_relayes_tels_quels(mini, albert):
    corps = b'--b\r\nContent-Disposition: form-data; name="model"\r\n\r\naudio\r\n--b--\r\n'
    mini.post("/v1/audio/transcriptions", content=corps, headers={"Content-Type": "multipart/form-data; boundary=b"})
    assert albert.recues[0]["corps"] == corps
    assert albert.recues[0]["type"] == "multipart/form-data; boundary=b"


def test_429_relaye_avec_retry_after(mini, albert):
    albert.reponses["/v1/chat/completions"] = (429, {"Content-Type": "application/json", "Retry-After": "7"}, b'{"detail": "trop"}')
    reponse = mini.post("/v1/chat/completions", json={"model": "m", "messages": []})
    assert reponse.status_code == 429
    assert reponse.headers["Retry-After"] == "7"
    assert reponse.json() == {"detail": "trop"}


def test_apres_un_429_le_serveur_fait_patienter(mini, albert):
    albert.reponses["/v1/chat/completions"] = (429, {"Retry-After": "30"}, b"{}")
    mini.post("/v1/chat/completions", json={"model": "m", "messages": []})
    reponse = mini.post("/v1/chat/completions", json={"model": "m", "messages": []})
    assert reponse.status_code == 429
    assert int(reponse.headers["Retry-After"]) >= 1
    assert len(albert.recues) == 1


def test_flux_relaye_sans_attendre_la_fin(mini, albert):
    def flux(gestionnaire):
        gestionnaire.send_response(200)
        gestionnaire.send_header("Content-Type", "text/event-stream")
        gestionnaire.end_headers()
        gestionnaire.wfile.write(b"data: 1\n\n")
        gestionnaire.wfile.flush()
        albert.attente.wait(5)
        gestionnaire.wfile.write(b"data: 2\n\n")
    albert.reponses["/v1/chat/completions"] = flux
    with mini.stream("POST", "/v1/chat/completions", json={"model": "m", "stream": True}) as reponse:
        morceaux = reponse.iter_bytes()
        debut = time.monotonic()
        premier = next(morceaux)
        assert premier.startswith(b"data: 1")
        assert time.monotonic() - debut < 3
        albert.attente.set()
        assert b"data: 2" in premier + b"".join(morceaux)


def test_reponse_gzip_decompressee(mini, albert):
    albert.reponses["/v1/models"] = (200, {"Content-Type": "application/json", "Content-Encoding": "gzip"}, gzipe('{"data": []}'))
    assert mini.get("/v1/models").json() == {"data": []}


def test_reponse_lente_non_coupee(mini, albert, monkeypatch):
    assert relais.DELAI_LECTURE > 120
    monkeypatch.setattr(relais, "DELAI_LECTURE", 3)
    def lente(gestionnaire):
        time.sleep(1.5)
        gestionnaire.send_response(200)
        gestionnaire.send_header("Content-Type", "application/json")
        gestionnaire.end_headers()
        gestionnaire.wfile.write(b'{"lent": true}')
    albert.reponses["/v1/chat/completions"] = lente
    assert mini.post("/v1/chat/completions", json={"model": "m"}).json() == {"lent": True}


def test_albert_injoignable_502(mini, albert, tmp_path, monkeypatch):
    (tmp_path / "config").write_text("api_base=http://127.0.0.1:9\napi_key=sk-serveur\n", encoding="utf-8")
    reponse = mini.get("/v1/models")
    assert reponse.status_code == 502
    assert "detail" in reponse.json()


def test_sans_cle_500_avec_le_detail(mini, albert, tmp_path, monkeypatch):
    # 500 et non 503 : la page affiche le détail d'un 500, et dit "Albert ne répond pas" pour un 503.
    (tmp_path / "config").write_text(f"api_base={albert.url}\n", encoding="utf-8")
    monkeypatch.setenv("HOME", str(tmp_path))
    reponse = mini.get("/v1/models")
    assert reponse.status_code == 500
    assert reponse.json()["detail"] == "Aucune clé API sur le serveur : ajoutez api_key=... dans ~/config."
    assert albert.recues == []


def test_nom_de_modele_demesure_sans_fenetre_dediee(mini, albert):
    """Un client du réseau ne doit pas faire grossir la mémoire avec des noms de modèle géants."""
    from serveur import regulation
    geant = "m" * 1000
    mini.post("/v1/chat/completions", json={"model": geant, "messages": []})
    assert all(geant not in cle for cle in regulation._throttlers)


def test_rafale_comptee_avant_la_reponse_d_albert(mini, albert, monkeypatch):
    """Deux élèves en même temps, plafond d'une requête : la seconde attend sans partir chez Albert."""
    from concurrent.futures import ThreadPoolExecutor
    from serveur import regulation
    monkeypatch.setitem(regulation.RPM_PAR_MODELE, "m", 1)
    def lente(gestionnaire):
        time.sleep(1)
        gestionnaire.send_response(200)
        gestionnaire.send_header("Content-Type", "application/json")
        gestionnaire.end_headers()
        gestionnaire.wfile.write(b"{}")
    albert.reponses["/v1/chat/completions"] = lente
    with ThreadPoolExecutor(2) as groupe:
        statuts = sorted(groupe.map(lambda _: mini.post("/v1/chat/completions", json={"model": "m"}).status_code, range(2)))
    assert statuts == [200, 429]
    assert len(albert.recues) == 1


def test_page_qui_abandonne_sans_trace_dans_le_terminal(albert):
    """Bouton Arrêter en plein flux : pas de trace d'erreur dans le terminal du serveur."""
    erreurs = []

    class Gestionnaire(BaseHTTPRequestHandler):
        def do_POST(self):
            n = int(self.headers.get("Content-Length") or 0)
            relais.relayer(self, "POST", self.path, self.rfile.read(n), self.headers.get("Content-Type"))

        def log_message(self, *args):
            pass

    class Serveur(ThreadingHTTPServer):
        def handle_error(self, requete, adresse):
            erreurs.append(adresse)

    def flux(gestionnaire):
        gestionnaire.send_response(200)
        gestionnaire.send_header("Content-Type", "text/event-stream")
        gestionnaire.end_headers()
        gestionnaire.wfile.write(b"data: 1\n\n")
        gestionnaire.wfile.flush()
        albert.attente.wait(5)
        try:
            for _ in range(200):
                gestionnaire.wfile.write(b"x" * 65536)
                gestionnaire.wfile.flush()
        except OSError:
            pass
    albert.reponses["/v1/chat/completions"] = flux
    serveur = Serveur(("127.0.0.1", 0), Gestionnaire)
    fil = threading.Thread(target=serveur.serve_forever, daemon=True)
    fil.start()
    with httpx.Client(base_url=f"http://127.0.0.1:{serveur.server_address[1]}", timeout=10) as client:
        with client.stream("POST", "/v1/chat/completions", json={"model": "m", "stream": True}) as reponse:
            next(reponse.iter_bytes())
    albert.attente.set()
    time.sleep(2)
    serveur.shutdown()
    assert erreurs == []
