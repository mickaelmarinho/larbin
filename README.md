# Le Larbin

Version en ligne du **Larbin**, variante maison du Président / Trou du cul.
Projet plaisir : le but est d'y jouer à 4 ou 6 entre proches, chacun sur son
téléphone.

Les règles appliquées sont détaillées dans [REGLES.md](REGLES.md).

## Jouer tout de suite

Le plus simple : double-cliquer **Jouer.cmd** dans ce dossier.

En ligne de commande — attention, Windows PowerShell enchaîne avec `;`, jamais
avec `&&` :

```
cd C:\Users\Micka\Desktop\larbin; npm run jouer
```

Il faut Node 22.6 ou plus récent — le projet lit le TypeScript directement, il
n'y a rien à compiler.

Vous affrontez Gina, Hugo et Lila. À chaque tour, le jeu liste vos coups
possibles : tapez le numéro, ou `p` pour passer.

## Vérifier que les règles tiennent

```bash
npm test
```

23 tests : la hiérarchie des cartes, les séries, l'interdiction de revenir après
avoir passé, l'attribution des rôles à 4/5/6, la règle du 2 final, les
échanges... plus 600 manches jouées par les bots à la recherche d'un état
impossible.

## Où en est le chantier

- [x] **Le moteur de règles** — complet, testé, sans dépendance.
- [x] **Un banc d'essai en terminal** — pour éprouver le moteur en jouant.
- [ ] **L'interface** — belles cartes, animations, pensée téléphone d'abord.
- [ ] **Le multijoueur** — salons privés, invitation par lien, reconnexion.
- [ ] **La mise en ligne.**

## Comment c'est rangé

    src/engine/types.ts   les types partagés
    src/engine/cards.ts   le paquet, les hauteurs, le tri des mains
    src/engine/rng.ts     tirage aléatoire déterministe (parties rejouables)
    src/engine/game.ts    les règles : distribution, séries, rôles, échanges
    src/engine/bot.ts     l'adversaire artificiel
    src/cli.ts            le jeu en terminal
    test/engine.test.ts   la batterie de tests

Le moteur est une pile de fonctions pures : `apply(état, action)` renvoie un
nouvel état sans toucher à l'ancien, et `viewFor(état, joueur)` ne montre à
chacun que sa propre main. C'est ce qu'il faut pour que le serveur soit seul
juge une fois le multijoueur en place — un client ne pourra ni tricher, ni voir
le jeu des autres.
