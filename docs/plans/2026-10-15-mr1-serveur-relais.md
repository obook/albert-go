# MR 1 : serveur relais - plan d'implémentation

> **Pour l'agent qui exécute :** sous-skill requis, superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Étapes en cases à cocher (`- [ ]`).

**But :** Albert Go servi par un serveur Python qui relaie `/v1/...` vers Albert avec la clé du serveur ; plus de relais n8n ni d'écran de clé.

**Architecture :** un paquet Python `serveur/` à la racine du dépôt (bibliothèque standard + httpx) sert `public/` et relaie trois routes vers Albert en recopiant la réponse au fil de l'eau. Configuration, régulation, proxy et certificat viennent de l'atelier (`~/Documents/GitForge/albert-atelier/sources/albert_atelier/`). Côté page, `Albert.BASE` vaut `/v1`, la clé disparaît des appels, et tout ce qui surveillait le relais n8n est retiré.

**Technique :** Python 3.10+, httpx, pytest ; JavaScript du navigateur, tests `node --test`.

**Spec :** `docs/specs/2026-10-15-fusion-atelier.md`

## Contraintes globales

- Licence du dépôt : GPL v3+ ; en-tête des fichiers : `Licence : GPL-3.0-or-later`.
- Dossier de configuration : `~/.config/albert-go/`, ou `ALBERT_PORTABLE_DIR` s'il est défini.
- Port par défaut : 8913.
- Corps de requête : 10 Mo au plus, 16 Mo pour `/v1/audio/transcriptions`.
- Le serveur ignore l'en-tête `Authorization` reçu de la page.
- Français correctement accentué, ponctuation ASCII seulement (guillemets droits, tiret simple).
- Aucun nouveau paquet Python en dehors de `httpx` (exécution) et `pytest` (tests).

## Points à surveiller en revue

1. Réponse longue d'Albert (outils, gros modèle) : le relais ne doit pas couper avant 120 s, délai de la page (`Albert.DELAI_MS`). Test : Tâche 3, `test_reponse_lente_non_coupee`.
2. Albert injoignable : la page doit recevoir un 502 JSON lisible, pas une connexion fermée. Test : Tâche 3, `test_albert_injoignable_502`.
3. Aucune clé dans `keys` : un 503 qui le dit, pas une requête partie sans clé. Test : Tâche 3, `test_sans_cle_503`.
4. Chemin de fichier piégé (`/../serveur/config.py`, `%2e%2e`) : jamais servi. Test : Tâche 4, `test_chemin_hors_public_refuse`.
5. Réponse compressée par Albert (gzip) : la page doit recevoir du JSON lisible. Test : Tâche 3, `test_reponse_gzip_decompressee`.

---

### Tâche 1 : configuration du serveur

**Fichiers :**
- Créer : `serveur/__init__.py`, `serveur/config.py`, `serveur/requirements.txt`, `pytest.ini`
- Test : `tests/python/test_config.py`

**Interfaces :**
- Produit : `CONFIG_DIR`, `CONFIG_FILE`, `KEYS_FILE` (str) ; `load_config() -> {"api_base": str, "model": str, "kiosque": bool}` ; `load_web_keys() -> list[str]` ; `prochaine_cle() -> str | None` (rotation) ; `config_affichee() -> str`.

- [ ] **Étape 1 : préparer l'environnement**

```bash
cd ~/Documents/GitForge/albert-go
python3 -m venv .venv
.venv/bin/pip install httpx pytest
grep -qx ".venv/" .gitignore || echo ".venv/" >> .gitignore
```

`serveur/requirements.txt` :

```
httpx>=0.27
```

`pytest.ini` :

```ini
[pytest]
testpaths = tests/python
pythonpath = .
```

`serveur/__init__.py` :

```python
"""Serveur d'Albert Go : sert public/ et relaie /v1 vers Albert avec la clé du serveur."""
```

- [ ] **Étape 2 : écrire les tests**

`tests/python/test_config.py` :

