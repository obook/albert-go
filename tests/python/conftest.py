"""Faux Albert et serveur d'Albert Go lancés dans des threads pour les tests."""

import gzip
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest

from serveur import config, regulation


class FauxAlbert:
    """Note les requêtes reçues et rend les réponses préparées par chemin."""

    def __init__(self):
        self.recues = []
        self.reponses = {}
        self.attente = threading.Event()
        faux = self

        class Gestionnaire(BaseHTTPRequestHandler):
            def do_GET(self):
                self._repondre()

            def do_POST(self):
                self._repondre()

            def _repondre(self):
                n = int(self.headers.get("Content-Length") or 0)
                faux.recues.append({"chemin": self.path, "auth": self.headers.get("Authorization"),
                                    "type": self.headers.get("Content-Type"), "corps": self.rfile.read(n)})
                reponse = faux.reponses.get(self.path, (200, {"Content-Type": "application/json"}, b'{"ok": true}'))
                if callable(reponse):
                    reponse(self)
                    return
                statut, en_tetes, corps = reponse
                self.send_response(statut)
                for nom, valeur in en_tetes.items():
                    self.send_header(nom, valeur)
                self.end_headers()
                self.wfile.write(corps)

            def log_message(self, *args):
                pass

        self.serveur = ThreadingHTTPServer(("127.0.0.1", 0), Gestionnaire)
        self.url = f"http://127.0.0.1:{self.serveur.server_address[1]}"
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()


@pytest.fixture
def albert(tmp_path, monkeypatch):
    """Faux Albert ; la configuration du serveur pointe dessus, avec la clé sk-serveur."""
    for nom in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        monkeypatch.delenv(nom, raising=False)
    faux = FauxAlbert()
    (tmp_path / "config").write_text(f"api_base={faux.url}\n", encoding="utf-8")
    (tmp_path / "keys").write_text("sk-serveur\n", encoding="utf-8")
    monkeypatch.setattr(config, "CONFIG_FILE", str(tmp_path / "config"))
    monkeypatch.setattr(config, "KEYS_FILE", str(tmp_path / "keys"))
    config.reinitialiser_pour_tests()
    regulation.reinitialiser_pour_tests()
    yield faux
    faux.attente.set()
    faux.serveur.shutdown()


@pytest.fixture
def client(albert):
    """Client httpx vers un serveur d'Albert Go lancé sur un port libre."""
    from serveur.serveur import creer_serveur
    serveur = creer_serveur(port=0)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    with httpx.Client(base_url=f"http://127.0.0.1:{serveur.server_address[1]}", timeout=10) as c:
        yield c
    serveur.shutdown()


def gzipe(texte):
    return gzip.compress(texte.encode("utf-8"))


@pytest.fixture
def kiosque_client(albert):
    """Client httpx vers un serveur en mode kiosque ; ne suit pas les redirections."""
    from serveur import kiosque
    from serveur.serveur import creer_serveur
    kiosque.terminer_session()
    serveur = creer_serveur(port=0, mode_kiosque=True)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    with httpx.Client(base_url=f"http://127.0.0.1:{serveur.server_address[1]}", timeout=10,
                      follow_redirects=False) as c:
        yield c
    serveur.shutdown()
    kiosque.terminer_session()
