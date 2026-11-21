# Projet : Albert Go, https://github.com/obook/albert-go
# Repris de L'Atelier d'Albert (Romain P., Luce P.B., Théossian S.D., O. Booklage)
# Licence : GPL-3.0-or-later
"""Tests du module serveur/certificat.py : certificat HTTPS auto-signé.

Vérifie la génération, la détection et le fallback du certificat
utilisé par le serveur web pour le HTTPS.

Projet N°1717 de la classe de NSI-1.1 pour les Trophées NSI 2026
"""

import os
import shutil
import subprocess
from unittest.mock import patch, MagicMock

import pytest

from serveur.certificat import (
    certificat_existe,
    generer_certificat,
    _certificat_expire,
    _obtenir_ip_locale,
    DUREE_VALIDITE,
)

# Marqueur pour les tests qui invoquent réellement openssl
necessite_openssl = pytest.mark.skipif(
    shutil.which("openssl") is None,
    reason="openssl n'est pas installé sur cette machine",
)


class TestCertificatExiste:
    """Tests de certificat_existe()."""

    def test_aucun_fichier(self, tmp_path):
        """Retourne False si aucun fichier n'existe."""
        cert = str(tmp_path / "cert.pem")
        key = str(tmp_path / "key.pem")
        with patch("serveur.certificat.CERT_FILE", cert), \
             patch("serveur.certificat.KEY_FILE", key):
            assert certificat_existe() is False

    def test_certificat_seul(self, tmp_path):
        """Retourne False si seul le certificat existe."""
        cert = tmp_path / "cert.pem"
        cert.write_text("cert")
        key = str(tmp_path / "key.pem")
        with patch("serveur.certificat.CERT_FILE", str(cert)), \
             patch("serveur.certificat.KEY_FILE", key):
            assert certificat_existe() is False

    def test_cle_seule(self, tmp_path):
        """Retourne False si seule la clé existe."""
        cert = str(tmp_path / "cert.pem")
        key = tmp_path / "key.pem"
        key.write_text("key")
        with patch("serveur.certificat.CERT_FILE", cert), \
             patch("serveur.certificat.KEY_FILE", str(key)):
            assert certificat_existe() is False

    def test_deux_fichiers_presents(self, tmp_path):
        """Retourne True si les deux fichiers existent."""
        cert = tmp_path / "cert.pem"
        key = tmp_path / "key.pem"
        cert.write_text("cert")
        key.write_text("key")
        with patch("serveur.certificat.CERT_FILE", str(cert)), \
             patch("serveur.certificat.KEY_FILE", str(key)):
            assert certificat_existe() is True


class TestObtenirIpLocale:
    """Tests de _obtenir_ip_locale()."""

    def test_retourne_une_ip_valide(self):
        """L'IP retournée a le bon format (quatre nombres séparés
        par des points). Le socket est simulé : aucun accès réseau."""
        with patch("socket.socket") as mock_socket:
            socket_simule = mock_socket.return_value.__enter__.return_value
            socket_simule.getsockname.return_value = ("192.168.1.42", 0)
            ip = _obtenir_ip_locale()
        parties = ip.split(".")
        assert len(parties) == 4
        for partie in parties:
            assert partie.isdigit()

    def test_fallback_si_pas_de_reseau(self):
        """Retourne 127.0.0.1 si la connexion réseau échoue."""
        with patch("socket.socket") as mock_socket:
            socket_simule = mock_socket.return_value.__enter__.return_value
            socket_simule.connect.side_effect = OSError
            ip = _obtenir_ip_locale()
        assert ip == "127.0.0.1"


