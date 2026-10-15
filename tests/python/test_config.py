"""Tests de serveur/config.py."""

import os
from unittest.mock import patch

from serveur import config


def _dossier(tmp_path, contenu=None):
    if contenu is not None:
        (tmp_path / ".env").write_text(contenu, encoding="utf-8")
    return patch.object(config, "CONFIG_FILE", str(tmp_path / ".env"))


def test_valeurs_par_defaut(tmp_path):
    with _dossier(tmp_path):
        assert config.load_config() == {
            "api_base": "https://albert.api.etalab.gouv.fr", "kiosque": False, "api_key": "",
            "port": 8913, "https": False}


def test_port_et_https(tmp_path):
    with _dossier(tmp_path, "ALBERT_PORT=8920\nALBERT_HTTPS=oui\n"):
        cfg = config.load_config()
    assert (cfg["port"], cfg["https"]) == (8920, True)
    with _dossier(tmp_path, "ALBERT_PORT=huit\n"):
        assert config.load_config()["port"] == 8913


def test_lecture_et_commentaires(tmp_path):
    with _dossier(tmp_path, "# commentaire\nALBERT_API_URL=http://a=b\nALBERT_KIOSQUE=oui\n"):
        cfg = config.load_config()
    assert cfg["api_base"] == "http://a=b"
    assert cfg["kiosque"] is True


def test_cle_dans_env(tmp_path):
    with _dossier(tmp_path, "#ALBERT_API_KEY=sk-commentee\nALBERT_API_KEY= sk-1 \n"):
        assert config.load_config()["api_key"] == "sk-1"


def test_env_partage_avec_d_autres_outils(tmp_path):
    """Le .env sert aussi à graft : ses lignes sont ignorées, les guillemets retirés."""
    contenu = 'GRAFT_API_KEY=sk-graft\nALBERT_API_KEY="sk-albert"\nALBERT_API_URL=\'https://albert.api.etalab.gouv.fr/v1/\'\n'
    with _dossier(tmp_path, contenu):
        assert config.load_config() == {
            "api_base": "https://albert.api.etalab.gouv.fr", "kiosque": False, "api_key": "sk-albert",
            "port": 8913, "https": False}


def test_ligne_de_lancement_avec_tilde(tmp_path):
    fichier = tmp_path / ".env"
    fichier.write_text("ALBERT_KIOSQUE=oui\n", encoding="utf-8")
    with patch.multiple(config, CONFIG_FILE=str(fichier), MODE="dépôt"), \
         patch.dict(os.environ, {"HOME": str(tmp_path)}):
        assert config.config_affichee() == "Configuration (dépôt) : " + os.path.join("~", ".env")


def test_ligne_de_lancement_fichier_absent(tmp_path):
    fichier = tmp_path / ".env"
    with patch.multiple(config, CONFIG_FILE=str(fichier), MODE="portable"), \
         patch.dict(os.environ, {"HOME": "/ailleurs"}):
        assert config.config_affichee() == f"Configuration (portable) : {fichier} (absent : valeurs par défaut)"


def test_dossier_du_depot_sauf_cle_usb(tmp_path):
    """Le .env est à la racine du dépôt, même absent ; ALBERT_PORTABLE_DIR passe avant."""
    with patch.object(config, "DEPOT", str(tmp_path)), \
         patch.dict(os.environ, {"ALBERT_PORTABLE_DIR": ""}):
        assert config._config_dir() == (str(tmp_path), "dépôt")
        with patch.dict(os.environ, {"ALBERT_PORTABLE_DIR": "/media/cle"}):
            assert config._config_dir() == ("/media/cle", "portable")


def test_cle_corrigee_prise_sans_redemarrer(tmp_path):
    """L'enseignant corrige la clé dans .env : la requête suivante prend la nouvelle."""
    with _dossier(tmp_path, "ALBERT_API_KEY=sk-ancienne\n"):
        assert config.load_config()["api_key"] == "sk-ancienne"
        (tmp_path / ".env").write_text("ALBERT_API_KEY=sk-nouvelle\n", encoding="utf-8")
        assert config.load_config()["api_key"] == "sk-nouvelle"
