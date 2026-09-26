# Le Larbin

Version en ligne du **Larbin**, variante maison du Président / Trou du cul :
y jouer à quatre ou six, chacun sur son téléphone ou son PC.

Le jeu est en ligne sur **[larbin.vercel.app](https://larbin.vercel.app)**, et
ses règles sont expliquées sur [/regles](https://larbin.vercel.app/regles) pour
qui arrive de nulle part. La traduction technique — ce que le moteur applique
exactement — reste dans [REGLES.md](REGLES.md).

## Jouer seul, tout de suite

Double-cliquez **`Larbin.html`**. Un seul fichier, aucune installation : il
s'ouvre dans le navigateur et la partie commence contre Gina, Hugo et Lila.
Ce fichier se transmet comme une photo — celui qui le reçoit peut jouer sans
rien installer.

## Jouer à plusieurs

Double-cliquez **`Serveur.cmd`** et laissez la fenêtre ouverte : c'est elle qui
arbitre les parties. Elle affiche deux adresses, celle du PC et celle du réseau
local (`http://192.168.1.22:5177` par exemple).

1. Ouvrez cette adresse, entrez votre nom, **Créer un salon**.
2. Envoyez le lien affiché — ou dictez le code de quatre lettres.
3. Complétez la table avec des bots si vous n'êtes pas assez, puis lancez.

Tout le monde doit être sur le même wifi. Pour jouer à distance, voir plus bas.

Une déconnexion n'est pas grave : le navigateur retient votre place et vous la
rend en rouvrant le lien. Si vous ne revenez pas au bout de 25 secondes, la
table joue pour vous plutôt que d'attendre indéfiniment.

Rester là sans jouer bloquerait tout autant : au bout d'une minute, la table
joue donc aussi pour un joueur présent mais muet. Elle l'avertit dans les
quinze dernières secondes — « la table jouera pour vous dans 12 s » —, car
jouer dans le dos de quelqu'un serait déloyal, même pour sauver la partie.
Entre amis on s'appelle pour réveiller le distrait ; entre inconnus, personne
ne peut le faire.

### Apprendre en jouant

Un visiteur qui ne connaît pas le Président lit cinq lignes avant sa première
partie, et peut demander **Apprendre en jouant** : quatre situations, une idée
chacune — monter ou passer, la série qui ne fait qu'un tour, le 2 qui coupe, et
le piège du 2 gardé pour la fin. La dernière laisse volontairement tomber dans
le piège si l'on choisit le mauvais ordre : on retient mieux une erreur qu'un
avertissement, et **Réessayer** remet la situation en place.

L'accueil range les trois façons de jouer dans trois encadrés — **En ligne**
(en tête, avec le bouton doré), **Entre amis** (créer un salon ou entrer son
code) et **Solo**. Le nom, l'avatar et le 🔑 du compte tiennent sur une ligne ;
succès, classement, parcours, règles et histoire sur une rangée d'icônes en bas,
et le 🎨 du tapis et de la musique en haut à droite.

L'encadré En ligne montre que le site vit : un point vert qui bat et « 3 en
ligne · 1 table ouverte » quand du monde est là — jamais « 0 joueur », mais
« Lancez la première table » — et les trois premiers du classement, qu'on
touche pour le voir en entier. L'accueil redemande tout cela toutes les vingt
secondes tant qu'il reste affiché (`src/web/vitrine.ts` décide de ce qu'on dit).

En tête, une affiche : « Le Président, en plus nerveux », et un éventail de
quatre cartes qui monte jusqu'au 2 — les mêmes cartes qu'à la table, qui suivent
donc le tapis choisi. Sur PC (à partir de 900 px de large), l'accueil passe sur
deux colonnes : l'affiche, les trois règles qui changent tout (un seul tour de
table, le 2 qui coupe, finir sur un 2) et les raccourcis à gauche, les façons de
jouer à droite. Au-delà de 1400 × 820 px, l'ensemble grandit (1120 px de large)
sans s'étirer.

