# Le Larbin

Version en ligne du **Larbin**, variante maison du Président / Trou du cul.
Projet plaisir : le but est d'y jouer à 4 ou 6 entre proches, chacun sur son
téléphone.

Les règles appliquées sont détaillées dans [REGLES.md](REGLES.md).

## Jouer

Double-cliquez **`Larbin.html`**. C'est tout : un seul fichier, aucune
installation, il s'ouvre dans le navigateur et la partie commence contre Gina,
Hugo et Lila.

Ce fichier se transmet comme une photo — par mail, par message. Celui qui le
reçoit peut jouer sans rien installer.

### Sur le téléphone

Double-cliquez **`Serveur.cmd`** et laissez la fenêtre ouverte. Elle affiche une
adresse du genre `http://192.168.1.22:5177` : tapez-la dans le navigateur du
téléphone, à condition d'être sur le même wifi.

### Dans le terminal

`Jouer.cmd` lance la même partie en mode texte. C'est le banc d'essai qui a servi
à valider les règles avant que l'interface existe.

## Développer

Node 22.6 ou plus récent. Le projet lit le TypeScript directement : il n'y a rien
à compiler pour le moteur ni pour les tests.

```
npm test        # la batterie de règles
npm run build   # réassemble Larbin.html
npm run watch   # réassemble à chaque modification
npm run serveur # sert le jeu sur le réseau local
```

Seule l'interface passe par une étape d'assemblage : esbuild réunit le moteur et
l'affichage, et le tout est inséré dans `Larbin.html`. D'où le fichier unique.

## Où en est le chantier

- [x] **Le moteur de règles** — complet, testé, sans dépendance.
- [x] **Un banc d'essai en terminal.**
- [x] **L'interface** — cartes, éventail, panneaux d'échange et de fin de manche,
      pensée téléphone d'abord.
- [ ] **Le multijoueur** — salons privés, invitation par lien, reconnexion.
- [ ] **La mise en ligne.**

## Comment c'est rangé

    src/engine/types.ts   les types partagés
    src/engine/cards.ts   le paquet, les hauteurs, le tri des mains
    src/engine/rng.ts     tirage aléatoire déterministe (parties rejouables)
    src/engine/game.ts    les règles : distribution, séries, rôles, échanges
    src/engine/bot.ts     l'adversaire artificiel
    src/web/app.ts        l'interface : affichage, sélection, enchaînement
    src/web/style.css     le tapis, les cartes, les panneaux
    src/web/index.html    le gabarit de la page
    src/cli.ts            le jeu en terminal
    scripts/build.mjs     assemble Larbin.html
    scripts/serveur.mjs   serveur statique pour tester sur le téléphone
    test/engine.test.ts   la batterie de tests

Le moteur est une pile de fonctions pures : `apply(état, action)` renvoie un
nouvel état sans toucher à l'ancien, et `viewFor(état, joueur)` ne montre à
chacun que sa propre main. L'interface ne connaît que ces deux fonctions.

C'est ce qui prépare le multijoueur : le jour venu, `apply` tournera sur le
serveur et l'interface enverra ses actions sur le réseau au lieu de les appliquer
elle-même. Le reste de `app.ts` ne bougera pas, et aucun client ne pourra tricher
ni voir le jeu des autres.
