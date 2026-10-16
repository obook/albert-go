"""Lancement : python -m serveur [--port N] [--ssl] [--no-browser] [--kiosque].

Sans option, port, HTTPS et kiosque viennent du .env (serveur/config.py).

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
    # Ligne par ligne même dans un tube ou un fichier (Electron, autostart), en UTF-8 aussi sous Windows.
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    sys.stderr.reconfigure(encoding="utf-8")
    options = argparse.ArgumentParser(prog="albert-go")
    options.add_argument("--port", type=int)
    options.add_argument("--ssl", action="store_true", help="HTTPS avec un certificat auto-signé")
    options.add_argument("--no-browser", action="store_true", help="ne pas ouvrir le navigateur")
    options.add_argument("--kiosque", action="store_true", help="sessions de classe : l'enseignant saisit sa clé sur /kiosque")
    args = options.parse_args()
    reglages = config.load_config()
    mode_kiosque = args.kiosque or reglages["kiosque"]
    if args.port is None:
        args.port = reglages["port"]
    utiliser_ssl = (args.ssl or reglages["https"]) and certificat.generer_certificat()
    serveur = None
    # Port occupé : les suivants, dix en tout.
    for port in range(args.port, args.port + 10):
        try:
            serveur = creer_serveur(port, utiliser_ssl, mode_kiosque)
            break
        except OSError:
            pass
    if serveur is None:
        print(f"Erreur : les ports {args.port} à {args.port + 9} sont déjà utilisés.")
        return
    port = serveur.server_address[1]
    protocole = "https" if utiliser_ssl else "http"
    print("Albert Go démarré")
    print(f"  Local   : {protocole}://localhost:{port}")
    for ip in adresses_locales():
        print(f"  Réseau  : {protocole}://{ip}:{port}")
    print(f"  {config.config_affichee()}")
    if mode_kiosque:
        print("  Mode kiosque : l'enseignant ouvre la session sur /kiosque")
    else:
        # La version autonome (standalone/main.js) lit cette ligne et "Ctrl+C" pour avertir.
        if not config.load_config()["api_key"]:
            print(f"  Aucune clé API : ajoutez ALBERT_API_KEY=... dans {config.chemin_config()}")
    print("Ctrl+C pour arrêter")
    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open, [f"{protocole}://localhost:{port}"]).start()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrêté.")
        serveur.server_close()


main()
