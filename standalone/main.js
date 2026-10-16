// Version autonome d'Albert Go : lance le serveur Python embarqué et l'ouvre dans une fenêtre.
//
// Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
// Auteurs : O. Booklage ; Romain P., Luce P.B., Théossian S.D. (L'Atelier d'Albert)
// Licence : GPL-3.0-or-later
'use strict';

const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWin = process.platform === 'win32';
// Python, dictionnaires et serveur avec sa page (copiés par prebuild.js) ; hors paquet, le dépôt.
const RES_DIR = app.isPackaged ? process.resourcesPath : __dirname;
const APP_DIR = app.isPackaged ? path.join(RES_DIR, 'albert-go') : path.join(__dirname, '..');
// .env à côté de l'AppImage ou du .exe ; hors paquet, celui du dépôt.
const CONFIG_DIR = process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE)
    : app.isPackaged ? path.dirname(process.execPath) : APP_DIR;

let serveur = null;
let fenetre = null;
let adresse = null;

function python() {
    const embarque = isWin ? path.join(RES_DIR, 'python-win', 'python.exe')
        : path.join(RES_DIR, 'python-linux', 'bin', 'python3');
    if (fs.existsSync(embarque)) return embarque;
    // Hors paquet : le .venv de local.sh, sinon le Python du système.
    const venv = path.join(APP_DIR, '.venv', 'bin', 'python');
    return fs.existsSync(venv) ? venv : (isWin ? 'python' : 'python3');
}

// Résout à la fin de la bannière du serveur avec son adresse et l'absence de clé,
// rejette s'il s'arrête avant.
function demarrerServeur() {
    return new Promise((resolve, reject) => {
        const args = ['-m', 'serveur', '--no-browser'];
        if (process.argv.includes('--kiosque')) args.push('--kiosque');
        serveur = spawn(python(), args, {
            cwd: APP_DIR,
            env: { ...process.env, ALBERT_PORTABLE_DIR: CONFIG_DIR, PYTHONDONTWRITEBYTECODE: '1' },
            windowsHide: true,
        });
        let sortie = '';
        serveur.stdout.on('data', (d) => {
            process.stdout.write(d);
            sortie += d;
            const local = sortie.match(/Local\s*: (\S+)/);
            if (local && sortie.includes('Ctrl+C')) resolve({ adresse: local[1], sansCle: sortie.includes('Aucune clé API') });
        });
        serveur.stderr.on('data', (d) => {
            process.stderr.write(d);
            sortie += d;
        });
        serveur.on('error', reject);
        serveur.on('exit', () => {
            serveur = null;
            reject(new Error(sortie.trim() || 'Le serveur s\'est arrêté.'));
        });
    });
}

function memeOrigine(url) {
    try {
        return new URL(url).origin === new URL(adresse).origin;
    } catch {
        return false;
    }
}

function ouvrirFenetre() {
    Menu.setApplicationMenu(null);
    fenetre = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'Albert Go',
        icon: path.join(APP_DIR, 'public', 'images', 'icone-512.png'),
        webPreferences: { preload: path.join(__dirname, 'preload.js') },
    });
    // Une nouvelle version de l'application ne reprend pas les fichiers de l'ancienne.
    fenetre.webContents.session.clearCache();

    // Raccourcis perdus avec le menu : actualiser et zoom.
    fenetre.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        const wc = fenetre.webContents;
        if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
            wc.reload();
        } else if (input.control && (input.key === '+' || input.key === '=')) {
            wc.setZoomFactor(Math.min(wc.getZoomFactor() + 0.1, 3));
        } else if (input.control && input.key === '-') {
            wc.setZoomFactor(Math.max(wc.getZoomFactor() - 0.1, 0.3));
        } else if (input.control && input.key === '0') {
            wc.setZoomFactor(1);
        } else {
            return;
        }
        event.preventDefault();
    });

    // Electron ne fournit pas de menu au clic droit : suggestions d'orthographe et édition.
    fenetre.webContents.on('context-menu', (event, params) => {
        const wc = fenetre.webContents;
        const items = [];
        if (params.misspelledWord) {
            for (const mot of params.dictionarySuggestions) {
                items.push({ label: mot, click: () => wc.replaceMisspelling(mot) });
            }
            if (!items.length) items.push({ label: 'Aucune suggestion', enabled: false });
            items.push({ type: 'separator' });
            items.push({
                label: 'Ajouter au dictionnaire',
                click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord),
            });
            items.push({ type: 'separator' });
        }
        if (params.editFlags.canCut) items.push({ label: 'Couper', role: 'cut' });
        if (params.editFlags.canCopy) items.push({ label: 'Copier', role: 'copy' });
        if (params.editFlags.canPaste) items.push({ label: 'Coller', role: 'paste' });
        if (params.editFlags.canSelectAll) items.push({ label: 'Tout sélectionner', role: 'selectAll' });
        if (items.length) Menu.buildFromTemplate(items).popup({ window: fenetre });
    });

    // Liens externes dans le navigateur du système.
    fenetre.webContents.setWindowOpenHandler(({ url }) => {
        if (memeOrigine(url)) return { action: 'allow' };
        shell.openExternal(url);
        return { action: 'deny' };
    });
    fenetre.webContents.on('will-navigate', (event, url) => {
        if (!memeOrigine(url)) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });
    fenetre.on('closed', () => {
        fenetre = null;
    });
    fenetre.loadURL(adresse);
}

