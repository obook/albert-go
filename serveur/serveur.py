"""Serveur HTTP d'Albert Go : fichiers de public/ et relais /v1 vers Albert.

Projet : Albert Go, https://github.com/obook/albert-go
Auteurs : O. Booklage ; Romain P., Luce P.B., Théossian S.D. (L'Atelier d'Albert)
Licence : GPL-3.0-or-later
"""

import email.utils
import http.server
import ipaddress
import json
import os
import shutil
import socket
import ssl
import subprocess
import sys
import time
import urllib.parse
# Retiré le 21/11/2026 : un seul style d'import, urllib.parse.parse_qs et urllib.parse.urlencode.
# from urllib.parse import parse_qs, urlencode

from serveur import certificat, config, kiosque, relais

RACINE = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "public"))
ROUTES = {
    ("GET", "/v1/models"): 0,
    ("POST", "/v1/chat/completions"): 10 * 1024 * 1024,
    ("POST", "/v1/audio/transcriptions"): 16 * 1024 * 1024,
    # Vecteurs des passages des sources : 64 passages d'environ 1 000 caractères par appel.
    ("POST", "/v1/embeddings"): 1024 * 1024,
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
# Pages réservées à une session en kiosque ; le reste de public/ est public.
PAGES_PROTEGEES = {"/", "/index.html"}
FORMULAIRE_MAX = 4096


class Gestionnaire(http.server.BaseHTTPRequestHandler):
    """Sert public/ et relaie les trois routes /v1 d'Albert."""

    # Client muet (iPad en veille) : sa connexion se ferme au bout d'une minute.
    timeout = 60

    def do_GET(self):
        chemin = urllib.parse.urlsplit(self.path).path
        if chemin == "/serveur.js":
            self._serveur_js()
        elif self.server.kiosque and chemin == "/kiosque":
            self._fichier("/kiosque.html")
        elif chemin == "/kiosque":
            # Sans kiosque, une page d'une ancienne session y mène encore : l'accueil plutôt qu'un 404.
            self._rediriger("/")
        elif self.server.kiosque and chemin == "/api/kiosque-status":
            # Session de ce navigateur : une page d'une ancienne session n'est plus "active".
            role = kiosque.role_de_la_requete(self)
            statut = {"active": role is not None, "temps_restant": kiosque.temps_restant()}
            # L'invité suit les réglages du poste maître pendant la session.
            if role == "eleve":
                statut["reglages"] = kiosque.reglages()
            elif role is None:
                self._journal_refus(chemin)
            # Réponse propre à ce navigateur : un cache ne doit pas la resservir à un autre poste.
            relais.repondre_json(self, 200, statut, {"Cache-Control": "no-store"})
        elif not self._porte_kiosque(chemin):
            return
        elif chemin.startswith("/v1/"):
            self._relayer("GET", chemin)
        else:
            self._fichier(chemin)

    def do_POST(self):
        chemin = urllib.parse.urlsplit(self.path).path
        if self.server.kiosque and chemin == "/kiosque":
            self._kiosque_post()
        elif self.server.kiosque and chemin == "/api/kiosque-reglages":
            self._reglages_prof()
        elif self._porte_kiosque(chemin):
            self._relayer("POST", chemin)

    def _relayer(self, methode, chemin):
        taille_max = ROUTES.get((methode, chemin))
        if taille_max is None:
            relais.repondre_json(self, 404, {"detail": "Route inconnue."})
            return
        # Application ou clé USB hors kiosque : la clé du .env ne sert qu'à ce poste, sinon le réseau l'utiliserait
        # sans code ni durée. Un serveur centralisé, lui, sert le réseau avec sa clé (docs/DEPLOIEMENT.md).
        portable = config.MODE == "portable" and not self.server.kiosque
        if portable and not ipaddress.ip_address(self.client_address[0]).is_loopback:
            relais.repondre_json(self, 403, {"detail": "Clé réservée à ce poste.", "reseau": "refuse"})
            self.close_connection = True
            return
        taille = self._longueur_corps()
        # Négative, read() lirait sans limite jusqu'à la fin du flux.
        if taille < 0:
            relais.repondre_json(self, 400, {"detail": "Content-Length invalide."})
            self.close_connection = True
            return
        if taille > taille_max:
            relais.repondre_json(self, 413, {"detail": "Requête trop grosse."})
            self.close_connection = True
            return
        corps = self.rfile.read(taille) if taille else b""
        # Client parti en cours d'envoi : rien ne part chez Albert.
        if len(corps) != taille:
            self.close_connection = True
            return
        cle = None
        if self.server.kiosque:
            cle = kiosque.cle_api()
            if not cle:
                self._session_terminee()
                return
        elif not config.load_config()["api_key"]:
            # .env sans clé : celle que l'utilisateur a saisie dans la page (Albert.CLE_PAGE).
            cle = self.headers.get("Authorization", "").removeprefix("Bearer ").strip() or None
        relais.relayer(self, methode, chemin, corps, self.headers.get("Content-Type"), cle)

    def _session_terminee(self):
        relais.repondre_json(self, 401, {"detail": "Session de classe terminée.", "kiosque": "terminee"})

    def _rediriger(self, adresse, cookie=None):
        self.send_response(302)
        self.send_header("Location", adresse)
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()

    def _porte_kiosque(self, chemin):
        """En kiosque, sans session valide : 302 vers /kiosque (page) ou 401 (/v1). True si la requête passe."""
        if not self.server.kiosque or (chemin not in PAGES_PROTEGEES and not chemin.startswith("/v1/")):
            return True
        if kiosque.role_de_la_requete(self):
            return True
        self._journal_refus(chemin)
        if chemin.startswith("/v1/"):
            self._session_terminee()
        elif kiosque.valeur_cookie(self) is not None:
            # Cookie d'une session finie ou remplacée : la page de connexion dit pourquoi.
            self._rediriger("/kiosque?erreur=terminee")
        else:
            self._rediriger("/kiosque")
        return False

    def _journal_refus(self, chemin):
        """Une ligne par poste renvoyé, avec le motif : seule trace d'une session perdue sur un seul poste."""
        motif = kiosque.motif_refus(kiosque.valeur_cookie(self))
        print(f"{time.strftime('%d/%m %H:%M:%S')} kiosque : {self.client_address[0]} renvoyé sur {chemin} ({motif})", flush=True)

    def _longueur_corps(self):
        """Content-Length de la requête, 0 s'il manque, -1 s'il n'est pas un nombre."""
        try:
            return int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return -1

    def _formulaire(self):
        """Champs d'un formulaire POST (4 Ko au plus), ou None après avoir répondu 400."""
        taille = self._longueur_corps()
        if not 0 <= taille <= FORMULAIRE_MAX:
            relais.repondre_json(self, 400, {"detail": "Formulaire invalide."})
            self.close_connection = True
            return None
        texte = self.rfile.read(taille).decode("utf-8", "replace")
        return {nom: valeurs[0] for nom, valeurs in urllib.parse.parse_qs(texte).items()}

    def _kiosque_post(self):
        champs = self._formulaire()
        if champs is None:
            return
        action = champs.get("action", "")
        role = kiosque.role_de_la_requete(self)
        if action == "login":
            cle = champs.get("cle_api", "").strip()[:500]
            if not cle:
                self._rediriger("/kiosque?erreur=cle-requise")
            elif not kiosque.cle_acceptee(cle):
                self._rediriger("/kiosque?erreur=cle-refusee")
            else:
                kiosque.creer_session(cle, champs.get("duree", "2h"))
                self._rediriger("/", f"{kiosque.COOKIE}={kiosque.cookie('enseignant')}; Path=/; HttpOnly; SameSite=Lax")
        elif action == "code":
            token, code = champs.get("token", "").strip(), champs.get("code", "").strip()
            if not kiosque.session_active():
                self._rediriger("/kiosque?erreur=aucune-session")
            elif not kiosque.verifier_code(token, code):
                self._rediriger("/kiosque?" + urllib.parse.urlencode({"erreur": "code", "token": token}))
            elif role == "enseignant":
                # Le prof qui essaie le lien élève dans son navigateur reste prof.
                self._rediriger("/")
            else:
                self._rediriger("/", f"{kiosque.COOKIE}={kiosque.cookie('eleve')}; Path=/; HttpOnly; SameSite=Lax")
        elif action == "logout":
            # Seul le prof (rôle signé) ferme la session de la classe.
            if role == "enseignant":
                kiosque.terminer_session()
            efface = None
            if kiosque.valeur_cookie(self) is not None:
                efface = f"{kiosque.COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
            self._rediriger("/kiosque", efface)
        else:
            self._rediriger("/kiosque?erreur=action")

    def _reglages_prof(self):
        if kiosque.role_de_la_requete(self) != "enseignant":
            relais.repondre_json(self, 403, {"detail": "Réservé à l'enseignant."})
            return
        taille = self._longueur_corps()
        try:
            corps = json.loads(self.rfile.read(taille)) if 0 < taille <= FORMULAIRE_MAX else None
        except ValueError:
            # JSON mal écrit.
            corps = None
        if not isinstance(corps, dict):
            relais.repondre_json(self, 400, {"detail": "Réglages invalides."})
            return
        kiosque.enregistrer_reglages(kiosque.valider_reglages(corps))
        relais.repondre_json(self, 200, {"ok": True})

    def _serveur_js(self):
        """Adresses réseau et session de cette page ; la CSP interdit les scripts en ligne."""
        port = self.server.server_address[1]
        protocole = "https" if self.server.ssl else "http"
        session = None
        role = kiosque.role_de_la_requete(self) if self.server.kiosque else None
        if role == "enseignant":
            session = dict(kiosque.infos_enseignant() or {}, role=role)
        elif role == "eleve":
            session = {"role": role, "reglages": kiosque.reglages()}
        donnees = {
            "adresses": [f"{protocole}://{ip}:{port}" for ip in self.server.adresses],
            "kiosque": session,
            "portable": config.MODE == "portable",
            # Commit du dépôt servi : version.js reste "locale" hors déploiement par la CI.
            "version": self.server.version,
            # Fichier où coller la clé, si elle manque ; relu à chaque page, la clé ajoutée compte sans redémarrage.
            "cleAbsente": None if self.server.kiosque or config.load_config()["api_key"] else config.chemin_config(),
        }
        texte = "var SERVEUR = " + json.dumps(donnees, ensure_ascii=False).replace("</", "<\\/") + ";\n"
        contenu = texte.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(contenu)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(contenu)

    def _fichier(self, chemin):
        relatif = urllib.parse.unquote(chemin).lstrip("/") or "index.html"
        fichier = os.path.realpath(os.path.join(RACINE, relatif))
        try:
            dans_public = os.path.commonpath([RACINE, fichier]) == RACINE
        except ValueError:
            # Windows : "/D:/x" vise un autre lecteur, commonpath ne sait pas comparer.
            dans_public = False
        if not dans_public:
            self.send_error(403)
            return
        if os.path.isdir(fichier):
            fichier = os.path.join(fichier, "index.html")
        if not os.path.isfile(fichier):
            self.send_error(404)
            return
        extension = os.path.splitext(fichier)[1]
        etat = os.stat(fichier)
        # Le navigateur renvoie la date reçue telle quelle : la comparaison exacte suffit.
        date = email.utils.formatdate(etat.st_mtime, usegmt=True)
        cache = "no-cache" if extension in SANS_CACHE else "public, max-age=86400"
        if self.headers.get("If-Modified-Since") == date:
            self.send_response(304)
            self.send_header("Cache-Control", cache)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", TYPES.get(extension, "application/octet-stream"))
        self.send_header("Content-Length", str(etat.st_size))
        self.send_header("Last-Modified", date)
        self.send_header("Cache-Control", cache)
        self.end_headers()
        with open(fichier, "rb") as f:
            shutil.copyfileobj(f, self.wfile)

    def log_message(self, *args):
        pass


def creer_serveur(port=8913, utiliser_ssl=False, mode_kiosque=False):
    """Serveur prêt à lancer (serve_forever) sur toutes les interfaces."""
    serveur = http.server.ThreadingHTTPServer(("0.0.0.0", port), Gestionnaire)
    serveur.kiosque = mode_kiosque
    serveur.ssl = utiliser_ssl
    serveur.adresses = adresses_locales()
    serveur.version = version_depot()
    if utiliser_ssl:
        contexte = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        contexte.load_cert_chain(certificat.CERT_FILE, certificat.KEY_FILE)
        # Poignée TLS à la première lecture, dans le fil du client : un client
        # muet ne bloque plus accept() pour toute la classe.
        serveur.socket = contexte.wrap_socket(serveur.socket, server_side=True, do_handshake_on_connect=False)
    return serveur


def version_depot():
    """Commit, date, branche et modifications du dépôt servi ; None sans git ou hors dépôt.

    Lu une fois au démarrage : demarrage.sh et redemarrage.sh font le git pull
    puis relancent le serveur. Commandes locales seulement, sans réseau ;
    le délai couvre un disque lent ou un dépôt verrouillé.
    """
    dossier = os.path.dirname(RACINE)

    def git(*arguments):
        return subprocess.run(["git", "-C", dossier, *arguments], capture_output=True, text=True,
                              timeout=5, check=True).stdout.strip()

    try:
        commit, date = git("log", "-1", "--format=%h%n%cI").splitlines()
        return {
            "commit": commit,
            "date": date,
            "branche": git("rev-parse", "--abbrev-ref", "HEAD"),
            # Fichiers suivis seulement : journal, .env et .venv ne comptent pas.
            "modifiee": bool(git("status", "--porcelain", "--untracked-files=no")),
        }
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


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