Qui n'a pas donné de prénom trouve un nom tiré au sort dans le champ — « Valet
malin », « Joker farceur » (`src/web/noms.ts`) — plutôt que de s'asseoir sous
« Joueur ». Il est gardé d'une visite à l'autre, et chacun le remplace à sa
guise. Sous les façons de jouer, « 📣 Faire découvrir le jeu à un proche » ouvre
la feuille de partage du téléphone (ou copie le lien sur PC). En bas, un pied
de page mène aux règles complètes, à la confidentialité et au contact.

À partir de la deuxième partie, l'écran de fin propose d'installer le jeu sur
l'écran d'accueil (`src/web/installation.ts`) : la fenêtre du navigateur sur
Android et PC, le geste expliqué sur iPhone. « Plus tard » est respecté — on ne
redemande qu'après dix parties de plus, deux fois au plus.

Tant qu'on ne l'a pas suivi jusqu'au bout, le didacticiel a son propre bouton
dans l'encadré Solo, juste sous « Jouer contre les bots » : une carte crème
frappée d'un cœur, qui se remarque sans prendre la première place. Une fois les
quatre leçons terminées, il se retire derrière l'icône « Règles ».

Le didacticiel est une troisième sorte de table (`src/web/didacticiel.ts`). Il
répond aux mêmes questions que les autres — « que vois-je ? », « comment
j'agis ? » — si bien que tout l'affichage, le moteur et les bots fonctionnent
sans rien savoir de lui. Seule s'ajoute une bande de consigne au-dessus du
tapis.

### Jouer avec des inconnus

**Jouer avec d'autres visiteurs** assoit à une table publique, sans code ni
invitation. Chacun y dispose d'un bouton **Je suis prêt**, et le départ obéit à
une seule règle : le compte à rebours de vingt secondes court tant que **tous
les joueurs assis se sont dits prêts**. Se dédire l'arrête ; l'arrivée de
quelqu'un qui n'a rien promis l'arrête aussi. **Commencer avec des bots** reste
là pour qui sait que le voisin s'est absenté sans rien dire.

Au terme du compte à rebours, des bots prennent les places encore libres. La
table les montre, pour qu'on voie ce qui manque. Ces tables n'ont pas d'hôte :
n'importe quel joueur assis peut lancer la partie ou en relancer une.

**Joueurs à cette table : 4, 5 ou 6.** N'importe qui peut changer ce nombre
avant le départ, et la table montre alors autant de places. À cinq il y a un
Neutre, à six il y en a deux : le jeu n'a pas le même goût. Changer la taille
remet chacun « pas prêt » — on s'était dit prêt pour une autre table.

Le bouton mène d'abord à la **liste des tables publiques** : celles qui
attendent, avec le nombre de joueurs et de prêts, et celles dont la partie est
commencée. On peut rejoindre les premières — et **entrer** dans les secondes, en
prenant la place d'un bot : on hérite de sa main et de ses points, et l'on joue
à la manche en cours. Mieux vaut cela qu'attendre la fin d'une partie.

Seules les tables où quelqu'un est effectivement assis sont montrées, et la
liste ne donne que des comptes : les noms des joueurs ne regardent pas les
passants.

Personne n'y attend donc jamais devant un écran vide, ce qui est la raison
d'être de ce fonctionnement : une salle d'attente classique, à faible
fréquentation, ne montre que son propre désert.

### Les sons

Discrets, courts, et coupables d'un geste : la **clochette** de la barre du
haut, ou l'interrupteur des salles d'attente. Le réglage est retenu par le
navigateur.

- une carte posée frotte le tapis, un 2 claque un peu plus ;
- une passe fait un petit « toc » ;
- en ligne, un carillon quand c'est à vous — pas en solo, où les bots répondent
  trop vite pour que ce soit autre chose qu'une rengaine ;
- une clochette qui monte quand quelqu'un s'assoit à votre table, qui descend
  quand il s'en va ; les bots vont et viennent en silence ;
- trois notes à la fin d'une manche.

Aucun fichier audio : tout est synthétisé dans le navigateur (`src/web/sons.ts`),
la page n'y gagne pas un octet. Ce qui déclenche chaque son se décide à part
(`src/web/bruitages.ts`), en comparant deux instants de la table — c'est ce qui
permet de l'éprouver sans haut-parleur.

