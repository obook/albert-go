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
    with patch.multiple(config, CONFIG_FILE=str(fichier), MODE="standard"), \
         patch.dict(os.environ, {"HOME": str(tmp_path)}):
        assert config.config_affichee() == "Configuration (standard) : " + os.path.join("~", "config")


def test_ligne_de_lancement_fichier_absent(tmp_path):
    fichier = tmp_path / "config"
    with patch.multiple(config, CONFIG_FILE=str(fichier), MODE="portable"), \
         patch.dict(os.environ, {"HOME": "/ailleurs"}):
        assert config.config_affichee() == f"Configuration (portable) : {fichier} (absent : valeurs par défaut)"


def test_dossier_du_depot_si_config_ou_keys(tmp_path):
    """Un fichier config ou keys à la racine du dépôt : il passe avant ~/.config/albert-go."""
    depot = tmp_path / "depot"
    depot.mkdir()
    with patch.object(config, "DEPOT", str(depot)), \
         patch.dict(os.environ, {"HOME": str(tmp_path), "ALBERT_PORTABLE_DIR": ""}):
        assert config._config_dir() == (os.path.join(str(tmp_path), ".config", "albert-go"), "standard")
        (depot / "keys").write_text("sk\n", encoding="utf-8")
        assert config._config_dir() == (str(depot), "dépôt")
        with patch.dict(os.environ, {"ALBERT_PORTABLE_DIR": "/media/cle"}):
            assert config._config_dir() == ("/media/cle", "portable")


def test_cle_corrigee_prise_sans_redemarrer(tmp_path):
    """L'enseignant corrige le fichier keys : la clé suivante est la nouvelle."""
    with _dossier(tmp_path, cles="sk-ancienne\n"):
        config.reinitialiser_pour_tests()
        assert config.prochaine_cle() == "sk-ancienne"
        (tmp_path / "keys").write_text("sk-nouvelle\n", encoding="utf-8")
        assert config.prochaine_cle() == "sk-nouvelle"
