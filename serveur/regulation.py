# Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
# Repris de L'Atelier d'Albert (Romain P., Luce P.B., Théossian S.D., O. Booklage)
# Licence : GPL-3.0-or-later
"""Limitation de débit côté client pour l'API Albert.

Une fenêtre glissante par api_base et par modèle, commune à toutes les
clés : le plafond vaut pour le compte, pas pour la clé (mesure du
17 septembre 2026 sur le serveur de classe). Les limites viennent d'une
table ; /v1/me/info ne dit pas quel routeur sert quel modèle.

reserver() ne bloque pas : elle prend une place dans la fenêtre, ou
renvoie le délai à patienter ; le relais répond alors 429 avec
Retry-After au lieu de faire attendre la page.
"""

import re
import threading
import time
from collections import deque

# Fenêtre glissante de comptage : 60 secondes
FENETRE_SECONDES = 60.0
# On commence à temporiser à 80 % de la limite documentée
SEUIL_DECLENCHEMENT = 0.8
# Marge ajoutée au débounce pour éviter de coller pile à la limite
EPSILON_DEBOUNCE = 0.05

# Requêtes par minute des modèles connus (alias). Les autres : RPM_DEFAUT.
# ponytail: table en dur, à relire si Albert change ses quotas ou publie
# enfin le rattachement routeur / modèle dans /v1/me/info.
RPM_PAR_MODELE = {"openweight-large": 50}
RPM_DEFAUT = 100
# Après un 429 : Retry-After respecté jusqu'à 60 s ; sans lui, 10 s.
BLOCAGE_MAX_SECONDES = 60.0
BLOCAGE_SANS_RETRY_AFTER = 10.0

# Une réponse 429 dont le message contient un de ces motifs signale un
# quota journalier épuisé (et non un simple rate-limit minute). Cf.
# albert-code (core/llm/backend/generic.py:_BODY_PER_DAY_RE).
_REGEX_QUOTA_JOURNALIER = re.compile(
    r"(input\s+)?tokens?\s+per\s+day|requests?\s+per\s+day", re.IGNORECASE
)


def est_quota_journalier(detail):
    """Renvoie True si le détail d'un 429 indique un quota journalier épuisé.

    Distingue les 429 transitoires (retry possible dans la minute) des
    429 définitifs pour la journée (réinitialisés au prochain minuit UTC).
    """
    if not detail:
        return False
    return _REGEX_QUOTA_JOURNALIER.search(str(detail)[:500]) is not None


class FenetreGlissante:
    """Compteur d'événements sur une fenêtre glissante de N secondes."""

    def __init__(self, fenetre=FENETRE_SECONDES):
        self._fenetre = fenetre
        self._evenements = deque()

    def ajouter(self, n=1):
        self._evenements.append((time.monotonic(), n))

    def total(self):
        self._purger()
        return sum(n for _, n in self._evenements)

    def secondes_avant_liberation(self):
        """Délai avant que le plus vieil événement sorte de la fenêtre."""
        self._purger()
        if not self._evenements:
            return 0.0
        plus_vieux, _ = self._evenements[0]
        return max(0.0, plus_vieux + self._fenetre - time.monotonic())

    def _purger(self):
        seuil = time.monotonic() - self._fenetre
        while self._evenements and self._evenements[0][0] < seuil:
            self._evenements.popleft()


class Throttler:
    """Fenêtre d'un modèle, partagée par toutes les requêtes du processus."""

    def __init__(self, api_base, modele=None):
        self._api_base = api_base.rstrip("/")
        self._rpm = RPM_PAR_MODELE.get(modele, RPM_DEFAUT)
        self._requetes = FenetreGlissante()
        self._dernier_slot = -1.0
        self._bloque_jusqua = 0.0
        self._verrou = threading.Lock()

    def delai_avant_prochaine_requete(self, debounce=True):
        """Renvoie le délai à patienter en secondes (0 si on peut partir).

        NE BLOQUE PAS. Le relais passe debounce=False : seuls un blocage
        après 429 ou une fenêtre pleine font patienter la page.
        """
        with self._verrou:
            return self._calculer_delai(debounce)

    def reserver(self):
        """Prend une place dans la fenêtre si elle est libre ; renvoie 0, sinon le délai.

        Sous le même verrou que le calcul : vingt élèves qui envoient en
        même temps ne passent pas tous avant la première réponse d'Albert.
        """
        with self._verrou:
            delai = self._calculer_delai(debounce=False)
            if delai <= 0:
                self._requetes.ajouter(1)
                self._dernier_slot = time.monotonic()
            return delai

    def _calculer_delai(self, debounce=True):
        """Renvoie le délai d'attente recommandé. Doit être appelée sous verrou."""
        delais = []
        maintenant = time.monotonic()
        # 1. Débounce : espacement minimum entre deux requêtes
        if debounce and self._dernier_slot >= 0.0:
            debounce = (60.0 / self._rpm) + EPSILON_DEBOUNCE
            ecoule = maintenant - self._dernier_slot
            if ecoule < debounce:
                delais.append(debounce - ecoule)
        # 2. Blocage après un 429
        if self._bloque_jusqua > maintenant:
            delais.append(self._bloque_jusqua - maintenant)
        # 3. Fenêtre glissante : au-delà de 80 % du rpm, attendre
        plafond = max(1, int(self._rpm * SEUIL_DECLENCHEMENT))
        if self._requetes.total() >= plafond:
            delais.append(self._requetes.secondes_avant_liberation())
        return max(delais) if delais else 0.0

    def record_request(self):
        """À appeler après chaque requête réussie."""
        with self._verrou:
            self._requetes.ajouter(1)
            self._dernier_slot = time.monotonic()

    def record_rate_limit(self, retry_after_seconds=None):
        """À appeler quand l'API renvoie un 429 transitoire.

        Bloque la fenêtre BLOCAGE_SANS_RETRY_AFTER secondes sans
        Retry-After, sinon Retry-After plafonné à BLOCAGE_MAX_SECONDES :
        un Retry-After démesuré ne fige pas la classe.
        """
        if retry_after_seconds is None or retry_after_seconds <= 0:
            duree = BLOCAGE_SANS_RETRY_AFTER
        else:
            duree = min(float(retry_after_seconds), BLOCAGE_MAX_SECONDES)
        with self._verrou:
            cible = time.monotonic() + duree
            if cible > self._bloque_jusqua:
                self._bloque_jusqua = cible


# Une instance par (api_base, modèle), partagée par tous les AlbertClient
# du processus : essentiel en mode web où chaque requête crée un client.
_throttlers = {}
_throttlers_verrou = threading.Lock()


def obtenir_throttler(api_base, modele=None):
    """Renvoie la fenêtre partagée de ce modèle (créée à la demande)."""
    cle = ((api_base or "").rstrip("/"), modele)
    with _throttlers_verrou:
        if cle not in _throttlers:
            _throttlers[cle] = Throttler(api_base, modele)
        return _throttlers[cle]


def reinitialiser_pour_tests():
    """Réinitialise le cache des throttlers (réservé aux tests)."""
    with _throttlers_verrou:
        _throttlers.clear()