La **musique d'ambiance** se choisit avec le 🎵 de la barre du haut (ou le 🎨
de l'accueil). Elle est coupée par défaut — sur un téléphone, une
musique imposée fait fuir — et se tait quand l'onglet est caché. Quatre
morceaux, chacun avec ses instruments et son rythme :

- **Casino** — un swing nerveux en do mineur : contrebasse qui marche, cymbale,
  piano qui ponctue ;
- **Salon jazz** — une ballade aux balais : piano électrique qui tinte,
  contrebasse sur deux temps ;
- **Cabaret** — une valse musette à l'accordéon, la basse sur le 1 et l'accord
  sur le 2 et le 3 ;
- **Calme** — des nappes lentes et des clochettes, sans rythme.

Tout est composé à la volée (`src/web/musique.ts`), avec une part de hasard : la
musique ne boucle jamais tout à fait pareil. Une première version ne variait que
les accords d'une même nappe, et les trois morceaux calmes sonnaient pareil —
c'est le timbre et le rythme qui font qu'on reconnaît un morceau.

### Réagir

En ligne, le bouton 😊 à côté de votre main ouvre une palette de huit
réactions : 👍 😂 😱 😤 👏 🔥 🤞 👑. Celle qu'on choisit s'affiche quelques
secondes en bulle au-dessus de son nom, chez tout le monde à la table, avec un
petit « pop » pour les autres.

Il n'y a volontairement **pas de texte libre** : rien à modérer, rien qui se
lise mal venant d'un inconnu. Le serveur refuse tout ce qui n'est pas dans la
liste, ne relaie qu'à la table concernée, et ignore sans bruit les réactions
lancées à moins d'une seconde et demie d'intervalle.

En solo, ce sont **les bots qui réagissent**, de temps en temps et seulement
aux moments qui se voient : un 👑 quand l'un d'eux sort premier, un 🔥 quand il
coupe au 2, un 😱 ou un 😤 quand c'est vous qui coupez, des 👏 si vous sortez
premier — et un 😂 si vous finissez sur un 2. Chaque moment n'a qu'une chance
d'être relevé, pour qu'ils ne commentent pas tout (`src/web/humeurs.ts`).

### Les succès

Treize défis à relever en jouant — **De Larbin à Boss**, **Intouchable** (gagner
sans jamais avoir été Larbin), **Remontada**, **Carré de 2**, et même **Larbin
d'office** pour qui finit sur un 2. Une bannière les annonce quand on les
décroche ; « Vos succès », sur l'accueil et dans le parcours, montre ceux qu'on
a et ceux qui restent, avec leur consigne.

Comme le parcours, ils restent dans le navigateur : aucun compte, aucun envoi.
Chaque moment n'est compté qu'une fois — recharger la page sur l'écran de fin ne
débloque rien de plus — et un succès qui dépend de toute la partie
(« Intouchable ») n'est accordé qu'à qui l'a jouée en entier
(`src/web/succes.ts`).

### Les comptes

Facultatifs : sans compte, on joue en invité, comme avant. Un compte, c'est un
**pseudo et un code secret** — ni adresse e-mail ni mot de passe. Le code est
tiré par le serveur (16 caractères, 80 bits) et montré une seule fois ; le
serveur n'en garde qu'une empreinte, et personne ne peut le renvoyer. On en
obtient un nouveau depuis le panneau du compte, ce qui déconnecte les autres
appareils.

Avec un compte :

- les succès, le parcours et l'avatar suivent sur tous ses appareils — le
  navigateur garde sa copie, et les deux se réunissent à chaque synchronisation ;
- le pseudo est réservé : un invité qui le prend devient « Pseudo 2 », et les
  joueurs avec un compte portent un ✓ dans les salles d'attente ;
- les grossièretés sont refusées, même déguisées (`src/reseau/moderation.ts`) :
  un compte ne peut pas les prendre, et un invité qui en tape une s'assoit sous
  un nom tiré au sort ;
- en ligne, **le serveur décerne lui-même les succès** et les marque vérifiés
  (`src/reseau/recompenses.ts`). En solo, la partie se joue dans le navigateur :
  ses succès sont gardés, mais ne peuvent pas l'être ;
