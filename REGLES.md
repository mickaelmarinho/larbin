# Les règles du Larbin, telles que le moteur les applique

Variante personnelle du Président / Trou du cul. Le code de `src/engine/` fait
foi ; ce document en est la traduction en français, et signale les points que le
brief ne tranchait pas.

## Mise en place

- 4 à 6 joueurs, 4 c'est l'idéal.
- 52 cartes, toutes distribuées une par une dans le sens des aiguilles d'une
  montre. À 5 ou 6 joueurs, certains ont donc une carte de plus que d'autres.
- À la première manche, personne n'a de rôle : **celui qui a la dame de cœur
  ouvre**. Aux manches suivantes, c'est le Boss.

## Hiérarchie

    2 > A > R > D > V > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3

Le 2 est la carte la plus forte : celui qui l'a garde toujours le dernier mot
sur une série.

## Une série

- Le joueur qui ouvre pose une carte seule, une doublette, une triplette ou une
  quadruplette (toujours de même hauteur).
- Les suivants doivent poser **le même nombre de cartes**, de valeur
  **strictement supérieure**. Sinon — ou s'ils préfèrent garder leur jeu — ils
  passent.
- **Qui a passé ne revient plus** dans la série en cours.
- Quand plus personne ne peut ou ne veut monter, la série s'arrête. Le dernier
  joueur à avoir posé ouvre la suivante.

## Fin de manche

La manche s'arrête quand il ne reste qu'un joueur avec des cartes en main.

| Place            | Rôle       |
| ---------------- | ---------- |
| 1er              | Boss       |
| 2e               | Sous-Boss  |
| places du milieu | Neutre     |
| avant-dernier    | Sur-Larbin |
| dernier          | Larbin     |

À 4 joueurs il n'y a pas de Neutre ; à 5 il y en a un, à 6 il y en a deux.

**Terminer en posant un 2 rend Larbin d'office**, quel que soit l'ordre
d'arrivée.

## Les échanges de la manche suivante

**Personne ne choisit ses cartes.** L'échange est imposé dans les deux sens :

- Le Larbin donne ses **2 meilleures cartes** au Boss ; le Boss lui rend ses
  **2 plus basses**.
- Le Sur-Larbin donne sa **meilleure carte** au Sous-Boss ; le Sous-Boss lui rend
  sa **plus basse**.
- Les Neutres n'échangent rien.
- Le Boss ouvre la manche.

La seule liberté est la **couleur**, et seulement en cas d'égalité — des deux
côtés. Si vos deux cartes les plus basses sont deux 6, vous décidez si vous
lâchez le cœur, le trèfle, le carreau ou le pique ; et si le Larbin a trois As
au sommet de sa main, c'est lui qui décide lesquels il cède.

L'échange se règle donc en deux temps : le bas donne d'abord, le haut rend
ensuite — car ses plus basses ne se comptent qu'une fois qu'il a reçu. Le moteur
applique tout ce qui ne demande aucun arbitrage et ne s'arrête que lorsqu'une
couleur reste à départager.

**Les échanges sont discrets.** Chacun ne voit que les cartes qui passent par ses
propres mains. La table apprend seulement qu'un échange a eu lieu entre untel et
untel — jamais ce qui a changé de main entre deux autres joueurs.

## Les points

Chaque manche rapporte **autant de points qu'on a laissé de joueurs derrière
soi**. À quatre : 3 au Boss, 2 au Sous-Boss, 1 au Sur-Larbin, rien au Larbin.
À six, le Boss en prend 5.

Le compte se fait sur le **classement**, pas sur l'ordre de sortie : celui qui
termine sur un 2 est donc puni deux fois — il devient Larbin *et* repart les
mains vides.

La partie est gagnée par le premier à **5 points par adversaire** : 15 points à
quatre joueurs, 20 à cinq, 25 à six. Cela représente cinq manches gagnées de
bout en bout, soit une bonne soirée quel que soit le nombre de joueurs.

---

## Les points que le brief ne tranchait pas

Voici les choix que j'ai faits pour que le moteur soit complet. Chacun se change
en quelques lignes si tu préfères une autre convention.

**Plusieurs joueurs finissent sur un 2 dans la même manche.**
Rare mais possible. Ils sont tous relégués en queue de classement, dans l'ordre
où ils sont sortis : le dernier fautif devient donc le Larbin. Avec un seul
fautif — le cas normal — cela revient exactement à la règle « il devient
Larbin ».

**Quand la fin de partie ?**
Aucune. Les manches s'enchaînent tant que les joueurs en ont envie, comme à
table. Pas de score cumulé pour l'instant.

**Le maître de la série a fini ses cartes.**
Il devrait ouvrir la série suivante, mais il n'a plus rien. C'est alors le
premier joueur encore en jeu à sa gauche qui ouvre.

**On ne passe pas en ouverture.**
Quand la table est vide, il faut poser quelque chose : passer n'aurait aucun
sens, la manche tournerait en rond.

**Le joueur qui rejoint en cours de partie.**
Il est marqué Larbin pour la manche suivante et échange sa place avec le Larbin
sortant. Cela ne servira vraiment qu'une fois le multijoueur en place.
