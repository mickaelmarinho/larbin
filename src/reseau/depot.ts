/**
 * Où vivent les comptes.
 *
 * Deux dépôts qui répondent aux mêmes questions : l'un en mémoire, pour jouer
 * et éprouver le jeu sur son PC ; l'autre dans PostgreSQL, pour le site. En
 * ligne, sans base de données, les comptes restent fermés : un dépôt en
 * mémoire y perdrait tout au premier redémarrage, codes secrets compris.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import type { Parcours } from '../web/parcours.ts';
import { listeSucces, type SuccesDate } from '../web/succes.ts';
import { cleDePseudo } from './comptes.ts';

export interface Compte {
  id: string;
  pseudo: string;
  avatar: string | null;
  /** ISO. */
  creeLe: string;
}

/** Ce qu'un compte transporte d'un appareil à l'autre. */
export interface Donnees {
  parcours: Parcours | null;
  succes: SuccesDate[];
}

export interface LigneClassement {
  pseudo: string;
  avatar: string | null;
  victoires: number;
  parties: number;
}

export interface Depot {
  preparer(): Promise<void>;
  /** Null si le pseudo est déjà pris. */
  creerCompte(pseudo: string, codeHash: string): Promise<Compte | null>;
  compteParPseudo(pseudo: string): Promise<{ compte: Compte; codeHash: string } | null>;
  compteParSession(jetonHash: string): Promise<Compte | null>;
  ouvrirSession(compteId: string, jetonHash: string): Promise<void>;
  fermerSession(jetonHash: string): Promise<void>;
  /** Ferme toutes les sessions du compte, sauf celle qu'on désigne. */
  fermerSessions(compteId: string, sauf?: string): Promise<void>;
  changerCode(compteId: string, codeHash: string): Promise<void>;
  changerAvatar(compteId: string, avatar: string | null): Promise<void>;
  supprimerCompte(compteId: string): Promise<void>;
  pseudoPris(pseudo: string): Promise<boolean>;
  lireDonnees(compteId: string): Promise<Donnees>;
  /** Lit et réécrit d'un seul tenant : deux écritures simultanées ne s'écrasent pas. */
  modifierDonnees(compteId: string, changer: (d: Donnees) => Donnees): Promise<Donnees>;
  /** Une partie en ligne terminée, vue par le serveur. */
  noterResultat(compteId: string, resultat: { date: string; gagne: boolean }): Promise<void>;
  resultats(compteId: string): Promise<{ parties: number; serie: number }>;
  classement(limite: number): Promise<LigneClassement[]>;
}

const donneesVides = (): Donnees => ({ parcours: null, succes: [] });

/** Les victoires d'affilée, en partant de la plus récente. */
const serieDe = (gagnes: boolean[]): number => {
  const fin = gagnes.indexOf(false);
  return fin === -1 ? gagnes.length : fin;
};

/* ------------------------------------------------------------ en mémoire */

export class DepotMemoire implements Depot {
  private comptes = new Map<string, { compte: Compte; cle: string; codeHash: string; donnees: Donnees }>();
  private sessions = new Map<string, string>();
  private resultatsParCompte = new Map<string, Array<{ date: string; gagne: boolean }>>();

  async preparer(): Promise<void> {}

  async creerCompte(pseudo: string, codeHash: string): Promise<Compte | null> {
    const cle = cleDePseudo(pseudo);
    if ([...this.comptes.values()].some((c) => c.cle === cle)) return null;
    const compte: Compte = { id: randomUUID(), pseudo, avatar: null, creeLe: new Date().toISOString() };
    this.comptes.set(compte.id, { compte, cle, codeHash, donnees: donneesVides() });
    return { ...compte };
  }

  async compteParPseudo(pseudo: string) {
    const cle = cleDePseudo(pseudo);
    const trouve = [...this.comptes.values()].find((c) => c.cle === cle);
    return trouve ? { compte: { ...trouve.compte }, codeHash: trouve.codeHash } : null;
  }

