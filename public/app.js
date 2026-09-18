'use strict';

const $ = (id) => document.getElementById(id);

// Pages ne peut pas envoyer X-Frame-Options : dans le cadre d'un autre site, seul un lien s'affiche (SECURITE.md, E2).
if (window.top !== window.self) {
    const lien = document.createElement('a');
    lien.href = location.href;
    lien.target = '_top';
    lien.textContent = 'Ouvrir Albert Go dans son propre onglet';
    const p = document.createElement('p');
    p.className = 'hors-cadre';
    p.append(lien);
    document.body.replaceChildren(p);
    throw new Error('Albert Go ne s\'affiche pas dans le cadre d\'un autre site.');
}

// Option "Effacer la clé et supprimer mes questions" : clé et historique en sessionStorage, effacés à la fermeture de l'onglet.
const SENSIBLES = ['cle', 'historique'];
let partage = false;
function stockage(nom) {
    return partage && SENSIBLES.includes(nom) ? sessionStorage : localStorage;
}

// Le stockage peut être indisponible (navigation privée, stockage bloqué).
function lire(nom, defaut) {
    try {
        const v = stockage(nom).getItem('albert-go.' + nom);
        return v === null ? defaut : v;
    } catch (e) { return defaut; }
}
function ecrire(nom, valeur) {
    try {
        if (valeur === null) stockage(nom).removeItem('albert-go.' + nom);
        else stockage(nom).setItem('albert-go.' + nom, valeur);
    } catch (e) { /* le réglage ne vivra que le temps de la page */ }
}

// Par défaut, effacement à la fermeture : l'utilisateur d'un poste personnel désactive l'option.
partage = lire('partage', 'oui') === 'oui';
// Clé enregistrée avant que l'option soit active par défaut : ne pas la laisser dans localStorage.
if (partage) SENSIBLES.forEach(nom => { try { localStorage.removeItem('albert-go.' + nom); } catch (e) { /* stockage bloqué */ } });

// Le navigateur restaure sessionStorage quand on rouvre un onglet fermé : effacement explicite.
// Page masquée : probablement un onglet gelé par le navigateur ou une extension, la clé reste.
// pagehide couvre aussi le rechargement, qui redemande donc la clé en mode partagé.
window.addEventListener('pagehide', () => {
    if (partage && document.visibilityState === 'visible') SENSIBLES.forEach(nom => ecrire(nom, null));
});

// Bascule du mode partagé : les données sensibles changent de stockage.
function changerPartage(actif) {
    const valeurs = SENSIBLES.map(nom => lire(nom, null));
    SENSIBLES.forEach(nom => ecrire(nom, null));
    partage = actif;
    ecrire('partage', actif ? 'oui' : 'non');
    SENSIBLES.forEach((nom, i) => { if (valeurs[i] !== null) ecrire(nom, valeurs[i]); });
}

const reglages = {
    cle: lire('cle', null),
    modele: lire('modele', Albert.MODELES[0].id),
    temperature: parseFloat(lire('temperature', '0.2')),
    memoire: lire('memoire', 'oui') === 'oui',
    voixEnLigne: lire('voix-en-ligne', 'non') === 'oui'
};
if (typeof Lecture !== 'undefined') Lecture.enLigne = reglages.voixEnLigne;

// Liste de secours tant que /v1/models n'a pas répondu (ou s'il échoue).
let modelesDispo = Albert.MODELES;
function modeleActuel() {
    return modelesDispo.find(m => m.id === reglages.modele) || modelesDispo[0];
}

let conversation = [];

// Questions posées, la plus récente en premier, gardées entre les sessions.
let historique = [];
try { historique = JSON.parse(lire('historique', '[]')); } catch (e) { /* historique vide */ }
if (!Array.isArray(historique)) historique = [];
let position = -1;
let brouillon = '';

/* Affichage */

function afficher() {
    const connecte = !!reglages.cle;
    $('form-cle').hidden = connecte;
    $('chat').hidden = !connecte;
    $('saisie-zone').hidden = !connecte;
    $('ouvrir-reglages').hidden = !connecte;
    $('nouvelle').hidden = !connecte;
    (connecte ? $('saisie') : $('cle')).focus();
}