- chaque partie en ligne terminée entre au **classement public** : victoires,
  départagées par le nombre de parties ;
- mais il faut **au moins deux humains à la table** : seul face aux bots sur une
  table publique, on joue comme en solo — les succès se gagnent, sans être
  vérifiés, et rien n'entre au classement. « Premier contact » demande, lui
  aussi, un autre joueur en face.

« Supprimer mon compte » efface tout du serveur et libère le pseudo. Ce que le
jeu garde, et ne garde pas, est écrit sur la page
[/confidentialite](https://larbin.vercel.app/confidentialite).

Côté serveur, les comptes vivent dans PostgreSQL (`src/reseau/depot.ts`), dont
l'adresse est lue dans `DATABASE_URL` ou `POSTGRES_URI`. Sans base, en local,
ils vivent en mémoire ; sans base, en ligne, ils restent fermés — un dépôt en
mémoire y perdrait tout au premier redémarrage.

```
node scripts/reseau/e2e-comptes.mjs localhost:5177   # création, pseudo réservé, suppression
```

### Les avatars

Le rond à côté du nom, sur l'accueil, ouvre le choix de l'**avatar** : une
émoticône qui s'affiche à table, dans les salles d'attente et dans les
classements — et que les autres voient en ligne. Douze sont libres ; huit se
gagnent avec les succès (👑 pour **De Larbin à Boss**, 🤡 pour **Larbin
d'office**…), et la bannière du succès annonce l'avatar offert.

Le serveur n'accepte que la liste connue (`AVATARS`, dans le protocole) : comme
pour les réactions, rien d'autre ne s'affiche chez les autres. Il ne sait pas,
en revanche, quels succès un joueur a obtenus — ils restent dans son
navigateur —, si bien qu'un tricheur obstiné porterait une couronne imméritée.
C'est un risque qu'on accepte tant qu'il n'y a pas de comptes
(`src/web/avatars.ts`).

## Jouer à distance

Le jeu se joue sur **https://larbin.vercel.app**. Envoyez ce lien à vos proches,
ou dictez-leur le code du salon.

### Être trouvé

Personne ne cherche « Le Larbin » : on cherche « président jeu de cartes en
ligne » ou « trou du cul en ligne ». Le titre de la page et sa description le
disent donc en toutes lettres. L'accueil étant dessiné par le script, la page
porte aussi un court texte en clair (`#presentation` : titre, description, les
trois règles, lien vers `/regles`) pour les moteurs de recherche et les aperçus
de lien ; le jeu le retire dès son démarrage. Sur le site seulement, des données
structurées (`VideoGame`, gratuit) décrivent le jeu aux moteurs.

Bing et les moteurs du protocole **IndexNow** sont prévenus à chaque mise en
ligne de production : l'assemblage sur Vercel appelle `scripts/indexnow.mjs`,
qui leur signale l'accueil et les règles. La clé est le fichier
`src/web/statique/<clé>.txt`, publié à la racine du site ; elle n'a rien de
secret. On peut aussi les prévenir à la main : `node scripts/indexnow.mjs`.

### Compter sans ficher

Pour savoir si le jeu plaît, le serveur tient des compteurs anonymes, jour par
jour (heure de Paris) : visites, parties solo lancées et finies, didacticiels
finis, partages — annoncés par le navigateur (`src/web/mesure.ts`) — et, comptés
par le serveur lui-même, parties en ligne finies (dont entre humains) et comptes
créés. Rien d'autre qu'un total : ni joueur, ni appareil, ni adresse.

On les lit sur `https://<serveur>/stats?cle=…`, où la clé est celle de la
variable d'environnement `STATS_CLE` du serveur. Sans cette variable, la page
n'existe pas.

### Pourquoi deux hébergements

Render endort le service après un quart d'heure sans visite : le premier à
ouvrir le lien attend une trentaine de secondes que la machine se lève. Comme
cette attente a lieu pendant le chargement de la page, aucun code ne peut
l'adoucir — elle se passe avant que le jeu existe.

D'où le partage du travail :

- **la page** est un fichier statique, servi instantanément par un hébergeur qui
  ne dort jamais (Vercel) ;
- **le serveur de parties** tourne sur Render, et la page le réveille dès son
  chargement, pendant que le joueur entre son nom.

L'attente existe toujours, mais plus personne ne la voit. Et si le serveur n'est
pas encore debout au moment de créer un salon, la page le dit au lieu de rester
figée.

La page trouve son serveur toute seule : elle demande `/sante` à sa propre
adresse, et si personne ne répond, elle s'adresse à `HOTE_JEU`
(`src/web/table.ts`). Les deux adresses restent donc jouables — celle de Vercel
comme celle de Render en direct.

### Mettre la page en ligne

`vercel.json` fait le nécessaire : Vercel lance `npm run build` et ne publie que
le dossier `public/`, qui ne contient que la page. Le reste du dépôt n'est pas
exposé.

Sur vercel.com : **Add New → Project**, choisissez le dépôt `larbin`, laissez les
réglages détectés, **Deploy**. Chaque poussée sur `main` republie.

### Refaire le serveur ailleurs

« New → Web Service » chez l'hébergeur, pointé sur le dépôt, type d'instance
**Free**, région **Frankfurt**, contrôle de santé sur `/sante`. Attention, le
parcours manuel de Render ne lit pas le `render.yaml` — il faut cocher Free à la
main, sinon c'est l'offre payante.

Fly.io, Railway, Koyeb ou un petit VPS conviennent aussi — c'est la même image.
En local :

```
docker build -t larbin .
docker run -p 5177:5177 larbin
```

Le serveur lit la variable `PORT` si l'hébergeur en impose une, répond sur
`/sante` pour les contrôles automatiques, et prévient les joueurs avant de
redémarrer.

## Développer

Node 22.6 ou plus récent. Le projet lit le TypeScript directement : rien à
compiler pour le moteur, les tests ni le serveur.

```
npm test        # les règles, les points, les salons
npm run serveur # le serveur de jeu (page + parties)
npm run build   # réassemble Larbin.html
npm run watch   # réassemble à chaque modification
npm run jouer   # le banc d'essai en terminal
```

Seule l'interface passe par un assemblage : esbuild réunit le moteur et
l'affichage, et le tout est inséré dans `Larbin.html`. D'où le fichier unique.

### Éprouver le jeu en ligne

`npm test` couvre les règles et la logique de salon, mais pas le serveur ni les
WebSockets. Trois suites s'en chargent, contre un serveur réellement lancé —
celui de la machine, ou celui en production :

```
npm run serveur                                    # dans une autre fenêtre
node scripts/reseau/e2e-publique.mjs localhost:5177  # prêt, compte à rebours, départ
node scripts/reseau/e2e-tables.mjs localhost:5177    # liste, reprise d'un bot, salon privé
node scripts/reseau/e2e-inactif.mjs localhost:5177   # le joueur muet (une minute d'attente)
node scripts/reseau/e2e-reactions.mjs localhost:5177 # réactions : relayées, filtrées, espacées
node scripts/reseau/e2e-pause.mjs localhost:5177     # une table sans humain se met en pause
node scripts/reseau/un-visiteur.mjs localhost:5177   # s'assoit et reste, pour regarder l'écran
node scripts/reseau/charge.mjs localhost:5177 --paliers 10,50,100 --duree 30   # test de charge
```

Le test de charge ouvre des tables de quatre joueurs simulés, par paliers, et
mesure le temps de réponse à chaque coup (`--pid` ajoute le processeur du
serveur, sous Windows). Ses tables s'arrêtent après la troisième manche : aucune
partie de test ne se termine, rien n'entre aux compteurs. Mesuré le 26 sept.
2026 : 250 tables (1 000 joueurs) sur un PC tiennent en 11 % d'un cœur et 204 Mo.

Elles fonctionnent aussi sur le serveur en ligne (p01--larbin--xp64cmfbzy56.code.run). Deux avertissements dans ce
cas : un hébergeur qui endort ses serveurs met du temps à les réveiller, et une dizaine
de secondes à apprendre qu'une socket s'est fermée — les essais observent donc
au lieu de parier sur un délai. Et pendant un redéploiement, le serveur est
remplacé en cours de route : une suite lancée à ce moment-là échoue sur les
minuteurs, sans que rien ne soit cassé. Relancez-la.

### Toucher au bot

L'intuition se trompe beaucoup sur ce jeu, et une mesure isolée ment volontiers.
Toute modification du bot passe donc par l'arène :

```
node scripts/arene.mjs                  # le candidat contre le bot en place
node scripts/arene.mjs 2000 --series=4  # plus long, plus sûr
node scripts/arene.mjs --calibrage      # le bot contre sa copie : doit être indécis
```

On écrit l'idée dans `src/engine/bot-candidat.ts` — une copie conforme de
`bot.ts` — et l'arène tranche. Elle joue plusieurs séries sur des donnes
indépendantes, fait tourner les places autour de la table, et refuse de conclure
quand l'écart tient dans la marge d'erreur.

Il faut la croire quand elle dit « indécis » : la dispersion entre séries est
presque le double de la marge binomiale, et une seule série ne prouve rien.

Il ne faut pas pour autant la croire sur tout. Elle compare deux bots entre
eux, et un défaut qu'ils partagent ne s'y voit jamais. C'est un joueur qui a
remarqué que les bots finissaient souvent sur un 2 : ils comparaient les cartes
par référence au lieu de leur identifiant, et leur garde-fou ne s'était jamais
déclenché — pas plus que l'un des principes qu'une mesure précédente croyait
avoir validés. L'arène compte désormais les fins sur un 2 : le correctif les a
fait passer de 12 % des manches, par joueur, à zéro, et le bot corrigé remporte
75,8 % ± 1,1 des parties décisives face à l'ancien.

## Où en est le chantier

- [x] **Le moteur de règles** — complet, testé, sans dépendance.
- [x] **Un banc d'essai en terminal.**
- [x] **L'interface** — cartes, éventail, panneaux, pensée téléphone d'abord.
- [x] **Les points** — score par manche, objectif de partie, classement final.
- [x] **Le multijoueur** — salons, invitation par lien, bots d'appoint,
      reconnexion.
- [x] **Trois tapis** — Feutre, Bordeaux, Ardoise. Pur habillage : rien qui
      touche aux règles ni à ce qu'un joueur voit.
- [x] **En ligne** — https://larbin.vercel.app pour la page, instantanée ;
      Northflank (p01--larbin--xp64cmfbzy56.code.run) pour les parties, toujours éveillé. Chaque poussée
      sur `main` republie les deux.

## Comment c'est rangé

    src/engine/types.ts      les types partagés
    src/engine/cards.ts      le paquet, les hauteurs, le tri des mains
    src/engine/rng.ts        tirage déterministe (parties rejouables)
    src/engine/game.ts       les règles : distribution, séries, rôles, échanges
    src/engine/bot.ts        l'adversaire artificiel
    src/reseau/protocole.ts  ce que s'échangent le navigateur et le serveur
    src/reseau/salon.ts      une table, ses places, sa partie
    src/reseau/serveur.ts    HTTP + WebSocket, l'arbitre
    src/web/table.ts         la table vue du client : solo ou en ligne
    src/web/app.ts           l'affichage et les gestes
    src/web/themes.ts        les habillages de la table
    src/web/style.css        le tapis, les cartes, les panneaux
    src/cli.ts               le jeu en terminal
    scripts/build.mjs        assemble Larbin.html
    test/                    règles, points, salons
    Dockerfile               l'image de déploiement
    render.yaml              la configuration du serveur chez Render
    vercel.json              la configuration de la page chez Vercel

## Le principe qui tient tout

Le moteur est une pile de fonctions pures. `apply(état, action)` renvoie un
nouvel état sans toucher à l'ancien, et `viewFor(état, joueur)` ne montre à
chacun que sa propre main.

En ligne, `apply` tourne sur le serveur et les clients ne reçoivent jamais que
leur `viewFor`. Un joueur ne peut donc ni voir le jeu des autres, ni jouer à
leur place, ni forcer un coup illégal — le serveur refuse, la console du
navigateur n'y change rien. C'est ce qui a permis au multijoueur de se brancher
sans réécrire les règles.
