"""Lancement par python -m serveur : le terminal, un tube ou un fichier reçoivent la bannière."""

import os
import subprocess
import sys
import threading
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]


def test_banniere_lue_a_travers_un_tube(tmp_path):
    """Electron et l'autostart lisent la sortie par un tube : elle doit partir tout de suite."""
    env = {**os.environ, "ALBERT_PORTABLE_DIR": str(tmp_path)}
    processus = subprocess.Popen([sys.executable, "-m", "serveur", "--port", "0", "--no-browser"],
                                 cwd=RACINE, env=env, stdout=subprocess.PIPE, text=True)
    lignes = []
    lecteur = threading.Thread(target=lambda: lignes.extend(processus.stdout.readline() for _ in range(3)), daemon=True)
    lecteur.start()
    lecteur.join(10)
    processus.terminate()
    processus.wait(5)
    assert lignes and lignes[0].strip() == "Albert Go démarré"
