# Projet : Albert Go, https://github.com/obook/albert-go
# Repris de L'Atelier d'Albert (Romain P., Luce P.B., Théossian S.D., O. Booklage)
# Licence : GPL-3.0-or-later
"""Generation d'un certificat SSL auto-signe pour le mode HTTPS.

Cree un certificat dans le dossier du .env, valable un an, avec
l'adresse IP locale en SAN (Subject Alternative Name). Le certificat
est renouvele automatiquement s'il a expire.

Sur Linux/Mac, utilise la commande openssl (preinstallee).
Sur Windows, utilise la bibliotheque cryptography de Python.
"""

import datetime
import os
import socket
import subprocess
import sys

from serveur.config import CONFIG_DIR


# Chemins des fichiers du certificat
CERT_FILE = os.path.join(CONFIG_DIR, "cert.pem")
KEY_FILE = os.path.join(CONFIG_DIR, "key.pem")

# Durée de validité en jours
DUREE_VALIDITE = 365


def _obtenir_ip_locale():
    """Trouver l'adresse IP locale pour l'ajouter au certificat."""
    try:
        # Le bloc with garantit la fermeture du socket même en cas d'erreur
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def _generer_avec_openssl():
    """Générer le certificat avec la commande openssl (Linux/Mac)."""
    ip_locale = _obtenir_ip_locale()

    # Construction de la commande openssl.
    # On ajoute extendedKeyUsage=serverAuth car iOS 13+ refuse
    # les certificats auto-signes qui n'ont pas cette extension.
    commande = [
        "openssl", "req",
        "-x509",
        "-newkey", "rsa:2048",
        "-keyout", KEY_FILE,
        "-out", CERT_FILE,
        "-days", str(DUREE_VALIDITE),
        "-nodes",
        "-subj", "/CN=albert-atelier",
        "-addext", f"subjectAltName=DNS:localhost,IP:127.0.0.1,IP:{ip_locale}",
        "-addext", "extendedKeyUsage=serverAuth",
        "-addext", "basicConstraints=critical,CA:FALSE",
        "-addext", "keyUsage=critical,digitalSignature,keyEncipherment",
    ]

    subprocess.run(
        commande,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _generer_avec_python():
    """Générer le certificat en Python pur (Windows, sans openssl).

    On utilise le module ssl de Python pour créer un certificat
    auto-signé. C'est moins complet qu'openssl mais ça fonctionne
    sur tous les systèmes sans dépendance externe.
    """
    # Importer ici pour ne pas bloquer si la bibliothèque est absente
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
        import datetime
        import ipaddress
    except ImportError:
        raise RuntimeError(
            "La bibliothèque 'cryptography' est nécessaire sur Windows.\n"
            "Installez-la avec : pip install cryptography"
        )

    # Générer la clé privée RSA 2048 bits
    cle_privee = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    ip_locale = _obtenir_ip_locale()

    # Construire le certificat
    sujet = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "albert-atelier"),
    ])

    # Noms alternatifs pour que le navigateur accepte le certificat
    noms_alternatifs = x509.SubjectAlternativeName([
        x509.DNSName("localhost"),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
        x509.IPAddress(ipaddress.IPv4Address(ip_locale)),
    ])

    # Usages autorises : serveur TLS uniquement.
    # iOS 13+ refuse les certificats sans ces deux extensions.
    usage_etendu = x509.ExtendedKeyUsage(
        [x509.oid.ExtendedKeyUsageOID.SERVER_AUTH]
    )
    usage_cle = x509.KeyUsage(
        digital_signature=True,
        key_encipherment=True,
        content_commitment=False,
        data_encipherment=False,
        key_agreement=False,
        key_cert_sign=False,
        crl_sign=False,
        encipher_only=False,
        decipher_only=False,
    )

    maintenant = datetime.datetime.now(datetime.timezone.utc)
    certificat = (
        x509.CertificateBuilder()
        .subject_name(sujet)
        .issuer_name(sujet)
        .public_key(cle_privee.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(maintenant)
        .not_valid_after(maintenant + datetime.timedelta(days=DUREE_VALIDITE))
        .add_extension(noms_alternatifs, critical=False)
        .add_extension(usage_etendu, critical=False)
        .add_extension(usage_cle, critical=True)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(cle_privee, hashes.SHA256())
    )

    # Écrire la clé privée
    with open(KEY_FILE, "wb") as f:
        f.write(cle_privee.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))

    # Écrire le certificat
    with open(CERT_FILE, "wb") as f:
        f.write(certificat.public_bytes(serialization.Encoding.PEM))


def certificat_existe():
    """Vérifier si le certificat et la clé existent."""
    return os.path.isfile(CERT_FILE) and os.path.isfile(KEY_FILE)


def _certificat_expire():
    """Vérifier si le certificat a expiré en lisant sa date de fin.

    Utilise la commande openssl pour lire la date "notAfter" du
    certificat. Si la date est passée, retourne True.
    """
    if not os.path.isfile(CERT_FILE):
        return True

    try:
        # Lire la date d'expiration avec openssl
        resultat = subprocess.run(
            ["openssl", "x509", "-in", CERT_FILE,
             "-noout", "-enddate"],
            capture_output=True, text=True,
        )
        if resultat.returncode != 0:
            return True

        # La sortie est du type "notAfter=Mar 30 09:41:11 2027 GMT"
        ligne = resultat.stdout.strip()
        date_texte = ligne.split("=", 1)[1]

        # Convertir en objet datetime pour comparer
        date_expiration = datetime.datetime.strptime(
            date_texte, "%b %d %H:%M:%S %Y %Z"
        )
        # Ajouter le fuseau UTC pour la comparaison
        date_expiration = date_expiration.replace(
            tzinfo=datetime.timezone.utc
        )
        maintenant = datetime.datetime.now(datetime.timezone.utc)

        return maintenant >= date_expiration
    except Exception:
        # En cas d'erreur de lecture, considérer comme expiré
        # pour forcer la régénération
        return True


def generer_certificat():
    """Créer ou renouveler le certificat auto-signé.

    Génère un nouveau certificat si :
    - aucun certificat n'existe, ou
    - le certificat existant a expiré.

    Retourne True si un certificat est disponible, False sinon.
    """
    if certificat_existe() and not _certificat_expire():
        return True

    # Créer le dossier de configuration si nécessaire
    os.makedirs(CONFIG_DIR, exist_ok=True)

    # Indiquer si c'est un renouvellement ou une première génération
    renouvellement = certificat_existe()

    try:
        if sys.platform == "win32":
            _generer_avec_python()
        else:
            _generer_avec_openssl()

        if renouvellement:
            print("Certificat HTTPS renouvelé (l'ancien avait expiré).")
        return True
    except Exception as e:
        # En cas d'échec, on ne bloque pas le démarrage
        print(f"Impossible de générer le certificat HTTPS : {e}")
        print("Le serveur démarrera en HTTP.")
        return False