// Usage du dernier échange renvoyé par Albert, pour la jauge de contexte.
let dernierUsage = null;

function afficherReglages() {
    const modele = modeleActuel();
    const pourcent = Albert.occupation(dernierUsage, modele.contexte);
    const contexte = !reglages.memoire ? 'sans contexte'
        : 'contexte' + (pourcent === null ? ' complet' : ' ' + pourcent + ' %');
    $('resume-reglages').textContent = modele.nom + ', ' + reglages.temperature.toFixed(1) + ', ' + contexte;
    $('jauge-niveau').style.width = (pourcent || 0) + '%';
    $('jauge-niveau').classList.toggle('pleine', pourcent !== null && pourcent >= 80);
    $('memoire-reglage').checked = reglages.memoire;
    $('voix-en-ligne').checked = reglages.voixEnLigne;
    $('partage-accueil').checked = partage;
    $('partage-reglage').checked = partage;
    $('temperature').value = reglages.temperature;
    $('valeur-temperature').textContent = reglages.temperature.toFixed(1);
    const radio = [...document.querySelectorAll('input[name="modele"]')].find(r => r.value === modele.id);
    if (radio) radio.checked = true;
}

// Icônes fixes (jamais de contenu du modèle), insérées par innerHTML.
const ICONES = {
    copier: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
    copie: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    lire: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    arreter: '<svg class="plein" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>'
};

function boutonAction(icone, libelle) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'bouton-action';
    bouton.innerHTML = icone;
    bouton.setAttribute('aria-label', libelle);
    bouton.title = libelle;
    return bouton;
}

function ajouter(role, texte) {
    const li = document.createElement('li');
    li.className = role;
    if (role === 'assistant') {
        const pastille = document.createElement('span');
        pastille.className = 'pastille';
        pastille.textContent = 'IA';
        const bloc = document.createElement('div');
        bloc.className = 'carte';
        const contenu = document.createElement('div');
        contenu.className = 'texte rendu';
        Rendu.afficher(contenu, texte);
        const actions = document.createElement('div');
        actions.className = 'actions-reponse';

        const copier = boutonAction(ICONES.copier, 'Copier la réponse');
        copier.addEventListener('click', () => {
            navigator.clipboard.writeText(texte).then(() => {
                copier.innerHTML = ICONES.copie;
                toast('Réponse copiée.');
                setTimeout(() => { copier.innerHTML = ICONES.copier; }, 1500);
            });
        });
        actions.append(copier);

        if (typeof speechSynthesis !== 'undefined') {
            const lire = boutonAction(ICONES.lire, 'Lire à voix haute');
            lire.addEventListener('click', () => {
                if (!Lecture.disponible()) {
                    etat(Lecture.enLigne ? 'Aucune voix française disponible dans ce navigateur.'
                        : 'Aucune voix française installée sur cet appareil. Les voix en ligne ne sont pas utilisées.', true);
                    return;
                }
                Lecture.basculer(lire, contenu);
            });
            lire.addEventListener('lecture-debut', () => {
                lire.innerHTML = ICONES.arreter;
                lire.setAttribute('aria-label', 'Arrêter la lecture');
            });
            lire.addEventListener('lecture-fin', () => {
                lire.innerHTML = ICONES.lire;
                lire.setAttribute('aria-label', 'Lire à voix haute');
            });
            actions.append(lire);
        }

        bloc.append(contenu, actions);
        li.append(pastille, bloc);
    } else {
        const qui = document.createElement('span');
        qui.className = 'visuellement-cache';
        qui.textContent = 'Vous : ';
        li.append(qui, texte);
    }
    $('fil').append(li);
    li.scrollIntoView({ block: 'end' });
    return li;
}