  async compteParSession(jetonHash: string): Promise<Compte | null> {
    const id = this.sessions.get(jetonHash);
    const trouve = id ? this.comptes.get(id) : undefined;
    return trouve ? { ...trouve.compte } : null;
  }

  async ouvrirSession(compteId: string, jetonHash: string): Promise<void> {
    this.sessions.set(jetonHash, compteId);
  }

  async fermerSession(jetonHash: string): Promise<void> {
    this.sessions.delete(jetonHash);
  }

  async fermerSessions(compteId: string, sauf?: string): Promise<void> {
    for (const [jeton, id] of this.sessions) {
      if (id === compteId && jeton !== sauf) this.sessions.delete(jeton);
    }
  }

  async changerCode(compteId: string, codeHash: string): Promise<void> {
    const trouve = this.comptes.get(compteId);
    if (trouve) trouve.codeHash = codeHash;
  }

  async changerAvatar(compteId: string, avatar: string | null): Promise<void> {
    const trouve = this.comptes.get(compteId);
    if (trouve) trouve.compte.avatar = avatar;
  }

  async supprimerCompte(compteId: string): Promise<void> {
    this.comptes.delete(compteId);
    this.resultatsParCompte.delete(compteId);
    await this.fermerSessions(compteId);
  }

  async pseudoPris(pseudo: string): Promise<boolean> {
    return (await this.compteParPseudo(pseudo)) !== null;
  }

  async lireDonnees(compteId: string): Promise<Donnees> {
    const trouve = this.comptes.get(compteId);
    return trouve ? structuredClone(trouve.donnees) : donneesVides();
  }

  async modifierDonnees(compteId: string, changer: (d: Donnees) => Donnees): Promise<Donnees> {
    const trouve = this.comptes.get(compteId);
    if (!trouve) return donneesVides();
    trouve.donnees = changer(structuredClone(trouve.donnees));
    return structuredClone(trouve.donnees);
  }

  async noterResultat(compteId: string, resultat: { date: string; gagne: boolean }): Promise<void> {
    if (!this.comptes.has(compteId)) return;
    const liste = this.resultatsParCompte.get(compteId) ?? [];
    liste.push(resultat);
    this.resultatsParCompte.set(compteId, liste);
  }

  async resultats(compteId: string) {
    const liste = [...(this.resultatsParCompte.get(compteId) ?? [])].sort((a, b) => b.date.localeCompare(a.date));
    return { parties: liste.length, serie: serieDe(liste.map((r) => r.gagne)) };
  }

  async classement(limite: number): Promise<LigneClassement[]> {
    const lignes: LigneClassement[] = [];
    for (const [id, liste] of this.resultatsParCompte) {
      const trouve = this.comptes.get(id);
      if (!trouve || liste.length === 0) continue;
      lignes.push({
        pseudo: trouve.compte.pseudo,
        avatar: trouve.compte.avatar,
        victoires: liste.filter((r) => r.gagne).length,
        parties: liste.length,
      });
    }
    return lignes.sort(ordreDuClassement).slice(0, limite);
  }
}

/** Le plus de victoires d'abord ; à égalité, qui les a obtenues en moins de parties. */
const ordreDuClassement = (a: LigneClassement, b: LigneClassement) =>
  b.victoires - a.victoires || a.parties - b.parties || a.pseudo.localeCompare(b.pseudo);

