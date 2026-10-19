# Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
# Repris de L'Atelier d'Albert (Romain P., Luce P.B., Théossian S.D., O. Booklage)
# Licence : GPL-3.0-or-later
"""Tests du module api/proxy.py -- bascule sans proxy en cas de 407.

Sur certains réseaux d'administration, le proxy système exige une
authentification : la première requête échoue en 407 et le client
doit réessayer sans proxy, puis mémoriser ce choix pour la session.
"""

from unittest.mock import MagicMock, patch

import httpx
import pytest

from serveur import proxy


@pytest.fixture(autouse=True)
def bascule_desactivee():
    """Chaque test démarre et finit avec la bascule désactivée."""
    proxy._ignorer_proxy = False
    yield
    proxy._ignorer_proxy = False


# --- Activation de la bascule ---


class TestBasculerSansProxy:
    """Tests de basculer_sans_proxy()."""

    def test_premiere_activation(self):
        """La première activation renvoie True (l'appelant doit réessayer)."""
        assert proxy.basculer_sans_proxy() is True

    def test_deja_active(self):
        """Une bascule déjà active renvoie False (l'échec a une autre cause)."""
        proxy.basculer_sans_proxy()
        assert proxy.basculer_sans_proxy() is False


# --- Fabrique de clients ---


class TestCreerClientHttp:
    """Tests de creer_client_http()."""

    def test_avec_proxy_par_defaut(self):
        """Sans bascule, le client respecte le proxy système (trust_env)."""
        with patch("serveur.proxy.httpx.Client") as mock_client:
            proxy.creer_client_http(5.0)
        mock_client.assert_called_once_with(timeout=5.0, trust_env=True)

    def test_sans_proxy_apres_bascule(self):
        """Après la bascule, le client ignore le proxy système."""
        proxy.basculer_sans_proxy()
        with patch("serveur.proxy.httpx.Client") as mock_client:
            proxy.creer_client_http(5.0)
        mock_client.assert_called_once_with(timeout=5.0, trust_env=False)


# --- Test de l'accès direct ---


PROXY_SYSTEME = {"https": "http://artica:3128"}


class TestTesterAccesDirect:
    """Tests de tester_acces_direct()."""

    @pytest.fixture(autouse=True)
    def pas_encore_teste(self):
        """Le conftest neutralise le test : on le réactive ici."""
        proxy._acces_teste = False

    def test_direct_ok_ignore_le_proxy(self):
        """Albert répond en direct (même en 401) : le proxy est ignoré."""
        with patch("serveur.proxy.urllib.request.getproxies", return_value=PROXY_SYSTEME), \
             patch("serveur.proxy.httpx.Client") as mock_client:
            proxy.tester_acces_direct("https://api.example.com")
        mock_client.assert_called_once_with(timeout=5.0, trust_env=False)
        assert proxy._ignorer_proxy is True

    def test_direct_ko_garde_le_proxy(self):
        """Le direct ne passe pas : le proxy système reste en place."""
        with patch("serveur.proxy.urllib.request.getproxies", return_value=PROXY_SYSTEME), \
             patch("serveur.proxy.httpx.Client") as mock_client:
            mock_client.return_value.__enter__.return_value.get.side_effect = httpx.ConnectTimeout("délai")
            proxy.tester_acces_direct("https://api.example.com")
        assert proxy._ignorer_proxy is False

    def test_sans_proxy_systeme_aucun_test(self):
        """Sans proxy déclaré, aucune requête n'est envoyée."""
        with patch("serveur.proxy.urllib.request.getproxies", return_value={}), \
             patch("serveur.proxy.httpx.Client") as mock_client:
            proxy.tester_acces_direct("https://api.example.com")
        mock_client.assert_not_called()
        assert proxy._ignorer_proxy is False

    def test_un_seul_test_par_processus(self):
        """Le deuxième appel ne refait pas le test."""
        with patch("serveur.proxy.urllib.request.getproxies", return_value=PROXY_SYSTEME), \
             patch("serveur.proxy.httpx.Client") as mock_client:
            mock_client.return_value.__enter__.return_value.get.side_effect = httpx.ConnectTimeout("délai")
            proxy.tester_acces_direct("https://api.example.com")
            proxy.tester_acces_direct("https://api.example.com")
        mock_client.assert_called_once()