class TestCertificatExpire:
    """Tests de _certificat_expire()."""

    def test_fichier_absent(self, tmp_path):
        """Retourne True si le fichier n'existe pas."""
        cert = str(tmp_path / "inexistant.pem")
        with patch("serveur.certificat.CERT_FILE", cert):
            assert _certificat_expire() is True

    @necessite_openssl
    def test_certificat_valide(self, tmp_path):
        """Retourne False pour un certificat encore valide."""
        cert = str(tmp_path / "cert.pem")
        key = str(tmp_path / "key.pem")
        subprocess.run(
            ["openssl", "req", "-x509", "-newkey", "rsa:2048",
             "-keyout", key, "-out", cert,
             "-days", "365", "-nodes",
             "-subj", "/CN=test"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with patch("serveur.certificat.CERT_FILE", cert):
            assert _certificat_expire() is False

    def test_certificat_expire(self, tmp_path):
        """Retourne True si la date d'expiration est dans le passé."""
        # Créer un vrai fichier pour que os.path.isfile() retourne True
        cert = tmp_path / "cert.pem"
        cert.write_text("dummy")

        # Simuler une sortie openssl avec une date passée
        fausse_sortie = MagicMock()
        fausse_sortie.returncode = 0
        fausse_sortie.stdout = "notAfter=Jan  1 00:00:00 2020 GMT"

        with patch("serveur.certificat.CERT_FILE", str(cert)), \
             patch("subprocess.run", return_value=fausse_sortie):
            assert _certificat_expire() is True

    def test_fichier_invalide(self, tmp_path):
        """Retourne True si le fichier n'est pas un vrai certificat."""
        cert = tmp_path / "cert.pem"
        cert.write_text("ceci n'est pas un certificat")
        with patch("serveur.certificat.CERT_FILE", str(cert)):
            assert _certificat_expire() is True


class TestGenererCertificat:
    """Tests de generer_certificat()."""

    @necessite_openssl
    def test_generation_cree_les_fichiers(self, tmp_path):
        """La génération crée cert.pem et key.pem."""
        cert = str(tmp_path / "cert.pem")
        key = str(tmp_path / "key.pem")
        with patch("serveur.certificat.CERT_FILE", cert), \
             patch("serveur.certificat.KEY_FILE", key), \
             patch("serveur.certificat.CONFIG_DIR",
                   str(tmp_path)):
            resultat = generer_certificat()

        assert resultat is True
        assert os.path.isfile(cert)
        assert os.path.isfile(key)

    @necessite_openssl
    def test_certificat_valide_openssl(self, tmp_path):
        """Le certificat généré est lisible par openssl."""
        cert = str(tmp_path / "cert.pem")
        key = str(tmp_path / "key.pem")
        with patch("serveur.certificat.CERT_FILE", cert), \
             patch("serveur.certificat.KEY_FILE", key), \
             patch("serveur.certificat.CONFIG_DIR",
                   str(tmp_path)):
            generer_certificat()

        # Vérifier que openssl peut lire le certificat
        resultat = subprocess.run(
            ["openssl", "x509", "-in", cert, "-noout", "-subject"],
            capture_output=True, text=True,
        )
        assert resultat.returncode == 0
        assert "albert-atelier" in resultat.stdout

    @necessite_openssl
    def test_certificat_contient_san(self, tmp_path):
        """Le certificat contient localhost dans les noms alternatifs
        (SAN), ce qui permet aux navigateurs de l'accepter."""
        cert = str(tmp_path / "cert.pem")
        key = str(tmp_path / "key.pem")
        with patch("serveur.certificat.CERT_FILE", cert), \
             patch("serveur.certificat.KEY_FILE", key), \
             patch("serveur.certificat.CONFIG_DIR",
                   str(tmp_path)):
            generer_certificat()

        resultat = subprocess.run(
            ["openssl", "x509", "-in", cert, "-noout",
             "-ext", "subjectAltName"],
            capture_output=True, text=True,
        )
        assert "localhost" in resultat.stdout

    @necessite_openssl
    def test_ne_regenere_pas_si_valide(self, tmp_path):
        """Si le certificat existe et n'a pas expiré, le garder."""
        cert = str(tmp_path / "cert.pem")
        key = str(tmp_path / "key.pem")

        # Générer un vrai certificat valide
        with patch("serveur.certificat.CERT_FILE", cert), \
             patch("serveur.certificat.KEY_FILE", key), \
             patch("serveur.certificat.CONFIG_DIR",
                   str(tmp_path)):
            generer_certificat()

        # Noter la date de modification du fichier
        mtime_avant = os.path.getmtime(cert)

        # Relancer : le certificat ne doit pas être régénéré
        with patch("serveur.certificat.CERT_FILE", cert), \
             patch("serveur.certificat.KEY_FILE", key), \
             patch("serveur.certificat.CONFIG_DIR",
                   str(tmp_path)):
            resultat = generer_certificat()

        assert resultat is True
        # Le fichier n'a pas été modifié
        assert os.path.getmtime(cert) == mtime_avant

    @necessite_openssl
    def test_renouvelle_si_expire(self, tmp_path):
        """Si le certificat a expiré, le régénérer automatiquement."""
        cert = str(tmp_path / "cert.pem")
        key = str(tmp_path / "key.pem")

        # Générer un vrai certificat valide d'abord
        with patch("serveur.certificat.CERT_FILE", cert), \
             patch("serveur.certificat.KEY_FILE", key), \
             patch("serveur.certificat.CONFIG_DIR",
                   str(tmp_path)):
            generer_certificat()

        # Noter le contenu original
        contenu_avant = open(cert, "rb").read()

        # Simuler que le certificat a expiré, puis laisser
        # la régénération se faire normalement
        with patch("serveur.certificat.CERT_FILE", cert), \
             patch("serveur.certificat.KEY_FILE", key), \
             patch("serveur.certificat.CONFIG_DIR",
                   str(tmp_path)), \
             patch("serveur.certificat._certificat_expire",
                   return_value=True):
            resultat = generer_certificat()

        assert resultat is True

        # Le certificat a été régénéré (contenu différent)
        contenu_apres = open(cert, "rb").read()
        assert contenu_avant != contenu_apres

    def test_fallback_http_si_echec(self, tmp_path):
        """Si openssl échoue, retourne False pour démarrer en HTTP."""
        cert = str(tmp_path / "cert.pem")
        key = str(tmp_path / "key.pem")
        with patch("serveur.certificat.CERT_FILE", cert), \
             patch("serveur.certificat.KEY_FILE", key), \
             patch("serveur.certificat.CONFIG_DIR",
                   str(tmp_path)), \
             patch("serveur.certificat._generer_avec_openssl",
                   side_effect=RuntimeError("openssl absent")):
            resultat = generer_certificat()

        assert resultat is False
        assert not os.path.isfile(cert)

    @necessite_openssl
    def test_cree_le_dossier_config(self, tmp_path):
        """Crée le dossier de configuration s'il n'existe pas."""
        config_dir = str(tmp_path / "sous" / "dossier")
        cert = os.path.join(config_dir, "cert.pem")
        key = os.path.join(config_dir, "key.pem")
        with patch("serveur.certificat.CERT_FILE", cert), \
             patch("serveur.certificat.KEY_FILE", key), \
             patch("serveur.certificat.CONFIG_DIR",
                   config_dir):
            resultat = generer_certificat()

        assert resultat is True
        assert os.path.isdir(config_dir)