/* ------------------------------------------------------------ PostgreSQL */

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS comptes (
    id TEXT PRIMARY KEY,
    pseudo TEXT NOT NULL,
    cle TEXT NOT NULL UNIQUE,
    code_hash TEXT NOT NULL,
    avatar TEXT,
    cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
    parcours JSONB,
    succes JSONB NOT NULL DEFAULT '[]'::jsonb
  );
  CREATE TABLE IF NOT EXISTS sessions (
    jeton_hash TEXT PRIMARY KEY,
    compte_id TEXT NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
    cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS resultats (
    compte_id TEXT NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
    date TIMESTAMPTZ NOT NULL,
    gagne BOOLEAN NOT NULL
  );
  CREATE INDEX IF NOT EXISTS resultats_par_compte ON resultats (compte_id, date DESC);
  CREATE TABLE IF NOT EXISTS reperes (
    nom TEXT PRIMARY KEY,
    le TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

/**
 * Les remises en ordre à ne jouer qu'une fois. Chacune laisse son nom dans
 * `reperes`, dans la même transaction : un redémarrage ne la rejoue jamais.
 */
const UNE_FOIS: Array<{ nom: string; sql: string }> = [
  // Jusqu'au 15 sept. 2026, une partie gagnée seul face aux bots comptait au
  // classement. La base ne dit pas qui était à table : on repart de zéro.
  { nom: 'classement-sans-parties-contre-les-bots', sql: 'DELETE FROM resultats' },
];

interface LigneCompte {
  id: string;
  pseudo: string;
  avatar: string | null;
  cree_le: Date;
}

const enCompte = (l: LigneCompte): Compte =>
  ({ id: l.id, pseudo: l.pseudo, avatar: l.avatar, creeLe: new Date(l.cree_le).toISOString() });

const enDonnees = (l: { parcours: unknown; succes: unknown } | undefined): Donnees =>
  ({ parcours: (l?.parcours as Parcours | null) ?? null, succes: listeSucces(l?.succes) });

class DepotPostgres implements Depot {
  private pool: pg.Pool;

  constructor(adresse: string) {
    // Les hébergeurs chiffrent la connexion avec un certificat à eux ; on garde
    // le chiffrement sans exiger qu'il soit signé par une autorité connue.
    const url = new URL(adresse);
    const mode = url.searchParams.get('sslmode');
    url.searchParams.delete('sslmode');
    this.pool = new pg.Pool({
      connectionString: url.toString(),
      ssl: mode && mode !== 'disable' ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
  }

  async preparer(): Promise<void> {
    await this.pool.query(SCHEMA);
    for (const { nom, sql } of UNE_FOIS) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const { rowCount } = await client.query('INSERT INTO reperes (nom) VALUES ($1) ON CONFLICT DO NOTHING', [nom]);
        if (rowCount) {
          await client.query(sql);
          console.log(`Base : « ${nom} » appliqué.`);
        }
        await client.query('COMMIT');
      } catch (erreur) {
        await client.query('ROLLBACK');
        throw erreur;
      } finally {
        client.release();
      }
    }
  }

  async creerCompte(pseudo: string, codeHash: string): Promise<Compte | null> {
    const { rows } = await this.pool.query<LigneCompte>(
      `INSERT INTO comptes (id, pseudo, cle, code_hash) VALUES ($1, $2, $3, $4)
       ON CONFLICT (cle) DO NOTHING RETURNING id, pseudo, avatar, cree_le`,
      [randomUUID(), pseudo, cleDePseudo(pseudo), codeHash],
    );
    return rows[0] ? enCompte(rows[0]) : null;
  }

  async compteParPseudo(pseudo: string) {
    const { rows } = await this.pool.query<LigneCompte & { code_hash: string }>(
      'SELECT id, pseudo, avatar, cree_le, code_hash FROM comptes WHERE cle = $1',
      [cleDePseudo(pseudo)],
    );
    return rows[0] ? { compte: enCompte(rows[0]), codeHash: rows[0].code_hash } : null;
  }

  async compteParSession(jetonHash: string): Promise<Compte | null> {
    const { rows } = await this.pool.query<LigneCompte>(
      `SELECT c.id, c.pseudo, c.avatar, c.cree_le FROM sessions s
       JOIN comptes c ON c.id = s.compte_id WHERE s.jeton_hash = $1`,
      [jetonHash],
    );
    return rows[0] ? enCompte(rows[0]) : null;
  }

  async ouvrirSession(compteId: string, jetonHash: string): Promise<void> {
    await this.pool.query('INSERT INTO sessions (jeton_hash, compte_id) VALUES ($1, $2)', [jetonHash, compteId]);
  }

  async fermerSession(jetonHash: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE jeton_hash = $1', [jetonHash]);
  }

  async fermerSessions(compteId: string, sauf?: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE compte_id = $1 AND jeton_hash <> $2', [compteId, sauf ?? '']);
  }

  async changerCode(compteId: string, codeHash: string): Promise<void> {
    await this.pool.query('UPDATE comptes SET code_hash = $2 WHERE id = $1', [compteId, codeHash]);
  }

  async changerAvatar(compteId: string, avatar: string | null): Promise<void> {
    await this.pool.query('UPDATE comptes SET avatar = $2 WHERE id = $1', [compteId, avatar]);
  }

  async supprimerCompte(compteId: string): Promise<void> {
    // Les sessions et les résultats partent avec lui (ON DELETE CASCADE).
    await this.pool.query('DELETE FROM comptes WHERE id = $1', [compteId]);
  }

  async pseudoPris(pseudo: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('SELECT 1 FROM comptes WHERE cle = $1', [cleDePseudo(pseudo)]);
    return (rowCount ?? 0) > 0;
  }

  async lireDonnees(compteId: string): Promise<Donnees> {
    const { rows } = await this.pool.query('SELECT parcours, succes FROM comptes WHERE id = $1', [compteId]);
    return enDonnees(rows[0]);
  }

  async modifierDonnees(compteId: string, changer: (d: Donnees) => Donnees): Promise<Donnees> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT parcours, succes FROM comptes WHERE id = $1 FOR UPDATE', [compteId]);
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return donneesVides();
      }
      const nouvelles = changer(enDonnees(rows[0]));
      await client.query(
        'UPDATE comptes SET parcours = $2::jsonb, succes = $3::jsonb WHERE id = $1',
        [compteId, JSON.stringify(nouvelles.parcours), JSON.stringify(nouvelles.succes)],
      );
      await client.query('COMMIT');
      return nouvelles;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async noterResultat(compteId: string, resultat: { date: string; gagne: boolean }): Promise<void> {
    await this.pool.query(
      'INSERT INTO resultats (compte_id, date, gagne) SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM comptes WHERE id = $1)',
      [compteId, resultat.date, resultat.gagne],
    );
  }

  async resultats(compteId: string) {
    const [total, derniers] = await Promise.all([
      this.pool.query<{ parties: number }>('SELECT COUNT(*)::int AS parties FROM resultats WHERE compte_id = $1', [compteId]),
      this.pool.query<{ gagne: boolean }>(
        'SELECT gagne FROM resultats WHERE compte_id = $1 ORDER BY date DESC LIMIT 100',
        [compteId],
      ),
    ]);
    return { parties: total.rows[0]?.parties ?? 0, serie: serieDe(derniers.rows.map((r) => r.gagne)) };
  }

  async classement(limite: number): Promise<LigneClassement[]> {
    const { rows } = await this.pool.query<LigneClassement>(
      `SELECT c.pseudo, c.avatar,
              COUNT(*) FILTER (WHERE r.gagne)::int AS victoires,
              COUNT(*)::int AS parties
       FROM resultats r JOIN comptes c ON c.id = r.compte_id
       GROUP BY c.id, c.pseudo, c.avatar
       ORDER BY victoires DESC, parties ASC, c.pseudo ASC
       LIMIT $1`,
      [limite],
    );
    return rows;
  }
}

/**
 * Le dépôt qui convient. Une adresse de base de données : PostgreSQL. Aucune,
 * en local : la mémoire. Aucune, en ligne : pas de comptes du tout.
 */
export async function choisirDepot(env: NodeJS.ProcessEnv = process.env): Promise<Depot | null> {
  const adresse = env.DATABASE_URL ?? env.POSTGRES_URI ?? env.POSTGRES_URI_ADMIN;
  if (!adresse) {
    if (env.NODE_ENV === 'production') {
      console.log('Aucune base de données : les comptes restent fermés.');
      return null;
    }
    return new DepotMemoire();
  }
  try {
    const depot = new DepotPostgres(adresse);
    await depot.preparer();
    console.log('Comptes : base de données branchée.');
    return depot;
  } catch (err) {
    console.error('Base de données injoignable : les comptes restent fermés.', err instanceof Error ? err.message : err);
    return null;
  }
}
