'use strict';

const CLE = 'albert-go.cle';
const MODELE = 'albert-go.modele';

const $ = (id) => document.getElementById(id);
let messages = [];

// localStorage peut être indisponible (navigation privée, stockage bloqué).
function lire(nom) {
    try { return localStorage.getItem(nom); } catch (e) { return null; }
}
function ecrire(nom, valeur) {
    try {
        if (valeur === null) localStorage.removeItem(nom);
        else localStorage.setItem(nom, valeur);
    } catch (e) { /* la clé ne vivra que le temps de la page */ }
}

let cle = lire(CLE);

function afficher() {
    $('form-cle').hidden = !!cle;
    $('chat').hidden = !cle;
    $('outils').hidden = !cle;
    (cle ? $('saisie') : $('cle')).focus();
}

function ajouter(role, texte) {
    const li = document.createElement('li');
    li.className = role;
    const qui = document.createElement('span');
    qui.className = 'qui';
    qui.textContent = role === 'user' ? 'Vous' : 'IA';
    const contenu = document.createElement('div');
    contenu.textContent = texte;
    li.append(qui, contenu);
    $('fil').append(li);
    li.scrollIntoView({ block: 'end' });
}

function etat(texte, erreur) {
    $('etat').textContent = texte;
    $('etat').classList.toggle('erreur', !!erreur);
}

async function chargerModeles() {
    try {
        const ids = await Albert.modeles(cle);
        const choisi = lire(MODELE) || Albert.MODELE_DEFAUT;
        $('modele').replaceChildren(...ids.map(id => new Option(id, id, false, id === choisi)));
        etat('');
    } catch (e) {
        etat(e instanceof TypeError ? 'Relais n8n injoignable.' : e.message, true);
    }
}

$('form-cle').addEventListener('submit', (e) => {
    e.preventDefault();
    cle = $('cle').value.trim();
    ecrire(CLE, cle);
    $('cle').value = '';
    afficher();
    chargerModeles();
});

$('changer-cle').addEventListener('click', () => {
    cle = null;
    ecrire(CLE, null);
    afficher();
});

$('nouvelle').addEventListener('click', () => {
    messages = [];
    $('fil').replaceChildren();
    etat('');
    $('saisie').focus();
});

$('modele').addEventListener('change', () => ecrire(MODELE, $('modele').value));

$('saisie').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        $('form-question').requestSubmit();
    }
});

$('form-question').addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = $('saisie').value.trim();
    if (!question || $('envoyer').disabled) return;

    messages.push({ role: 'user', content: question });
    ajouter('user', question);
    $('saisie').value = '';
    $('envoyer').disabled = true;
    etat('Albert réfléchit...');
    try {
        const reponse = await Albert.repondre(cle, $('modele').value || Albert.MODELE_DEFAUT, messages);
        messages.push({ role: 'assistant', content: reponse });
        ajouter('assistant', reponse);
        etat('');
    } catch (err) {
        // La question non répondue sort de l'historique pour pouvoir la reposer.
        messages.pop();
        $('fil').lastChild.remove();
        $('saisie').value = question;
        etat(err instanceof TypeError ? 'Relais n8n injoignable.' : err.name === 'TimeoutError' ? 'Albert ne répond pas. Réessayez.' : err.message, true);
    } finally {
        $('envoyer').disabled = false;
        $('saisie').focus();
    }
});

afficher();
if (cle) chargerModeles();