```python
"""Tests de serveur/config.py."""

import os
from unittest.mock import patch

from serveur import config


def _dossier(tmp_path, cles=None, contenu_config=None):
    if cles is not None:
        (tmp_path / "keys").write_text(cles, encoding="utf-8")
    if contenu_config is not None:
        (tmp_path / "config").write_text(contenu_config, encoding="utf-8")
    return patch.multiple(config, CONFIG_FILE=str(tmp_path / "config"), KEYS_FILE=str(tmp_path / "keys"))


def test_valeurs_par_defaut(tmp_path):
    with _dossier(tmp_path):
        assert config.load_config() == {
            "api_base": "https://albert.api.etalab.gouv.fr", "model": "", "kiosque": False}


def test_lecture_et_commentaires(tmp_path):
    with _dossier(tmp_path, contenu_config="# commentaire\napi_base=http://a=b\nkiosque=oui\n"):
        cfg = config.load_config()
    assert cfg["api_base"] == "http://a=b"
    assert cfg["kiosque"] is True


def test_cles_sans_commentaires(tmp_path):
    with _dossier(tmp_path, cles="# Clés\nsk-1\n\nsk-2\n"):
        assert config.load_web_keys() == ["sk-1", "sk-2"]


def test_rotation_des_cles(tmp_path):
    with _dossier(tmp_path, cles="sk-1\nsk-2\n"):
        config.reinitialiser_pour_tests()
        assert [config.prochaine_cle() for _ in range(3)] == ["sk-1", "sk-2", "sk-1"]


def test_sans_cle(tmp_path):
    with _dossier(tmp_path, cles=""):
        config.reinitialiser_pour_tests()
        assert config.prochaine_cle() is None


def test_ligne_de_lancement_avec_tilde(tmp_path):
    fichier = tmp_path / "config"
    fichier.write_text("model=x\n", encoding="utf-8")
    with patch.object(config, "CONFIG_FILE", str(fichier)), \
         patch.dict(os.environ, {"HOME": str(tmp_path), "ALBERT_PORTABLE_DIR": ""}):
        assert config.config_affichee() == "Configuration (standard) : " + os.path.join("~", "config")


def test_ligne_de_lancement_fichier_absent(tmp_path):
    fichier = tmp_path / "config"
    with patch.object(config, "CONFIG_FILE", str(fichier)), \
         patch.dict(os.environ, {"HOME": "/ailleurs", "ALBERT_PORTABLE_DIR": str(tmp_path)}):
        assert config.config_affichee() == f"Configuration (portable) : {fichier} (absent : valeurs par défaut)"
```

- [ ] **Étape 3 : vérifier l'échec**

Run : `.venv/bin/python -m pytest tests/python/test_config.py -q`
Attendu : erreur `cannot import name 'config' from 'serveur'`.

- [ ] **Étape 4 : écrire `serveur/config.py`**

```python
"""Configuration du serveur : URL d'Albert, modèle, kiosque, clés API.

Dossier ~/.config/albert-go/, ou ALBERT_PORTABLE_DIR (clé USB) :
    config : lignes nom=valeur (api_base, model, kiosque), # pour commenter ;
    keys   : une clé API par ligne, utilisées à tour de rôle.

Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
Auteurs : O. Booklage ; Romain P., Luce P.B., Théossian S.D. (L'Atelier d'Albert)
Licence : GPL-3.0-or-later
"""

import itertools
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


_cycle = None
_verrou = threading.Lock()


def prochaine_cle():
    """Clé suivante, à tour de rôle ; None si le fichier keys est vide."""
    global _cycle
    with _verrou:
        if _cycle is None:
            cles = load_web_keys()
            if not cles:
                return None
            _cycle = itertools.cycle(cles)
        return next(_cycle)


def reinitialiser_pour_tests():
    """Relit le fichier keys au prochain appel (réservé aux tests)."""
    global _cycle
    with _verrou:
        _cycle = None


def config_affichee():
    """Ligne de lancement : fichier de config utilisé, avec ~ pour le dossier personnel."""
    home = os.path.expanduser("~")
    chemin = str(CONFIG_FILE)
    if chemin.startswith(home + os.sep):
        chemin = "~" + chemin[len(home):]
    mode = "portable" if os.environ.get("ALBERT_PORTABLE_DIR", "").strip() else "standard"
    absent = "" if os.path.exists(CONFIG_FILE) else " (absent : valeurs par défaut)"
    return f"Configuration ({mode}) : {chemin}{absent}"
```

- [ ] **Étape 5 : vérifier le succès**

Run : `.venv/bin/python -m pytest tests/python/test_config.py -q`
Attendu : `7 passed`.

- [ ] **Étape 6 : commit**

```bash
git add serveur/__init__.py serveur/config.py serveur/requirements.txt pytest.ini tests/python/test_config.py .gitignore
git commit -m "feat(serveur): Configuration du serveur, reprise de l'atelier"
```

---

### Tâche 2 : régulation, proxy et certificat repris de l'atelier

**Fichiers :**
- Créer : `serveur/regulation.py` (copie de `api/throttling.py`), `serveur/proxy.py` (copie de `api/proxy.py`), `serveur/certificat.py` (copie de `web/certificat.py`)
- Test : `tests/python/test_regulation.py`, `tests/python/test_proxy.py`, `tests/python/test_certificat.py`

**Interfaces :**
- Produit : `regulation.obtenir_throttler(api_base, modele) -> Throttler` (méthodes `delai_avant_prochaine_requete(debounce)`, `record_request()`, `record_rate_limit(retry_after)`), `regulation.reinitialiser_pour_tests()` ; `proxy.tester_acces_direct(api_base)`, `proxy.creer_client_http(timeout) -> httpx.Client`, `proxy.basculer_sans_proxy() -> bool` ; `certificat.generer_certificat() -> bool`, `certificat.CERT_FILE`, `certificat.KEY_FILE`.

- [ ] **Étape 1 : copier les modules et leurs tests**