// Emplacement de la réponse : trois points animés et secondes écoulées (albert-board, albert-atelier).
function ajouterAttente() {
    const li = document.createElement('li');
    li.className = 'assistant';
    li.setAttribute('aria-hidden', 'true');
    const pastille = document.createElement('span');
    pastille.className = 'pastille';
    pastille.textContent = 'IA';
    const attente = document.createElement('div');
    attente.className = 'carte attente';
    const points = document.createElement('span');
    points.className = 'points';
    points.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
    const duree = document.createElement('span');
    duree.className = 'duree';
    attente.append(points, duree);
    li.append(pastille, attente);
    $('fil').append(li);
    li.scrollIntoView({ block: 'end' });

    const debut = Date.now();
    const minuteur = setInterval(() => {
        duree.textContent = Math.round((Date.now() - debut) / 1000) + ' s';
    }, 1000);
    return () => { clearInterval(minuteur); li.remove(); };
}

let minuteurToast = null;
function toast(texte) {
    $('toast').textContent = texte;
    $('toast').classList.add('visible');
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => $('toast').classList.remove('visible'), 2000);
}

function etat(texte, erreur) {
    $('etat').textContent = texte;
    $('etat').classList.toggle('erreur', !!erreur);
}

/* Réglages */

function afficherModeles() {
    $('modeles').replaceChildren(...modelesDispo.map(m => {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'modele';
        radio.value = m.id;
        const nom = document.createElement('strong');
        nom.textContent = m.nom;
        const alias = document.createElement('code');
        alias.className = 'alias';
        alias.textContent = m.id;
        alias.title = 'Modèle réel : ' + m.reel;
        const desc = document.createElement('span');
        desc.textContent = m.description;
        label.append(radio, nom, alias, desc);
        return label;
    }));
}

// Liste réelle des modèles par le relais n8n ; en cas d'échec, la liste de secours reste.
async function chargerModeles() {
    if (!reglages.cle) return;
    try {
        const liste = await Albert.modeles(reglages.cle);
        if (!liste.length) return;
        modelesDispo = liste;
        afficherModeles();
        afficherReglages();
    } catch (e) { /* liste de secours */ }
}

afficherModeles();

$('modeles').addEventListener('change', (e) => {
    reglages.modele = e.target.value;
    ecrire('modele', reglages.modele);
    afficherReglages();
});

$('temperature').addEventListener('input', () => {
    reglages.temperature = parseFloat($('temperature').value);
    ecrire('temperature', String(reglages.temperature));
    afficherReglages();
});

$('memoire-reglage').addEventListener('change', () => {
    reglages.memoire = $('memoire-reglage').checked;
    ecrire('memoire', reglages.memoire ? 'oui' : 'non');
    afficherReglages();
});

$('voix-en-ligne').addEventListener('change', () => {
    reglages.voixEnLigne = $('voix-en-ligne').checked;
    Lecture.enLigne = reglages.voixEnLigne;
    ecrire('voix-en-ligne', reglages.voixEnLigne ? 'oui' : 'non');
});

$('ouvrir-reglages').addEventListener('click', () => $('reglages').showModal());
$('ouvrir-info').addEventListener('click', () => $('info').showModal());
$('resume-reglages').addEventListener('click', () => $('reglages').showModal());

$('partage-reglage').addEventListener('change', () => changerPartage($('partage-reglage').checked));

$('changer-cle').addEventListener('click', () => {
    reglages.cle = null;
    ecrire('cle', null);
    $('reglages').close();
    afficher();
});

/* Thème */

