/**
 * L'arène : fait s'affronter deux stratégies de bot et dit laquelle gagne —
 * ou, plus souvent, qu'on ne peut pas conclure.
 *
 *   node scripts/arene.mjs [parties] [--series=N] [--graine=N] [--calibrage]
 *
 * Le piège de l'exercice est de mesurer du bruit et d'y croire. Garde-fous :
 *
 *  - **les places tournent.** Le Larbin n'est pas symétrique : celui qui ouvre
 *    la première manche, celui qui coupe, celui qui reçoit les cartes du Larbin
 *    ne jouent pas le même jeu. On fait donc tourner les stratégies autour de
 *    la table, une partie sur deux, pour que chacune passe autant de temps à
 *    chaque place.
 *
 *  - **plusieurs séries indépendantes.** La dispersion entre séries s'est
 *    révélée presque double de la marge binomiale : une série isolée peut
 *    flatter un candidat. Chaque série est affichée, puis leur regroupement.
 *
 *  - **les fins sur un 2 sont comptées.** Un taux de victoire compare deux bots
 *    entre eux : un défaut qu'ils partagent — garder ses 2 jusqu'à s'y
 *    retrouver piégé — n'y apparaît jamais. C'est un joueur qui l'a vu, pas le
 *    banc ; le banc le montre désormais.
 */
import { apply, createGame, viewFor } from '../src/engine/game.ts';
import { botAction } from '../src/engine/bot.ts';
import { botAction as botCandidat } from '../src/engine/bot-candidat.ts';

const PARTIES = Number(process.argv[2]) || 2000;
/**
 * Étalonnage : le témoin contre lui-même. Le banc doit alors conclure « indécis ».
 * S'il désigne un vainqueur, c'est le banc qui est biaisé, pas les bots.
 */
const CALIBRAGE = process.argv.includes('--calibrage');
/**
 * D'où partent les donnes. Deux exécutions à la même graine voient les mêmes
 * mains — mais pas forcément les mêmes parties : les bots tirent la coupe au
 * hasard, et ce hasard-là n'est pas semé. `--graine=N` déplace franchement
 * l'échantillon, pour répliquer une mesure plutôt que la relire.
 */
const GRAINE = Number(process.argv.find((a) => a.startsWith('--graine='))?.slice(9)) || 1000;
/** Plusieurs séries indépendantes valent mieux qu'une longue : voir plus haut. */
const SERIES = Number(process.argv.find((a) => a.startsWith('--series='))?.slice(9)) || 3;
const candidat = CALIBRAGE ? botAction : botCandidat;

/** Deux d'un côté, deux de l'autre : la table reste équilibrée. */
const PLACES = ['a', 'b', 'c', 'd'];

/**
 * Joue une partie entière. Rend les points de chacun, et le nombre de manches
 * que chacun a terminées sur un 2. `camps` dit quelle stratégie tient quelle place.
 */
function partie(camps, graine) {
  let etat = createGame(PLACES.map((id) => ({ id, name: id, isBot: true })), graine);
  const deux = Object.fromEntries(PLACES.map((p) => [p, 0]));
  let manches = 0;
  // Le repère « fini sur un 2 » est remis à zéro au début de chaque manche :
  // on le relève donc à la fin de chacune, avant de passer à la suivante.
  const clore = () => {
    manches += 1;
    for (const p of etat.players) if (p.finishedOnTwo) deux[p.id] += 1;
  };

  // Une partie mal engagée ne doit pas bloquer le banc : on borne les tours.
  for (let tour = 0; tour < 20000; tour++) {
    if (etat.phase === 'fin-de-partie') {
      clore();
      break;
    }

    if (etat.phase === 'fin-de-manche') {
      clore();
      etat = apply(etat, { type: 'manche-suivante' });
      continue;
    }

    const acteur = etat.phase === 'coupe'
      ? etat.players.find((p) => p.role === 'boss').id
      : etat.order[etat.turn];

    const coup = camps[acteur](viewFor(etat, acteur));
    if (!coup) throw new Error(`${acteur} ne sait pas quoi jouer (phase ${etat.phase})`);
    etat = apply(etat, coup);
  }

  return {
    points: Object.fromEntries(etat.players.map((p) => [p.id, p.points])),
    deux,
    manches,
  };
}

