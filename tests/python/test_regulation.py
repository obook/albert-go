# Projet : Albert Go, https://github.com/obook/albert-go
# Repris de L'Atelier d'Albert (Romain P., Luce P.B., Théossian S.D., O. Booklage)
# Licence : GPL-3.0-or-later
"""Tests du module serveur/regulation.py : régulation du débit par modèle."""

from serveur.regulation import (
    FenetreGlissante,
    Throttler,
    est_quota_journalier,
    obtenir_throttler,
    reinitialiser_pour_tests,
)


# --- Détection des messages de quota journalier ---


class TestEstQuotaJournalier:
    """Distinction quota journalier vs rate-limit minute."""

    def test_input_tokens_per_day(self):
        """Albert renvoie ce libellé quand le TPD est dépassé."""
        assert est_quota_journalier("2460000 input tokens per day exceeded") is True

    def test_tokens_per_day(self):
        assert est_quota_journalier("tokens per day exceeded") is True

    def test_requests_per_day(self):
        assert est_quota_journalier("1000 requests per day") is True

    def test_requests_per_minute(self):
        """Un rate-limit minute n'est pas un quota journalier."""
        assert est_quota_journalier("50 requests per minute") is False

    def test_chaine_vide(self):
        assert est_quota_journalier("") is False

    def test_none(self):
        assert est_quota_journalier(None) is False

    def test_casse_indifferente(self):
        assert est_quota_journalier("REQUESTS PER DAY") is True


# --- Fenêtre glissante ---


class TestFenetreGlissante:
    """Compteur sur fenêtre glissante de N secondes."""

    def test_total_initial(self):
        f = FenetreGlissante(fenetre=60.0)
        assert f.total() == 0

    def test_ajout_simple(self):
        f = FenetreGlissante(fenetre=60.0)
        f.ajouter(1)
        f.ajouter(1)
        assert f.total() == 2

    def test_purge_apres_fenetre(self):
        """Les événements anciens sortent de la fenêtre."""
        import time
        f = FenetreGlissante(fenetre=0.05)
        f.ajouter(3)
        time.sleep(0.1)
        assert f.total() == 0

    def test_secondes_avant_liberation_vide(self):
        f = FenetreGlissante(fenetre=60.0)
        assert f.secondes_avant_liberation() == 0.0

    def test_secondes_avant_liberation(self):
        f = FenetreGlissante(fenetre=60.0)
        f.ajouter(1)
        # Le délai jusqu'au prochain slot est <= fenêtre
        delai = f.secondes_avant_liberation()
        assert 0 < delai <= 60.0


# --- Throttler ---


class TestThrottler:
    """Une fenêtre par modèle, rpm tirés d'une table, blocage plafonné."""

    def setup_method(self):
        reinitialiser_pour_tests()

    def test_une_fenetre_par_modele(self):
        """Même base et même modèle : même fenêtre ; autre modèle : une autre."""
        a = obtenir_throttler("https://api.example.com", "openweight-large")
        b = obtenir_throttler("https://api.example.com/", "openweight-large")
        c = obtenir_throttler("https://api.example.com", "openweight-small")
        assert a is b
        assert a is not c

    def test_delai_zero_au_demarrage(self):
        """Aucune requête enregistrée : on part tout de suite."""
        assert Throttler("https://api.example.com", "openweight-large").delai_avant_prochaine_requete() == 0.0

    def test_rpm_de_la_table(self):
        """Large : 50 par minute, soit 1,25 s entre deux requêtes ; sinon 100."""
        large = Throttler("https://api.example.com", "openweight-large")
        large.record_request()
        assert 1.2 < large.delai_avant_prochaine_requete() <= 1.3
        autre = Throttler("https://api.example.com", "openweight-small")
        autre.record_request()
        assert 0.6 < autre.delai_avant_prochaine_requete() <= 0.7

    def test_blocage_plafonne(self):
        """Un Retry-After d'une heure bloque 60 s au plus."""
        t = Throttler("https://api.example.com")
        t.record_rate_limit(retry_after_seconds=3600)
        assert 59 < t.delai_avant_prochaine_requete() <= 60

    def test_blocage_sans_retry_after(self):
        """Sans Retry-After, blocage de 10 s."""
        t = Throttler("https://api.example.com")
        t.record_rate_limit()
        assert 9 < t.delai_avant_prochaine_requete() <= 10

    def test_record_rate_limit_bloque(self):
        """Un Retry-After positif bloque les requêtes suivantes."""
        t = Throttler("https://api.example.com")
        t.record_rate_limit(retry_after_seconds=5)
        assert 0 < t.delai_avant_prochaine_requete() <= 5.0

    def test_verification_web_sans_debounce(self):
        """Juste après un appel à Large, la vérification du relais laisse passer.

        Seuls un blocage après 429 ou une fenêtre pleine font patienter.
        """
        t = obtenir_throttler("https://api.example.com", "openweight-large")
        t.record_request()
        assert t.delai_avant_prochaine_requete(debounce=False) == 0.0
        t.record_rate_limit(retry_after_seconds=5)
        assert t.delai_avant_prochaine_requete(debounce=False) > 4
