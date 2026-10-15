"""Lancement : python -m serveur [--port N] [--ssl] [--no-browser].

Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
Licence : GPL-3.0-or-later
"""

import argparse
import sys
import threading
import webbrowser

from serveur import certificat, config
from serveur.serveur import adresses_locales, creer_serveur


def main():
    # Ligne par ligne même dans un tube ou un fichier (Electron, autostart).
    sys.stdout.reconfigure(line_buffering=True)
    options = argparse.ArgumentParser(prog="albert-go")
    options.add_argument("--port", type=int, default=8913)
    options.add_argument("--ssl", action="store_true", help="HTTPS avec un certificat auto-signé")
    options.add_argument("--no-browser", action="store_true", help="ne pas ouvrir le navigateur")
    args = options.parse_args()
    utiliser_ssl = args.ssl and certificat.generer_certificat()
    try:
        serveur = creer_serveur(args.port, utiliser_ssl)
    except OSError:
        print(f"Erreur : le port {args.port} est déjà utilisé. Essayez --port {args.port + 1}.")
        return
    protocole = "https" if utiliser_ssl else "http"
    print("Albert Go démarré")
    print(f"  Local   : {protocole}://localhost:{args.port}")
    for ip in adresses_locales():
        print(f"  Réseau  : {protocole}://{ip}:{args.port}")
    print(f"  {config.config_affichee()}")
    cles = len(config.load_web_keys())
    print(f"  Clés API : {cles}" if cles else f"  Aucune clé API : ajoutez-en une dans {config.KEYS_FILE}")
    print("Ctrl+C pour arrêter")
    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open, [f"{protocole}://localhost:{args.port}"]).start()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrêté.")
        serveur.server_close()


main()