```bash
A=~/Documents/GitForge/albert-atelier
cp $A/sources/albert_atelier/api/throttling.py serveur/regulation.py
cp $A/sources/albert_atelier/api/proxy.py serveur/proxy.py
cp $A/sources/albert_atelier/web/certificat.py serveur/certificat.py
sed -i 's/from albert_atelier.configuration import CONFIG_DIR/from serveur.config import CONFIG_DIR/' serveur/certificat.py
cp $A/tests/test_throttling.py tests/python/test_regulation.py
cp $A/tests/test_certificat.py tests/python/test_certificat.py
sed -n '1,141p' $A/tests/test_proxy.py > tests/python/test_proxy.py
sed -i 's/albert_atelier\.api\.throttling/serveur.regulation/g' tests/python/test_regulation.py
sed -i 's/albert_atelier\.web\.certificat/serveur.certificat/g' tests/python/test_certificat.py
sed -i 's/albert_atelier\.api\.proxy/serveur.proxy/g; s/from albert_atelier.api import proxy/from serveur import proxy/' tests/python/test_proxy.py
```

- [ ] **Étape 2 : retirer ce qui dépend de l'atelier**

- `tests/python/test_regulation.py` : supprimer la méthode `test_verification_web_sans_debounce` (elle importe `albert_atelier.web.garde_fou`, non repris).
- `tests/python/test_proxy.py` : supprimer la ligne `from albert_atelier.api import AlbertAPIError, AlbertClient` ; la classe `TestRequeteAvecBascule` (client de l'atelier) est déjà hors des 141 lignes copiées. Vérifier la fin du fichier : il doit se terminer sur `test_un_seul_test_par_processus` complet.
- `serveur/regulation.py` : supprimer la méthode `acquire` (attente bloquante du mode terminal, non reprise) et la phrase du docstring qui la décrit.
- Dans les trois modules, remplacer l'en-tête `#Projet : albert-atelier` ... par :

```python
# Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
# Repris de L'Atelier d'Albert (Romain P., Luce P.B., Théossian S.D., O. Booklage)
# Licence : GPL-3.0-or-later
```

- [ ] **Étape 3 : vérifier**

Run : `grep -rn "albert_atelier" serveur tests/python ; .venv/bin/python -m pytest tests/python -q`
Attendu : aucune ligne pour grep ; tous les tests passent (le test openssl de `test_certificat.py` est sauté si openssl manque).

- [ ] **Étape 4 : commit**

```bash
git add serveur/regulation.py serveur/proxy.py serveur/certificat.py tests/python/test_regulation.py tests/python/test_proxy.py tests/python/test_certificat.py
git commit -m "feat(serveur): Régulation, proxy et certificat repris de l'atelier"
```

---

### Tâche 3 : relais vers Albert

**Fichiers :**
- Créer : `serveur/relais.py`
- Test : `tests/python/test_relais.py`, `tests/python/conftest.py`

**Interfaces :**
- Consomme : `config.load_config()`, `config.prochaine_cle()`, `regulation.obtenir_throttler()`, `proxy.*` (Tâches 1 et 2).
- Produit : `relayer(handler, methode, chemin, corps=b"", type_contenu=None) -> None` : écrit la réponse complète sur `handler` (un `BaseHTTPRequestHandler`). `repondre_json(handler, statut, donnees, en_tetes=None) -> None`. Utilisés par la Tâche 4.

- [ ] **Étape 1 : écrire le faux Albert et le serveur de test**

`tests/python/conftest.py` :

```python
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
```

La fixture `client` dépend de `creer_serveur` (Tâche 4) : les tests de relais s'écrivent ici et passent à la fin de la Tâche 4. Pour tester le relais seul dès maintenant, `tests/python/test_relais.py` monte un mini serveur qui n'appelle que `relayer`.

- [ ] **Étape 2 : écrire les tests du relais**

`tests/python/test_relais.py` :

```python
"""Tests de serveur/relais.py, à travers un mini serveur qui n'appelle que relayer."""

import json
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
    (tmp_path / "config").write_text("api_base=http://127.0.0.1:9\n", encoding="utf-8")
    reponse = mini.get("/v1/models")
    assert reponse.status_code == 502
    assert "detail" in reponse.json()


def test_sans_cle_503(mini, albert, tmp_path):
    (tmp_path / "keys").write_text("", encoding="utf-8")
    config.reinitialiser_pour_tests()
    reponse = mini.get("/v1/models")
    assert reponse.status_code == 503
    assert "keys" in reponse.json()["detail"]
    assert albert.recues == []
```

`DELAI_LECTURE` est le délai de lecture du relais ; le test le réduit pour rester rapide, la valeur réelle (130 s) dépasse les 120 s de la page.

- [ ] **Étape 3 : vérifier l'échec**

Run : `.venv/bin/python -m pytest tests/python/test_relais.py -q`
Attendu : erreur `cannot import name 'relais' from 'serveur'`.

- [ ] **Étape 4 : écrire `serveur/relais.py`**

```python
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
        repondre_json(handler, 503, {"detail": f"Aucune clé API sur le serveur : ajoutez-en une dans {config.KEYS_FILE}."})
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
```

- [ ] **Étape 5 : vérifier le succès**

Run : `.venv/bin/python -m pytest tests/python/test_relais.py -q`
Attendu : `9 passed`.

- [ ] **Étape 6 : commit**

```bash
git add serveur/relais.py tests/python/test_relais.py tests/python/conftest.py
git commit -m "feat(serveur): Relais vers Albert avec la clé du serveur"
```

---

### Tâche 4 : serveur HTTP et lancement

**Fichiers :**
- Créer : `serveur/serveur.py`, `serveur/__main__.py`
- Modifier : `local.sh` (lance le serveur)
- Test : `tests/python/test_serveur.py`

**Interfaces :**
- Consomme : `relais.relayer`, `relais.repondre_json` (Tâche 3), `config` (Tâche 1), `certificat` (Tâche 2).
- Produit : `creer_serveur(port=8913, utiliser_ssl=False) -> ThreadingHTTPServer` ; `adresses_locales() -> list[str]` (réutilisée en MR 3 pour Partager) ; `python -m serveur [--port N] [--ssl] [--no-browser]`.

- [ ] **Étape 1 : écrire les tests**

`tests/python/test_serveur.py` :

```python
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
```

- [ ] **Étape 2 : vérifier l'échec**

Run : `.venv/bin/python -m pytest tests/python/test_serveur.py -q`
Attendu : erreur `No module named 'serveur.serveur'`.

- [ ] **Étape 3 : écrire `serveur/serveur.py`**

```python
"""Serveur HTTP d'Albert Go : fichiers de public/ et relais /v1 vers Albert.

Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
Auteurs : O. Booklage ; Romain P., Luce P.B., Théossian S.D. (L'Atelier d'Albert)
Licence : GPL-3.0-or-later
"""

import http.server
import os
import socket
import ssl
import sys
import urllib.parse

from serveur import certificat, config, relais

RACINE = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "public"))
ROUTES = {
    ("GET", "/v1/models"): 0,
    ("POST", "/v1/chat/completions"): 10 * 1024 * 1024,
    ("POST", "/v1/audio/transcriptions"): 16 * 1024 * 1024,
}
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".map": "application/json",
    ".webmanifest": "application/manifest+json",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".woff2": "font/woff2",
}
# Le navigateur revalide page, scripts et styles ; images et polices restent en cache.
SANS_CACHE = (".html", ".js", ".mjs", ".css", ".txt", ".webmanifest")


class Gestionnaire(http.server.BaseHTTPRequestHandler):
    """Sert public/ et relaie les trois routes /v1 d'Albert."""

    def do_GET(self):
        chemin = urllib.parse.urlsplit(self.path).path
        if chemin.startswith("/v1/"):
            self._relayer("GET", chemin)
        else:
            self._fichier(chemin)

    def do_POST(self):
        self._relayer("POST", urllib.parse.urlsplit(self.path).path)

    def _relayer(self, methode, chemin):
        taille_max = ROUTES.get((methode, chemin))
        if taille_max is None:
            relais.repondre_json(self, 404, {"detail": "Route inconnue."})
            return
        taille = int(self.headers.get("Content-Length") or 0)
        if taille > taille_max:
            relais.repondre_json(self, 413, {"detail": "Requête trop grosse."})
            self.close_connection = True
            return
        corps = self.rfile.read(taille) if taille else b""
        relais.relayer(self, methode, chemin, corps, self.headers.get("Content-Type"))

    def _fichier(self, chemin):
        relatif = urllib.parse.unquote(chemin).lstrip("/") or "index.html"
        fichier = os.path.realpath(os.path.join(RACINE, relatif))
        if os.path.commonpath([RACINE, fichier]) != RACINE:
            self.send_error(403)
            return
        if os.path.isdir(fichier):
            fichier = os.path.join(fichier, "index.html")
        if not os.path.isfile(fichier):
            self.send_error(404)
            return
        extension = os.path.splitext(fichier)[1]
        with open(fichier, "rb") as f:
            contenu = f.read()
        self.send_response(200)
        self.send_header("Content-Type", TYPES.get(extension, "application/octet-stream"))
        self.send_header("Content-Length", str(len(contenu)))
        self.send_header("Cache-Control", "no-cache" if extension in SANS_CACHE else "public, max-age=86400")
        self.end_headers()
        self.wfile.write(contenu)

    def log_message(self, *args):
        pass


def creer_serveur(port=8913, utiliser_ssl=False):
    """Serveur prêt à lancer (serve_forever) sur toutes les interfaces."""
    serveur = http.server.ThreadingHTTPServer(("0.0.0.0", port), Gestionnaire)
    if utiliser_ssl:
        contexte = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        contexte.load_cert_chain(certificat.CERT_FILE, certificat.KEY_FILE)
        serveur.socket = contexte.wrap_socket(serveur.socket, server_side=True)
    return serveur


def adresses_locales():
    """Adresses IPv4 du réseau local, cartes physiques d'abord (pas docker0)."""
    ips = []
    if sys.platform != "win32":
        try:
            import fcntl
            import struct
            dossier = "/sys/class/net/"
            cartes = sorted(os.listdir(dossier), key=lambda c: not os.path.exists(dossier + c + "/device"))
            for carte in cartes:
                if carte == "lo":
                    continue
                try:
                    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                        ip = socket.inet_ntoa(fcntl.ioctl(s.fileno(), 0x8915, struct.pack("256s", carte[:15].encode()))[20:24])
                    if not ip.startswith("127."):
                        ips.append(ip)
                except OSError:
                    pass
        except Exception:
            pass
    if not ips:
        try:
            for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
                if not info[4][0].startswith("127."):
                    ips.append(info[4][0])
        except OSError:
            pass
    vues = set()
    return [ip for ip in ips if not (ip in vues or vues.add(ip))]
```

La boucle sur `/sys/class/net/` et ses repli viennent de `run_server` (`web/serveur.py` de l'atelier, fonction interne `_get_local_ips`), sans le dernier recours vers 8.8.8.8.

- [ ] **Étape 4 : écrire `serveur/__main__.py`**

```python
"""Lancement : python -m serveur [--port N] [--ssl] [--no-browser].

Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
Licence : GPL-3.0-or-later
"""

import argparse
import threading
import webbrowser

from serveur import certificat, config
from serveur.serveur import adresses_locales, creer_serveur


def main():
    options = argparse.ArgumentParser(prog="albert-go")
    options.add_argument("--port", type=int, default=8913)
    options.add_argument("--ssl", action="store_true", help="HTTPS avec un certificat auto-signé")
    options.add_argument("--no-browser", action="store_true", help="ne pas ouvrir le navigateur")
    args = options.parse_args()
    utiliser_ssl = args.ssl and certificat.generer_certificat()
    try:
        serveur = creer_serveur(args.port, utiliser_ssl)
    except OSError:
        print(f"Erreur : le port {args.port} est déjà utilisé. Essayez --port {args.port + 1}.")
        return
    protocole = "https" if utiliser_ssl else "http"
    print("Albert Go démarré")
    print(f"  Local   : {protocole}://localhost:{args.port}")
    for ip in adresses_locales():
        print(f"  Réseau  : {protocole}://{ip}:{args.port}")
    print(f"  {config.config_affichee()}")
    cles = len(config.load_web_keys())
    print(f"  Clés API : {cles}" if cles else f"  Aucune clé API : ajoutez-en une dans {config.KEYS_FILE}")
    print("Ctrl+C pour arrêter")
    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open, [f"{protocole}://localhost:{args.port}"]).start()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrêté.")
        serveur.server_close()


main()
```

- [ ] **Étape 5 : `local.sh` lance le serveur**

Remplacer tout le contenu de `local.sh` par :

```sh
#!/bin/sh
#
# Nom : local.sh
# Description : Lance le serveur d'Albert Go (crée .venv au premier lancement).
# Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
# Auteur : O. Booklage
# Licence : GPL-3.0-or-later
#
# Options transmises au serveur : --port N, --ssl, --no-browser.
#
set -eu

DOSSIER="$(cd "$(dirname "$0")" && pwd)"
if [ ! -x "$DOSSIER/.venv/bin/python" ]; then
    python3 -m venv "$DOSSIER/.venv"
    "$DOSSIER/.venv/bin/python" -m pip install -q -r "$DOSSIER/serveur/requirements.txt"
fi
cd "$DOSSIER"
exec .venv/bin/python -m serveur "$@"
```

- [ ] **Étape 6 : vérifier**

Run : `.venv/bin/python -m pytest tests/python -q`
Attendu : tous les tests passent (`test_serveur.py` : 8 tests).

Puis, avec une vraie clé dans `~/.config/albert-go/keys` (demander l'accord de l'utilisateur avant tout appel à Albert) : `./local.sh --no-browser`, ouvrir `http://localhost:8913`. La page s'affiche ; les appels à Albert ne marchent qu'après les Tâches 5 et 6.

- [ ] **Étape 7 : commit**

```bash
git add serveur/serveur.py serveur/__main__.py local.sh tests/python/test_serveur.py
git commit -m "feat(serveur): Serveur HTTP de public/ et lancement par local.sh"
```

---

### Tâche 5 : la page appelle le serveur, sans clé

**Fichiers :**
- Modifier : `public/js/albert.js`, `public/js/tools/recherche/outils-modele.js`, `public/js/app.js:171-172`, `public/js/redaction.js:149`, `public/js/piece-jointe.js:288,303`, `public/js/reglages.js:66-92`
- Test : `tests/albert.test.js`

**Interfaces :**
- Produit : `Albert.modeles()`, `Albert.repondre(requete, annulation)`, `Albert.transcrire(dataUrl, annulation)`, `Albert.transcrireAudio(audio, nom, annulation)`, `repondreAvecOutils(requete, signal)` : plus de paramètre `cle`, plus d'en-tête `Authorization`.

- [ ] **Étape 1 : adapter les tests**

Dans `tests/albert.test.js` :
- supprimer le test `repondre : relais bloqué, la sonde /stats arrête la requête` ;
- supprimer le test `appels : somme des jours et moyenne horaire depuis le premier jour` ;
- remplacer partout `Albert.repondre('cle', ` par `Albert.repondre(` ;
- ajouter :

```javascript
test('repondre : appelle /v1 du serveur, sans clé', async () => {
    const avant = globalThis.fetch;
    let appel = null;
    globalThis.fetch = async (url, options) => {
        appel = { url, options };
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    };
    try {
        await Albert.repondre({ model: 'm', messages: [] }, new AbortController().signal);
        assert.strictEqual(appel.url, '/v1/chat/completions');
        assert.strictEqual(appel.options.headers.Authorization, undefined);
    } finally {
        globalThis.fetch = avant;
    }
});
```

- [ ] **Étape 2 : vérifier l'échec**

Run : `node --test tests/albert.test.js`
Attendu : le nouveau test échoue (URL du relais n8n).

- [ ] **Étape 3 : modifier `public/js/albert.js`**

- En-tête : remplacer `Albert ne gère pas CORS : toutes les requêtes passent par le relais n8n.` par `Toutes les requêtes passent par le serveur d'Albert Go (serveur/), qui ajoute la clé.` et la ligne de licence par `Licence : GPL-3.0-or-later`.
- Remplacer les lignes 18-31 (`BASE` à `SONDE_MS`) par :

```javascript
    /** Relais du serveur d'Albert Go, qui ajoute la clé. */
    BASE: '/v1',

    /** Délai maximal d'une réponse, en millisecondes. */
    DELAI_MS: 120000,
```

- `modeles(cle)` devient `modeles()` ; retirer `headers: { 'Authorization': 'Bearer ' + cle },` et la ligne `@param {string} cle` de sa documentation.
- Supprimer la méthode `appels()` entière, avec son commentaire.
- `repondre(cle, requete, annulation)` devient :

```javascript
    async repondre(requete, annulation) {
        const res = await fetch(this.BASE + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.plafonnee(requete)),
            signal: AbortSignal.any([annulation, AbortSignal.timeout(this.DELAI_MS)])
        });
        const corps = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(this.messageErreur(res.status, corps));
        }
```

  la suite (contrôle de `choix` et `return`) ne change pas ; retirer `@param {string} cle` de la documentation.
- `transcrire(cle, dataUrl, annulation)` devient `transcrire(dataUrl, annulation)` et appelle `this.repondre({ ... }, annulation)`.
- `transcrireAudio(cle, audio, nom, annulation)` devient `transcrireAudio(audio, nom, annulation)` ; retirer la ligne `headers: { 'Authorization': 'Bearer ' + cle },`.
- `messageErreur` : remplacer le commentaire `/* Le reverse proxy répond seul quand n8n est arrêté. */` par `/* Le serveur répond 502 quand Albert ne répond pas. */`.

- [ ] **Étape 4 : modifier les appelants**

- `public/js/tools/recherche/outils-modele.js` : `async function repondreAvecOutils(requete, signal)` ; retirer `@param {string} cle - Clé API Albert.` ; remplacer partout `Albert.repondre(cle, ` par `Albert.repondre(`.
- `public/js/app.js:172` : `return envoi(reglages.cle, {` devient `return envoi({`.
- `public/js/redaction.js:149` : `Albert.repondre(reglages.cle, {` devient `Albert.repondre({`.
- `public/js/piece-jointe.js:288` : `Albert.transcrire(image, signal)` ; ligne 303 : `Albert.transcrireAudio(audio, mp3 ? fichier.name : 'audio.wav', signal)`.
- `public/js/reglages.js`, `chargerModeles` : remplacer le corps par

```javascript
async function chargerModeles() {
    try {
        const liste = await Albert.modeles();
        if (!liste.length) {
            return;
        }
        modelesDispo = liste;
        afficherModeles();
        afficherReglages();
    } catch (err) {
        /* Clé du serveur refusée : le dire ; injoignable : la liste de secours reste. */
        if (err.status === 401 || err.status === 403) {
            toast(err.message);
        }
    }
}
```

  et son commentaire de tête par `Charge la liste réelle des modèles au démarrage. Serveur ou Albert injoignable : la liste de secours reste.`

- [ ] **Étape 5 : vérifier**

Run : `grep -rn "reglages.cle\b\|Albert\.\(repondre\|modeles\|transcrire\|transcrireAudio\)(cle\|repondreAvecOutils(cle" public/js tests ; node --test tests/*.test.js`
Attendu : grep ne trouve que `public/js/cle.js` (supprimé en Tâche 6) et les lignes de `app.js`, `affichage.js`, `menu.js`, `projet.js`, `stockage.js` traitées en Tâche 6 ; tous les tests Node passent.

- [ ] **Étape 6 : commit**

```bash
git add public/js tests/albert.test.js
git commit -m "feat(page): Appels à Albert par le serveur, sans clé dans la page"
```

---

### Tâche 6 : plus d'écran de clé ni de surveillance du relais n8n

**Fichiers :**
- Supprimer : `public/js/cle.js`
- Modifier : `public/index.html`, `public/js/app.js`, `public/js/affichage.js:63-85`, `public/js/menu.js:131,176-262`, `public/js/projet.js:58`, `public/js/stockage.js:79,272`, `public/js/langues/{fr,en,es,de}.js`
- Test : `tests/i18n.test.js` (existant, mêmes clés dans les quatre langues), essai dans le navigateur

**Interfaces :**
- Consomme : l'API sans clé de la Tâche 5.
- Produit : page toujours "connectée" ; `ouvrirPartage()` partage `location.origin + '/'` (remplacé en MR 3 par les adresses réseau).

- [ ] **Étape 1 : `index.html`**

Supprimer :
- la `<section id="accueil" ...>` entière (lignes 297-315) ;
- les `<dialog id="dialogue-cle">`, `<dialog id="bienvenue-cle">` et `<dialog id="confirmer-cle">` entiers, avec le commentaire qui précède `bienvenue-cle` ;
- dans le menu, `<hr id="trait-cle" hidden>` et le bouton `id="changer-cle"` (lignes 231-238) ;
- dans `<dialog id="info">`, la ligne `<p id="appels" hidden></p>` ;
- la balise `<script src="js/cle.js?v=dev"></script>` ;
- `git rm public/js/cle.js`.

- [ ] **Étape 2 : `app.js`**

- Supprimer `messageOrigine`, `RELAIS_MS`, `relaisEnPanne`, `minuteurRelais`, `verifierRelais` et `signalerPanneRelais` (lignes 19-65 environ, du commentaire de `messageOrigine` jusqu'à la fin de `signalerPanneRelais`).
- `messageEchec` devient :

```javascript
function messageEchec(err) {
    if (err instanceof TypeError) {
        return { texte: t(navigator.onLine ? 'erreur.relais' : 'erreur.hors-ligne'), lien: null };
    }
    if (err.name === 'TimeoutError') {
        return { texte: t('erreur.timeout'), lien: null };
    }
    return { texte: err.message, lien: null };
}
```

  et son commentaire perd les phrases sur CORS et l'adresse publique : `Message d'erreur à afficher après un échec d'envoi.`
- Au démarrage, supprimer le bloc `Albert.appels().catch(...)` et son commentaire, et le bloc `if (!Albert.ORIGINES.includes(location.origin)) { ... }` et son commentaire ; `if (reglages.cle) { rouvrirCourante(); }` devient `rouvrirCourante();`.

- [ ] **Étape 3 : `affichage.js`, `menu.js`, `projet.js`, `stockage.js`**

- `affichage.js`, `afficher()` :

```javascript
/**
 * Affiche la conversation ou la rédaction, selon le module.
 */
function afficher() {
    const redaction = outilActuel === 'rediger';
    $('chat').hidden = redaction;
    $('saisie-zone').hidden = redaction;
    $('redaction').hidden = !redaction;
    /* Masquées dans index.html au chargement, comme avant avec l'écran de clé. */
    for (const id of ['ouvrir-reglages', 'nouvelle', 'resume-reglages', 'trait-outils', 'menu-outils', 'menu-projets', 'trait-historique', 'menu-historique', 'titre-entete']) {
        $(id).hidden = false;
    }
    focusSaisie();
    placerBibliotheque();
}
```

- `menu.js:131` : retirer `reglages.cle && ` de la condition.
- `menu.js`, `ouvrirPartage` : `const adresse = location.origin + '/';` ; commentaire de tête : `Ouvre la boîte "Partager" avec l'adresse de la page et son QR code.` (retirer la phrase sur l'adresse publique).
- `menu.js` : supprimer `motAppel` et sa documentation ; dans le clic sur `ouvrir-info`, supprimer les lignes `$('appels')...` et l'appel `Albert.appels().then(...).catch(...)` ; supprimer les écouteurs de `changer-cle` et de `confirmer-cle`.
- `projet.js:58` : retirer `!!reglages.cle && `.
- `stockage.js:79` : retirer `'cle', ` de `SENSIBLES` ; ligne 272 : supprimer `cle: lire('cle', null),`.

- [ ] **Étape 4 : textes**

Dans les quatre fichiers `public/js/langues/*.js`, supprimer les clés : `menu.changer-cle`, toutes les `cle.*` (`cle.intro`, `cle.etape-acces`, `cle.etape-saisie`, `cle.exemple`, `cle.souvenir`, `cle.ou-va`, `cle.saisir`, `cle.titre-boite`, `cle.titre`, `cle.bienvenue`, `cle.label`, `cle.stockee`, `cle.demander`, `cle.verification`), `confirmer-changer-cle.titre`, `confirmer-changer-cle.texte`, `info.appels`, `info.appels-hs`, `info.appel`, `info.appels.pluriel`, `toast.cle-effacee`, `toast.relais-retabli`, `erreur.origine`.

Remplacer :

| Clé | fr | en | es | de |
|---|---|---|---|---|
| `erreur.relais` | `Le serveur d'Albert Go ne répond plus, réessayer plus tard.` | `The Albert Go server is no longer responding, try again later.` | `El servidor de Albert Go ya no responde, volver a intentarlo más tarde.` | `Der Albert-Go-Server antwortet nicht mehr, später erneut versuchen.` |
| `erreur.relais-hs` | `Albert ne répond pas. Réessayez plus tard.` | `Albert is not responding. Try again later.` | `Albert no responde. Vuelva a intentarlo más tarde.` | `Albert antwortet nicht. Versuchen Sie es später erneut.` |
| `erreur.cle-refusee` | `Clé du serveur refusée par Albert : vérifiez le fichier keys.` | `Server key refused by Albert: check the keys file.` | `Clave del servidor rechazada por Albert: revise el archivo keys.` | `Serverschlüssel von Albert abgelehnt: prüfen Sie die Datei keys.` |

Puis chercher les restes :

```bash
grep -rn "cle\.\(intro\|titre\|saisir\|bienvenue\)\|changer-cle\|confirmer-cle\|dialogue-cle\|bienvenue-cle\|ouvrir-cle\|annuler-cle\|partage-accueil\|'accueil'\|appels\|ORIGINES\|URL_PUBLIQUE\|n8n" public/js public/index.html
```

Attendu : rien, sauf des commentaires qui citent encore n8n (par exemple `piece-jointe.js:47`, limite de 16 Mo) : les réécrire pour le serveur (`le serveur refuse au-delà de 16 Mo`).

- [ ] **Étape 5 : vérifier**

Run : `node --test tests/*.test.js`
Attendu : tous les tests passent, dont `tests/i18n.test.js` (mêmes clés dans les quatre langues).

Essai dans le navigateur (`./local.sh`, clé dans `~/.config/albert-go/keys`, accord de l'utilisateur avant l'appel à Albert) : la page s'ouvre sur la conversation, sans écran de clé ; une question reçoit sa réponse ; serveur arrêté, une question affiche `Le serveur d'Albert Go ne répond plus, réessayer plus tard.`

- [ ] **Étape 6 : commit**

```bash
git add -A public
git commit -m "feat(page): Plus d'écran de clé ni de surveillance du relais n8n"
```

---

### Tâche 7 : licence GPL, CI et README

**Fichiers :**
- Modifier : `LICENSE`, en-têtes des fichiers de `public/js`, `public/styles`, `public/sw.js`, `README.md`, `.gitlab-ci.yml`

- [ ] **Étape 1 : licence**

```bash
cp ~/Documents/GitForge/albert-atelier/LICENSE LICENSE
grep -rl "Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0" public local.sh tests | xargs sed -i 's/Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0/Licence : GPL-3.0-or-later/'
grep -rn "Licence Ouverte\|etalab-2.0" --include=*.js --include=*.css --include=*.html --include=*.sh . | grep -v "^./public/vendor\|^./node_modules"
```

Attendu : la dernière commande ne liste que des mentions de licences de tiers (logos, polices), à garder.

- [ ] **Étape 2 : CI**

Dans `.gitlab-ci.yml` :
- supprimer le job `pages` et son commentaire (le site en ligne reste à sa dernière version jusqu'à la MR 4) ;
- ajouter :

```yaml
# À chaque MR : tests du serveur Python.
tests-serveur:
  image: python:3.12-slim
  script:
    - pip install -q -r serveur/requirements.txt pytest
    - python -m pytest -q
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
```

- [ ] **Étape 3 : README**

- Sous le titre, remplacer la ligne "Essayer Albert Go en ligne" et le paragraphe sur la clé de chaque utilisateur par :

```markdown
Albert Go tourne sur un serveur : un poste de l'établissement, ou une clé USB (à venir). Le serveur garde la clé API et relaie les questions vers Albert.

## Lancer le serveur

    ./local.sh                # http://localhost:8913, ouvre le navigateur
    ./local.sh --no-browser   # sans ouvrir le navigateur
    ./local.sh --ssl          # HTTPS, certificat auto-signé

Clé API : une par ligne dans `~/.config/albert-go/keys` (plusieurs clés servent à tour de rôle). Les clés s'obtiennent sur la [page d'Albert API](https://ia.numerique.gouv.fr/outils-ia/albert-api/). Le fichier `~/.config/albert-go/config` règle l'URL d'Albert (`api_base=`) ; le terminal affiche au lancement le fichier utilisé.
```

- Section Licence : GPL v3+, avec la mention "Le serveur reprend le code de L'Atelier d'Albert, écrit avec Romain P., Luce P.B. et Théossian S.D. (NSI, Trophées NSI 2026)."
- Retirer du README les passages sur le relais n8n et sur la saisie de la clé dans la page : `grep -n "n8n\|relais\|votre clé\|saisi" README.md` pour les trouver.

- [ ] **Étape 4 : vérifier**

Run : `.venv/bin/python -m pytest -q && node --test tests/*.test.js`
Attendu : tout passe.

- [ ] **Étape 5 : commit**

```bash
git add LICENSE README.md .gitlab-ci.yml public local.sh tests
git commit -m "chore: Passage en GPL v3+, tests du serveur en CI, fin de Pages"
```

---

## Après la MR 1

MR 2 (niveau, matière, programmes) branche sa consigne dans `relais.relayer`, juste avant l'envoi, pour la route `/v1/chat/completions` ; MR 3 réutilise `adresses_locales()` pour Partager.
