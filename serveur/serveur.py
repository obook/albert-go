"""Serveur HTTP d'Albert Go : fichiers de public/ et relais /v1 vers Albert.

Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
Auteurs : O. Booklage ; Romain P., Luce P.B., Théossian S.D. (L'Atelier d'Albert)
Licence : GPL-3.0-or-later
"""

import http.server
import os
import socket
import ssl
import sys
import urllib.parse

from serveur import certificat, relais

RACINE = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "public"))
ROUTES = {
    ("GET", "/v1/models"): 0,
    ("POST", "/v1/chat/completions"): 10 * 1024 * 1024,
    ("POST", "/v1/audio/transcriptions"): 16 * 1024 * 1024,
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


class Gestionnaire(http.server.BaseHTTPRequestHandler):
    """Sert public/ et relaie les trois routes /v1 d'Albert."""

    def do_GET(self):
        chemin = urllib.parse.urlsplit(self.path).path
        if chemin.startswith("/v1/"):
            self._relayer("GET", chemin)
        else:
            self._fichier(chemin)

    def do_POST(self):
        self._relayer("POST", urllib.parse.urlsplit(self.path).path)

    def _relayer(self, methode, chemin):
        taille_max = ROUTES.get((methode, chemin))
        if taille_max is None:
            relais.repondre_json(self, 404, {"detail": "Route inconnue."})
            return
        taille = int(self.headers.get("Content-Length") or 0)
        if taille > taille_max:
            relais.repondre_json(self, 413, {"detail": "Requête trop grosse."})
            self.close_connection = True
            return
        corps = self.rfile.read(taille) if taille else b""
        relais.relayer(self, methode, chemin, corps, self.headers.get("Content-Type"))

    def _fichier(self, chemin):
        relatif = urllib.parse.unquote(chemin).lstrip("/") or "index.html"
        fichier = os.path.realpath(os.path.join(RACINE, relatif))
        if os.path.commonpath([RACINE, fichier]) != RACINE:
            self.send_error(403)
            return
        if os.path.isdir(fichier):
            fichier = os.path.join(fichier, "index.html")
        if not os.path.isfile(fichier):
            self.send_error(404)
            return
        extension = os.path.splitext(fichier)[1]
        with open(fichier, "rb") as f:
            contenu = f.read()
        self.send_response(200)
        self.send_header("Content-Type", TYPES.get(extension, "application/octet-stream"))
        self.send_header("Content-Length", str(len(contenu)))
        self.send_header("Cache-Control", "no-cache" if extension in SANS_CACHE else "public, max-age=86400")
        self.end_headers()
        self.wfile.write(contenu)

    def log_message(self, *args):
        pass


def creer_serveur(port=8913, utiliser_ssl=False):
    """Serveur prêt à lancer (serve_forever) sur toutes les interfaces."""
    serveur = http.server.ThreadingHTTPServer(("0.0.0.0", port), Gestionnaire)
    if utiliser_ssl:
        contexte = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        contexte.load_cert_chain(certificat.CERT_FILE, certificat.KEY_FILE)
        serveur.socket = contexte.wrap_socket(serveur.socket, server_side=True)
    return serveur


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