/** Marge d'erreur à 95 % sur une proportion. */
function marge(part, n) {
  return 1.96 * Math.sqrt((part * (1 - part)) / n) * 100;
}

/** Une série de parties sur un jeu de donnes donné. */
function serie(parties, graine) {
  const r = {
    decisives: 0, victoiresCandidat: 0, pointsCandidat: 0, pointsTemoin: 0,
    deuxCandidat: 0, deuxTemoin: 0, manches: 0,
  };
  let egalites = 0;

  for (let i = 0; i < parties; i++) {
    // Une partie sur deux, les stratégies échangent leurs places.
    const inverse = i % 2 === 1;
    const camps = {};
    // En étalonnage les deux camps sont la même fonction : on retient donc les
    // places, et non l'identité de la stratégie, pour savoir qui est qui.
    const placesCandidat = new Set();
    PLACES.forEach((place, index) => {
      const auCandidat = (index % 2 === 0) !== inverse;
      camps[place] = auCandidat ? candidat : botAction;
      if (auCandidat) placesCandidat.add(place);
    });

    const jouee = partie(camps, graine + i * 7);
    r.manches += jouee.manches;

    for (const place of PLACES) {
      if (placesCandidat.has(place)) {
        r.pointsCandidat += jouee.points[place];
        r.deuxCandidat += jouee.deux[place];
      } else {
        r.pointsTemoin += jouee.points[place];
        r.deuxTemoin += jouee.deux[place];
      }
    }

    // Le vainqueur de la partie est celui qui a le plus de points.
    const meilleur = Math.max(...Object.values(jouee.points));
    const gagnants = PLACES.filter((p) => jouee.points[p] === meilleur);
    const camp = new Set(gagnants.map((p) => (placesCandidat.has(p) ? 'candidat' : 'témoin')));
    if (camp.size > 1) egalites += 1;
    else if (camp.has('candidat')) r.victoiresCandidat += 1;
  }

  r.decisives = parties - egalites;
  return r;
}

function main() {
  const entete = CALIBRAGE ? ' — ÉTALONNAGE : le témoin contre lui-même' : '';
  console.log(`\nArène — ${SERIES} × ${PARTIES} parties, places alternées${entete}\n`);

  const total = {
    decisives: 0, victoiresCandidat: 0, pointsCandidat: 0, pointsTemoin: 0,
    deuxCandidat: 0, deuxTemoin: 0, manches: 0,
  };

  for (let s = 0; s < SERIES; s++) {
    // Chaque série tire ses donnes ailleurs : ce sont des échantillons
    // indépendants, pas plusieurs lectures du même.
    const r = serie(PARTIES, GRAINE + s * 1_000_003);
    for (const cle of Object.keys(total)) total[cle] += r[cle];

    const taux = (r.victoiresCandidat / r.decisives) * 100;
    console.log(`  série ${s + 1} : ${taux.toFixed(1)} % `
      + `± ${marge(taux / 100, r.decisives).toFixed(1)}  (${r.decisives} parties décisives)`);
  }

  const part = total.victoiresCandidat / total.decisives;
  const m = marge(part, total.decisives);
  const ecart = part * 100 - 50;
  // Deux sièges par camp : on rapporte le compte à « un joueur, une manche ».
  const taux2 = (n) => ((n / (total.manches * 2)) * 100).toFixed(1);

  console.log(`\n  Ensemble — ${total.decisives} parties décisives, ${total.manches} manches`);
  console.log(`  taux           : ${(part * 100).toFixed(1)} % ± ${m.toFixed(1)}`);
  console.log(`  points cumulés : candidat ${total.pointsCandidat} / témoin ${total.pointsTemoin}`);
  console.log(`  fins sur un 2  : candidat ${taux2(total.deuxCandidat)} % / `
    + `témoin ${taux2(total.deuxTemoin)} % des manches, par joueur`);

  const verdict = Math.abs(ecart) <= m
    ? 'Indécis : l’écart tient dans la marge d’erreur. Ce n’est pas un progrès.'
    : ecart > 0
      ? `Le candidat est meilleur : +${ecart.toFixed(1)} points de pourcentage.`
      : `Le candidat est moins bon : ${ecart.toFixed(1)} points de pourcentage.`;
  console.log(`\n  ${verdict}\n`);
}

main();