// Dictionnaires embarqués des quatre langues, copiés là où Chromium les cherche :
// le correcteur marche hors ligne, sans téléchargement chez Google.
function installerDictionnaires() {
    const source = path.join(RES_DIR, 'dictionnaires');
    const dossier = path.join(app.getPath('userData'), 'Dictionaries');
    try {
        fs.mkdirSync(dossier, { recursive: true });
        for (const nom of fs.readdirSync(source).filter((n) => n.endsWith('.bdic'))) {
            const cible = path.join(dossier, nom);
            if (!fs.existsSync(cible)) fs.copyFileSync(path.join(source, nom), cible);
        }
    } catch (err) {
        console.error('Dictionnaires non installés :', err.message);
    }
}

function arreterServeur() {
    if (serveur) serveur.kill();
    serveur = null;
}

if (!app.requestSingleInstanceLock()) {
    // Double lancement : la fenêtre déjà ouverte suffit.
    app.quit();
} else {
    app.on('second-instance', () => {
        if (fenetre) {
            fenetre.restore();
            fenetre.focus();
        }
    });

    app.whenReady().then(async () => {
        try {
            // Premier lancement : le modèle commenté, où coller la clé API.
            const env = path.join(CONFIG_DIR, '.env');
            if (!fs.existsSync(env)) fs.copyFileSync(path.join(APP_DIR, '.env-exemple'), env);
            const demarrage = await demarrerServeur();
            adresse = demarrage.adresse;
            installerDictionnaires();
            ouvrirFenetre();
            if (demarrage.sansCle) avertirSansCle(env);
        } catch (err) {
            arreterServeur();
            dialog.showErrorBox('Albert Go ne démarre pas', err.message);
            app.quit();
        }
    });
}

// Clé absente du .env, hors kiosque : le dire dès l'ouverture plutôt qu'à la première question.
function avertirSansCle(env) {
    dialog.showMessageBox(fenetre, {
        type: 'warning',
        title: 'Albert Go',
        message: 'Aucune clé API',
        detail: `Collez votre clé Albert API après ALBERT_API_KEY= dans ${env}, puis enregistrez : Albert Go la prend sans redémarrer.`,
        buttons: ['Ouvrir le fichier .env', 'Plus tard'],
        defaultId: 0,
        cancelId: 1,
    }).then(({ response }) => {
        if (response === 0) shell.openPath(env);
    });
}

// Certificat auto-signé du serveur (ALBERT_HTTPS=oui) : accepté pour lui seul.
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    const accepte = memeOrigine(url);
    if (accepte) event.preventDefault();
    callback(accepte);
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', arreterServeur);

// Zoom à la molette (preload.js) : seuls +1 et -1 passent.
ipcMain.on('zoom-delta', (event, sens) => {
    if (!fenetre || (sens !== 1 && sens !== -1)) return;
    const wc = fenetre.webContents;
    wc.setZoomFactor(Math.min(Math.max(wc.getZoomFactor() + sens * 0.1, 0.3), 3));
});

// Correcteur dans la langue de l'interface (preload.js), sinon Chromium prend l'anglais.
const DICTIONNAIRES = { fr: 'fr', en: 'en-US', es: 'es', de: 'de' };
ipcMain.on('langue', (event, langue) => {
    if (Object.hasOwn(DICTIONNAIRES, langue)) {
        event.sender.session.setSpellCheckerLanguages([DICTIONNAIRES[langue]]);
    }
});