function themeActuel() {
    return document.documentElement.dataset.theme
        || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function afficherTheme() {
    $('theme').setAttribute('aria-label', themeActuel() === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre');
}
$('theme').addEventListener('click', () => {
    const theme = themeActuel() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    ecrire('theme', theme);
    afficherTheme();
});

/* Clé et conversation */

$('form-cle').addEventListener('submit', (e) => {
    e.preventDefault();
    changerPartage($('partage-accueil').checked);
    afficherReglages();
    reglages.cle = $('cle').value.trim();
    ecrire('cle', reglages.cle);
    $('cle').value = '';
    afficher();
    chargerModeles();
});

$('nouvelle').addEventListener('click', () => {
    if (typeof speechSynthesis !== 'undefined') Lecture.arreter();
    retirerPiece();
    conversation = [];
    dernierUsage = null;
    afficherReglages();
    $('fil').replaceChildren();
    etat('');
    afficher();
});

let annulation = null;

// Panne réseau et refus CORS donnent la même TypeError : le navigateur ne dit pas lequel.
function messageEchec(err) {
    if (err instanceof TypeError && !Albert.ORIGINES.includes(location.origin)) {
        return 'Le relais n8n n\'accepte pas l\'adresse ' + location.origin + '. Ouvrez Albert Go depuis '
            + Albert.ORIGINES.join(' ou ') + '.';
    }
    if (err instanceof TypeError) return 'Relais n8n injoignable. Vérifiez la connexion.';
    if (err.name === 'TimeoutError') return 'Albert ne répond pas. Réessayez.';
    return err.message;
}

/* Fichier joint (idée reprise d'albert-atelier) : le texte obtenu part avec la question suivante. */

const TEXTE_MAX = 200000;
const EXTENSIONS_TEXTE = /\.(txt|md|csv|tsv|json|xml|html|css|js|py|tex|sql)$/i;
let pieceJointe = null;
let lecturePiece = null;

function afficherPiece(piece, enCours) {
    pieceJointe = enCours ? null : piece;
    $('piece-nom').textContent = piece.nom + (enCours ? ' : lecture en cours...' : '');
    $('piece-jointe').hidden = false;
}

function retirerPiece() {
    if (lecturePiece) lecturePiece.abort();
    lecturePiece = null;
    pieceJointe = null;
    $('piece-jointe').hidden = true;
}

// Image réduite à 1600 px et convertie en JPEG : moins lourde pour le relais et pour Albert.
async function imageEnDataUrl(fichier) {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(1, 1600 / Math.max(image.width, image.height));
    const toile = document.createElement('canvas');
    toile.width = Math.round(image.width * echelle);
    toile.height = Math.round(image.height * echelle);
    const contexte = toile.getContext('2d');
    contexte.fillStyle = '#ffffff';
    contexte.fillRect(0, 0, toile.width, toile.height);
    contexte.drawImage(image, 0, 0, toile.width, toile.height);
    return toile.toDataURL('image/jpeg', 0.85);
}

async function joindreFichier(fichier) {
    retirerPiece();
    const image = fichier.type.startsWith('image/');
    if (!image && !fichier.type.startsWith('text/') && !EXTENSIONS_TEXTE.test(fichier.name)) {
        etat('Format non pris en charge : images et fichiers texte uniquement.', true);
        return;
    }
    const piece = { nom: fichier.name || 'image collée', texte: '' };
    afficherPiece(piece, true);
    const controle = new AbortController();
    lecturePiece = controle;
    try {
        if (image) {
            etat('Lecture de l\'image par Albert...');
            piece.texte = await Albert.transcrire(reglages.cle, await imageEnDataUrl(fichier), controle.signal);
        } else {
            if (fichier.size > TEXTE_MAX) throw new Error('Fichier trop long : 200 Ko au plus.');
            piece.texte = await fichier.text();
        }
        if (lecturePiece !== controle) return;
        lecturePiece = null;
        afficherPiece(piece);
        etat('');
    } catch (err) {
        if (lecturePiece !== controle) return;
        retirerPiece();
        if (err.name !== 'AbortError') etat(messageEchec(err), true);
    }
    $('saisie').focus();
}

$('joindre').addEventListener('click', () => $('fichier').click());
$('fichier').addEventListener('change', () => {
    const fichier = $('fichier').files[0];
    $('fichier').value = '';
    if (fichier) joindreFichier(fichier);
});
$('piece-retirer').addEventListener('click', () => { retirerPiece(); etat(''); $('saisie').focus(); });

// Glisser-déposer sur la carte de saisie, et collage d'image (Ctrl+V) dans le champ.
$('form-question').addEventListener('dragover', (e) => {
    e.preventDefault();
    $('form-question').classList.add('depot');
});
$('form-question').addEventListener('dragleave', () => $('form-question').classList.remove('depot'));
$('form-question').addEventListener('drop', (e) => {
    e.preventDefault();
    $('form-question').classList.remove('depot');
    const fichier = e.dataTransfer.files[0];
    if (fichier) joindreFichier(fichier);
});
$('saisie').addEventListener('paste', (e) => {
    const image = [...(e.clipboardData ? e.clipboardData.files : [])].find(f => f.type.startsWith('image/'));
    if (!image) return;
    e.preventDefault();
    joindreFichier(image);
});

// Pendant une requête, le bouton rond passe de la flèche d'envoi au carré d'arrêt.
function boutonEnvoi(enCours) {
    $('envoyer').classList.toggle('en-cours', enCours);
    $('envoyer').setAttribute('aria-label', enCours ? 'Arrêter' : 'Envoyer');
}

$('saisie').addEventListener('keydown', (e) => {
    const champ = $('saisie');
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        // Pendant une requête, Entrée ne doit pas déclencher le bouton Arrêter.
        if (!annulation) $('form-question').requestSubmit();
        return;
    }
    // Les flèches ne rappellent l'historique que depuis la première ou la dernière ligne.
    const premiereLigne = !champ.value.slice(0, champ.selectionStart).includes('\n');
    const derniereLigne = !champ.value.slice(champ.selectionEnd).includes('\n');
    const sens = e.key === 'ArrowUp' && premiereLigne ? 'haut'
        : e.key === 'ArrowDown' && derniereLigne && position >= 0 ? 'bas' : null;
    if (!sens || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (rappeler(sens)) e.preventDefault();
});

// Boutons affichés sur écran tactile, sans flèches de clavier (style.css, pointer: coarse).
$('question-precedente').addEventListener('click', () => { rappeler('haut'); $('saisie').focus(); });
$('question-suivante').addEventListener('click', () => { rappeler('bas'); $('saisie').focus(); });

function rappeler(sens) {
    const champ = $('saisie');
    const nouvelle = Albert.naviguer(historique, position, sens);
    if (nouvelle === position) return false;
    if (position === -1) brouillon = champ.value;
    position = nouvelle;
    champ.value = position === -1 ? brouillon : historique[position];
    champ.setSelectionRange(champ.value.length, champ.value.length);
    return true;
}

$('form-question').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (annulation) {
        annulation.abort();
        return;
    }
    if (lecturePiece) {
        etat('Attendez la fin de la lecture du fichier.');
        return;
    }
    const question = $('saisie').value.trim();
    const piece = pieceJointe;
    if (!question && !piece) return;

    if (question) {
        historique = [question, ...historique.filter(q => q !== question)].slice(0, Albert.HISTORIQUE_MAX);
        ecrire('historique', JSON.stringify(historique));
    }
    position = -1;
    brouillon = '';

    conversation.push({ role: 'user', content: Albert.joindre(question, piece) });
    const bulle = ajouter('user', question + (piece ? (question ? '\n' : '') + 'Fichier joint : ' + piece.nom : ''));
    $('saisie').value = '';
    retirerPiece();
    annulation = new AbortController();
    boutonEnvoi(true);
    const retirerAttente = ajouterAttente();
    etat('Albert réfléchit...');
    try {
        const reponse = await Albert.repondre(reglages.cle, {
            model: modeleActuel().id,
            temperature: reglages.temperature,
            messages: Albert.messagesAEnvoyer(conversation, reglages.memoire)
        }, annulation.signal);
        retirerAttente();
        conversation.push({ role: 'assistant', content: reponse.texte });
        ajouter('assistant', reponse.texte);
        dernierUsage = reponse.usage;
        afficherReglages();
        etat('');
    } catch (err) {
        retirerAttente();
        // La question non répondue sort du fil pour pouvoir la reposer.
        conversation.pop();
        bulle.remove();
        $('saisie').value = question;
        if (piece) afficherPiece(piece);
        if (err.name === 'AbortError') etat('Question annulée.');
        else etat(messageEchec(err), true);
    } finally {
        annulation = null;
        boutonEnvoi(false);
        $('saisie').focus();
    }
});

afficherReglages();
afficherTheme();
afficher();
chargerModeles();
