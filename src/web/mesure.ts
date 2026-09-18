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
import { hoteDuJeu } from './table.ts';

export function compter(evenement: EvenementNavigateur): void {
  // Le fichier seul joue hors ligne : il n'a personne à qui parler.
  if (location.protocol === 'file:') return;
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
