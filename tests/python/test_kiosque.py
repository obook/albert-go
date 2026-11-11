"""Tests de serveur/kiosque.py : sessions, cookies signés, réglages du prof."""

import time
from types import SimpleNamespace

import pytest

from serveur import kiosque


@pytest.fixture(autouse=True)
def sans_session():
    kiosque.terminer_session()
    yield
    kiosque.terminer_session()


def test_session_et_code():
    token, code = kiosque.creer_session("sk-prof", "1h")
    assert kiosque.session_active()
    assert len(code) == 4 and code.isdigit()
    assert kiosque.cle_api() == "sk-prof"
    assert kiosque.verifier_code(token, code)
    assert not kiosque.verifier_code(token, "9999" if code != "9999" else "0000")
    assert not kiosque.verifier_code("autre", code)
    assert 3500 < kiosque.temps_restant() <= 3600


def test_duree_inconnue_deux_heures():
    kiosque.creer_session("sk", "1 an")
    assert 7100 < kiosque.temps_restant() <= 7200


def test_cookie_signe_par_role():
    kiosque.creer_session("sk", "1h")
    assert kiosque.role_du_cookie(kiosque.cookie("enseignant")) == "enseignant"
    assert kiosque.role_du_cookie(kiosque.cookie("eleve")) == "eleve"
    assert kiosque.role_du_cookie(kiosque.cookie("pirate")) == "eleve"


def test_role_falsifie_refuse():
    kiosque.creer_session("sk", "1h")
    token, _, signature = kiosque.cookie("eleve").split(".")
    assert kiosque.role_du_cookie(f"{token}.enseignant.{signature}") is None
    assert kiosque.role_du_cookie("n.importe.quoi") is None
    assert kiosque.role_du_cookie("é.é.é") is None


def test_cookie_d_une_ancienne_session_refuse():
    kiosque.creer_session("sk", "1h")
    ancien = kiosque.cookie("enseignant")
    kiosque.creer_session("sk", "1h")
    assert kiosque.role_du_cookie(ancien) is None


def test_session_expiree(monkeypatch):
    kiosque.creer_session("sk", "1h")
    valeur = kiosque.cookie("eleve")
    reel = time.time
    monkeypatch.setattr(kiosque.time, "time", lambda: reel() + 4000)
    assert not kiosque.session_active()
    assert kiosque.cle_api() is None
    assert kiosque.role_du_cookie(valeur) is None


def test_infos_enseignant():
    token, code = kiosque.creer_session("sk", "1h")
    assert kiosque.infos_enseignant() == {"token": token, "code": code}
    kiosque.terminer_session()
    assert kiosque.infos_enseignant() is None


def test_reglages_avec_identifiant_de_session():
    kiosque.creer_session("sk", "1h")
    assert kiosque.enregistrer_reglages({"temperature": 0.5})
    reglages = kiosque.reglages()
    assert reglages["temperature"] == 0.5
    assert isinstance(reglages["session"], int)


def test_reglages_bornes():
    propres = kiosque.valider_reglages({
        "modele": "openweight-large", "temperature": 1e309, "topK": 999, "echanges": -3,
        "recherche": True, "calcul": False, "tirage": "oui", "ecritureSoignee": False, "styleDirect": True, "sansRedite": True,
        "fournisseurs": ["wikipedia", "HAL!", "vikidia", "hal", "mojeek"],
        "inconnu": 1,
    })
    assert propres == {"modele": "openweight-large", "topK": 50, "echanges": 0,
                       "recherche": True, "calcul": False, "ecritureSoignee": False, "styleDirect": True, "sansRedite": True, "fournisseurs": ["wikipedia", "vikidia", "hal"]}
    assert kiosque.valider_reglages({"modele": "x" * 10000, "temperature": True}) == {}
    assert kiosque.valider_reglages({"temperature": 7}) == {"temperature": 2}
    assert kiosque.valider_reglages({"nom": " Mythos 5.2 "}) == {"nom": "Mythos 5.2"}
    assert kiosque.valider_reglages({"nom": "x" * 50})["nom"] == "x" * 12
    assert kiosque.valider_reglages({"nom": "a\nb"}) == {}


def test_code_faux_ralenti_et_en_file(monkeypatch):
    """10 000 codes à essayer : un code faux coûte une pause, les essais passent un par un."""
    from concurrent.futures import ThreadPoolExecutor
    monkeypatch.setattr(kiosque, "PAUSE_CODE_FAUX", 0.3)
    token, code = kiosque.creer_session("sk", "1h")
    faux = "0000" if code != "0000" else "1111"
    debut = time.monotonic()
    with ThreadPoolExecutor(2) as groupe:
        assert list(groupe.map(lambda _: kiosque.verifier_code(token, faux), range(2))) == [False, False]
    assert time.monotonic() - debut >= 0.6


def test_cle_acceptee_bascule_sans_proxy_sur_407(albert, monkeypatch):
    """Proxy du réseau qui répond 407 : un second essai sans proxy, comme le relais."""
    from serveur import proxy
    monkeypatch.setattr(proxy, "_ignorer_proxy", False)
    reponses = iter([407, 200])
    def modeles(gestionnaire):
        gestionnaire.send_response(next(reponses))
        gestionnaire.end_headers()
    albert.reponses["/v1/models"] = modeles
    assert kiosque.cle_acceptee("sk-prof")
    assert len(albert.recues) == 2


def test_cle_non_ascii_refusee_sans_appel(albert):
    """Clé collée avec un caractère invisible : refusée proprement, rien ne part chez Albert."""
    assert not kiosque.cle_acceptee("sk-​abc")
    assert albert.recues == []


def test_cookie_lu_malgre_un_cookie_mal_forme_d_une_autre_appli():
    # Sur localhost, le navigateur envoie aussi les cookies des autres applis locales.
    requete = lambda entete: SimpleNamespace(headers={"Cookie": entete})
    assert kiosque.valeur_cookie(requete('prefs={"a":1,"b":2}; kiosque-session=jeton.eleve.sig')) == "jeton.eleve.sig"
    assert kiosque.valeur_cookie(requete("theme=sombre")) is None
    assert kiosque.valeur_cookie(SimpleNamespace(headers={})) is None
