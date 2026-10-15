"""Tests de serveur/config.py."""

import os
from unittest.mock import patch

from serveur import config


def _dossier(tmp_path, contenu_config=None):
    if contenu_config is not None:
        (tmp_path / "config").write_text(contenu_config, encoding="utf-8")
    return patch.object(config, "CONFIG_FILE", str(tmp_path / "config"))


def test_valeurs_par_defaut(tmp_path):
    with _dossier(tmp_path):
        assert config.load_config() == {
            "api_base": "https://albert.api.etalab.gouv.fr", "kiosque": False, "api_key": ""}


def test_lecture_et_commentaires(tmp_path):
    with _dossier(tmp_path, contenu_config="# commentaire\napi_base=http://a=b\nkiosque=oui\n"):
        cfg = config.load_config()
    assert cfg["api_base"] == "http://a=b"
    assert cfg["kiosque"] is True


def test_cle_dans_config(tmp_path):
    with _dossier(tmp_path, contenu_config="#api_key=sk-commentee\napi_key= sk-1 \n"):
        assert config.load_config()["api_key"] == "sk-1"


def test_ligne_de_lancement_avec_tilde(tmp_path):
    fichier = tmp_path / "config"
    fichier.write_text("kiosque=oui\n", encoding="utf-8")
    with patch.multiple(config, CONFIG_FILE=str(fichier), MODE="standard"), \
         patch.dict(os.environ, {"HOME": str(tmp_path)}):
        assert config.config_affichee() == "Configuration (standard) : " + os.path.join("~", "config")


def test_ligne_de_lancement_fichier_absent(tmp_path):
    fichier = tmp_path / "config"
    with patch.multiple(config, CONFIG_FILE=str(fichier), MODE="portable"), \
         patch.dict(os.environ, {"HOME": "/ailleurs"}):
        assert config.config_affichee() == f"Configuration (portable) : {fichier} (absent : valeurs par défaut)"


def test_dossier_du_depot_si_config(tmp_path):
    """Un fichier config à la racine du dépôt : il passe avant ~/.config/albert-go."""
    depot = tmp_path / "depot"
    depot.mkdir()
    with patch.object(config, "DEPOT", str(depot)), \
         patch.dict(os.environ, {"HOME": str(tmp_path), "ALBERT_PORTABLE_DIR": ""}):
        assert config._config_dir() == (os.path.join(str(tmp_path), ".config", "albert-go"), "standard")
        (depot / "config").write_text("api_key=sk\n", encoding="utf-8")
        assert config._config_dir() == (str(depot), "dépôt")
        with patch.dict(os.environ, {"ALBERT_PORTABLE_DIR": "/media/cle"}):
            assert config._config_dir() == ("/media/cle", "portable")


def test_cle_corrigee_prise_sans_redemarrer(tmp_path):
    """L'enseignant corrige la clé dans config : la requête suivante prend la nouvelle."""
    with _dossier(tmp_path, contenu_config="api_key=sk-ancienne\n"):
        assert config.load_config()["api_key"] == "sk-ancienne"
        (tmp_path / "config").write_text("api_key=sk-nouvelle\n", encoding="utf-8")
        assert config.load_config()["api_key"] == "sk-nouvelle"
