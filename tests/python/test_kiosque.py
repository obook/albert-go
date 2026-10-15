"""Tests de serveur/kiosque.py : sessions, cookies signés, réglages du prof."""

import time

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
        "recherche": True, "calcul": False, "tirage": "oui",
        "fournisseurs": ["wikipedia", "HAL!", "vikidia", "hal", "mojeek"],
        "inconnu": 1,
    })
    assert propres == {"modele": "openweight-large", "topK": 50, "echanges": 0,
                       "recherche": True, "calcul": False, "fournisseurs": ["wikipedia", "vikidia", "hal"]}
    assert kiosque.valider_reglages({"modele": "x" * 10000, "temperature": True}) == {}
    assert kiosque.valider_reglages({"temperature": 7}) == {"temperature": 2}
