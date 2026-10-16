// Copie le serveur et la page dans app/, avec la version affichée dans "À propos".
//
// Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
// Licence : GPL-3.0-or-later
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEPOT = path.join(__dirname, '..');
const APP = path.join(__dirname, 'app');

fs.rmSync(APP, { recursive: true, force: true });
for (const nom of ['serveur', 'public', '.env-exemple', 'LICENSE']) {
    fs.cpSync(path.join(DEPOT, nom), path.join(APP, nom), {
        recursive: true,
        filter: (src) => path.basename(src) !== '__pycache__',
    });
}

// Comme la publication sur Pages : commit et date dans version.js ; ?v=<commit> contre les mélanges en cache.
const git = (args) => execSync(`git ${args}`, { cwd: DEPOT, encoding: 'utf-8' }).trim();
const commit = git('rev-parse --short HEAD');
fs.writeFileSync(path.join(APP, 'public', 'js', 'version.js'),
    `const VERSION = { commit: '${commit}', date: '${git('log -1 --format=%cI')}' };\n`);
for (const page of ['index.html', 'kiosque.html']) {
    const fichier = path.join(APP, 'public', page);
    fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf-8').replaceAll('?v=dev', `?v=${commit}`));
}
