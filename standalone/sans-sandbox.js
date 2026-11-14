// Linux : l'exécutable devient un script qui ajoute --no-sandbox, sans quoi Chromium
// refuse de démarrer depuis une AppImage (bac à sable SUID impossible, espaces de noms
// bloqués par AppArmor sur Ubuntu). Appelé par electron-builder (afterPack).
//
// Projet : Albert Go, https://github.com/obook/albert-go
// Licence : GPL-3.0-or-later
'use strict';

const fs = require('fs');
const path = require('path');

exports.default = async ({ electronPlatformName, appOutDir, packager }) => {
    if (electronPlatformName !== 'linux') return;
    const nom = packager.executableName;
    const exe = path.join(appOutDir, nom);
    fs.renameSync(exe, `${exe}.bin`);
    fs.writeFileSync(exe, `#!/bin/sh\nexec "$(dirname "$(readlink -f "$0")")/${nom}.bin" --no-sandbox "$@"\n`, { mode: 0o755 });
};
