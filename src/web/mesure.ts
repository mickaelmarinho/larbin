/**
 * Les compteurs anonymes, vus du navigateur.
 *
 * Pour savoir si le jeu plaît, il faut quelques chiffres : combien de visites,
 * de parties, de partages. On n'envoie que le nom de l'événement — ni joueur,
 * ni appareil, ni rien qui permette de reconnaître qui que ce soit — et le
 * serveur ajoute 1 au total du jour. Si l'envoi échoue, tant pis : le jeu n'en
 * dépend en rien.
 */
import type { EvenementNavigateur } from '../reseau/protocole.ts';
import { estUnRobot, provenance } from './provenance.ts';
import { SUR_PORTAIL } from './portail.ts';
import { hoteDuJeu } from './table.ts';

const CLE_PAS_COMPTER = 'larbin.pas-compter';
const CLE_VISITE = 'larbin.visite-du-jour';

/**
 * Les appareils du propriétaire — et de qui éprouve le site — ne doivent pas
 * gonfler les chiffres. Ouvrir une fois l'adresse « /?moi » sur un appareil le
 * retire des compteurs ; « /?moi=non » l'y remet. Renvoie ce qui a changé.
 */
export function reglerLeComptage(params: URLSearchParams): 'retire' | 'remis' | null {
  if (!params.has('moi')) return null;
  try {
    if (params.get('moi') === 'non') {
      localStorage.removeItem(CLE_PAS_COMPTER);
      return 'remis';
    }
    localStorage.setItem(CLE_PAS_COMPTER, 'oui');
    return 'retire';
  } catch {
    return null;
  }
}

function horsDesCompteurs(): boolean {
  if (location.protocol === 'file:' || estUnRobot(navigator.userAgent, navigator.webdriver)) return true;
  try {
    return localStorage.getItem(CLE_PAS_COMPTER) === 'oui';
  } catch {
    return false;
  }
}

/**
 * Un visiteur par jour, pas un par page chargée : revenir dix fois dans la
 * journée ne fait qu'un visiteur. On note aussi s'il vient d'une recherche ou
 * d'un lien partagé — la catégorie seulement, jamais l'adresse d'origine.
 */
export function compterLaVisite(jour: string, params: URLSearchParams): void {
  if (horsDesCompteurs()) return;
  try {
    if (localStorage.getItem(CLE_VISITE) === jour) return;
    localStorage.setItem(CLE_VISITE, jour);
  } catch { /* sans mémoire, on compte à chaque fois : tant pis */ }
  compter('visite');
  // Chez un portail, c'est lui qui amène le joueur : ni recherche, ni partage.
  if (SUR_PORTAIL) {
    compter('visite-portail');
    return;
  }
  const origine = provenance(document.referrer, params);
  if (origine !== 'autre') compter(origine === 'recherche' ? 'visite-recherche' : 'visite-partage');
}

export function compter(evenement: EvenementNavigateur): void {
  // Le fichier seul joue hors ligne : il n'a personne à qui parler.
  if (horsDesCompteurs()) return;
  void hoteDuJeu()
    .then((hote) => {
      const base = hote === location.host ? '' : `https://${hote}`;
      // En texte brut, la requête part sans question préalable au serveur ;
      // keepalive la laisse partir même si la page se ferme juste après.
      return fetch(`${base}/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ evenement }),
        keepalive: true,
      });
    })
    .catch(() => { /* un compteur de moins, rien de grave */ });
}
