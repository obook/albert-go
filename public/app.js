'use strict';

const $ = (id) => document.getElementById(id);

// localStorage peut être indisponible (navigation privée, stockage bloqué).
function lire(nom, defaut) {
    try {
        const v = localStorage.getItem('albert-go.' + nom);
        return v === null ? defaut : v;
    } catch (e) { return defaut; }
}
function ecrire(nom, valeur) {
    try {
        if (valeur === null) localStorage.removeItem('albert-go.' + nom);
        else localStorage.setItem('albert-go.' + nom, valeur);
    } catch (e) { /* le réglage ne vivra que le temps de la page */ }
}

const reglages = {
    cle: lire('cle', null),
    modele: lire('modele', Albert.MODELES[0].id),
    temperature: parseFloat(lire('temperature', '0.2')),
    memoire: lire('memoire', 'oui') === 'oui'
};
if (!Albert.MODELES.some(m => m.id === reglages.modele)) reglages.modele = Albert.MODELES[0].id;

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
    $('vide').hidden = conversation.length > 0;
    (connecte ? $('saisie') : $('cle')).focus();
}

function afficherReglages() {
    const modele = Albert.MODELES.find(m => m.id === reglages.modele);
    $('resume-reglages').textContent = modele.nom + ', température ' + reglages.temperature.toFixed(1);
    $('memoire').checked = reglages.memoire;
    $('memoire-reglage').checked = reglages.memoire;
    $('temperature').value = reglages.temperature;
    $('valeur-temperature').textContent = reglages.temperature.toFixed(1);
    document.querySelector('input[name="modele"][value="' + reglages.modele + '"]').checked = true;
}

function ajouter(role, texte) {
    const li = document.createElement('li');
    li.className = role;
    if (role === 'assistant') {
        const pastille = document.createElement('span');
        pastille.className = 'pastille';
        pastille.textContent = 'IA';
        const bloc = document.createElement('div');
        const contenu = document.createElement('div');
        contenu.className = 'texte';
        contenu.textContent = texte;
        const copier = document.createElement('button');
        copier.type = 'button';
        copier.className = 'bouton-lien';
        copier.textContent = 'Copier';
        copier.addEventListener('click', () => {
            navigator.clipboard.writeText(texte).then(() => etat('Réponse copiée.'));
        });
        bloc.append(contenu, copier);
        li.append(pastille, bloc);
    } else {
        const qui = document.createElement('span');
        qui.className = 'visuellement-cache';
        qui.textContent = 'Vous : ';
        li.append(qui, texte);
    }
    $('fil').append(li);
    $('vide').hidden = true;
    li.scrollIntoView({ block: 'end' });
    return li;
}

function etat(texte, erreur) {
    $('etat').textContent = texte;
    $('etat').classList.toggle('erreur', !!erreur);
}

/* Réglages */

function changerMemoire(active) {
    reglages.memoire = active;
    ecrire('memoire', active ? 'oui' : 'non');
    afficherReglages();
}

$('modeles').append(...Albert.MODELES.map(m => {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'modele';
    radio.value = m.id;
    const nom = document.createElement('strong');
    nom.textContent = m.nom;
    const desc = document.createElement('span');
    desc.textContent = m.description;
    label.append(radio, nom, desc);
    return label;
}));

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

$('memoire').addEventListener('change', () => changerMemoire($('memoire').checked));
$('memoire-reglage').addEventListener('change', () => changerMemoire($('memoire-reglage').checked));

$('ouvrir-reglages').addEventListener('click', () => $('reglages').showModal());
$('resume-reglages').addEventListener('click', () => $('reglages').showModal());

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
    reglages.cle = $('cle').value.trim();
    ecrire('cle', reglages.cle);
    $('cle').value = '';
    afficher();
});

$('nouvelle').addEventListener('click', () => {
    conversation = [];
    $('fil').replaceChildren();
    etat('');
    afficher();
});

$('saisie').addEventListener('keydown', (e) => {
    const champ = $('saisie');
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        $('form-question').requestSubmit();
        return;
    }
    // Les flèches ne rappellent l'historique que depuis la première ou la dernière ligne.
    const premiereLigne = !champ.value.slice(0, champ.selectionStart).includes('\n');
    const derniereLigne = !champ.value.slice(champ.selectionEnd).includes('\n');
    const sens = e.key === 'ArrowUp' && premiereLigne ? 'haut'
        : e.key === 'ArrowDown' && derniereLigne && position >= 0 ? 'bas' : null;
    if (!sens || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

    const nouvelle = Albert.naviguer(historique, position, sens);
    if (nouvelle === position) return;
    e.preventDefault();
    if (position === -1) brouillon = champ.value;
    position = nouvelle;
    champ.value = position === -1 ? brouillon : historique[position];
    champ.setSelectionRange(champ.value.length, champ.value.length);
});

$('form-question').addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = $('saisie').value.trim();
    if (!question || $('envoyer').disabled) return;

    historique = [question, ...historique.filter(q => q !== question)].slice(0, Albert.HISTORIQUE_MAX);
    ecrire('historique', JSON.stringify(historique));
    position = -1;
    brouillon = '';

    conversation.push({ role: 'user', content: question });
    const bulle = ajouter('user', question);
    $('saisie').value = '';
    $('envoyer').disabled = true;
    etat('Albert réfléchit...');
    try {
        const reponse = await Albert.repondre(reglages.cle, {
            model: reglages.modele,
            temperature: reglages.temperature,
            messages: Albert.messagesAEnvoyer(conversation, reglages.memoire)
        });
        conversation.push({ role: 'assistant', content: reponse });
        ajouter('assistant', reponse);
        etat('');
    } catch (err) {
        // La question non répondue sort du fil pour pouvoir la reposer.
        conversation.pop();
        bulle.remove();
        $('vide').hidden = conversation.length > 0;
        $('saisie').value = question;
        etat(err instanceof TypeError ? 'Relais n8n injoignable. Vérifiez la connexion.'
            : err.name === 'TimeoutError' ? 'Albert ne répond pas. Réessayez.'
            : err.message, true);
    } finally {
        $('envoyer').disabled = false;
        $('saisie').focus();
    }
});

afficherReglages();
afficherTheme();
afficher();
