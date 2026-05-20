import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AzureWorkItem } from '../../app/types/azure-devops'

const DEFAULT_SQLITE_PATH = join(process.cwd(), '.data', 'auzura.sqlite')

type SqliteDatabase = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...params: unknown[]) => unknown
    get: (...params: unknown[]) => Record<string, unknown> | undefined
    all: (...params: unknown[]) => Array<Record<string, unknown>>
  }
}

export type DashboardMetrics = {
  total: number
  byState: Array<{ label: string, count: number, percent: number }>
  byType: Array<{ label: string, count: number, percent: number }>
  byAssignee: Array<{ label: string, count: number, percent: number }>
  freshness: Array<{ label: string, count: number, percent: number }>
  lastSyncedAt?: string
}

type CountRow = {
  label?: string
  count: number
}

let database: SqliteDatabase | undefined

function getSqlitePath(): string {
  return process.env.AUZURA_SQLITE_PATH || DEFAULT_SQLITE_PATH
}

async function createDatabase(sqlitePath: string): Promise<SqliteDatabase> {
  const nodeSqlite = await import('node:sqlite')
  const DatabaseSync = nodeSqlite.DatabaseSync as new (path: string) => SqliteDatabase & { pragma?: (statement: string) => unknown }
  const db = new DatabaseSync(sqlitePath)
  db.pragma?.('journal_mode = WAL')
  return db
}

async function getDatabase(): Promise<SqliteDatabase> {
  if (database) return database

  const sqlitePath = getSqlitePath()
  mkdirSync(dirname(sqlitePath), { recursive: true })
  database = await createDatabase(sqlitePath)
  database.exec(`
    CREATE TABLE IF NOT EXISTS work_item_cache (
      organization TEXT NOT NULL,
      project TEXT NOT NULL,
      id INTEGER NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      state TEXT NOT NULL,
      assigned_to TEXT,
      created_by TEXT,
      changed_date TEXT,
      created_date TEXT,
      cached_at TEXT NOT NULL,
      PRIMARY KEY (organization, project, id)
    )
  `)

  return database
}

function getBucketForChangedDate(value?: string): string {
  if (!value) return 'No update date'

  const changedAt = new Date(value).getTime()
  if (!Number.isFinite(changedAt)) return 'No update date'

  const ageInDays = (Date.now() - changedAt) / 86_400_000
  if (ageInDays <= 1) return 'Updated today'
  if (ageInDays <= 7) return 'This week'
  if (ageInDays <= 30) return 'This month'
  return 'Older'
}

function withPercent(rows: CountRow[], total: number): Array<{ label: string, count: number, percent: number }> {
  return rows.map((row) => ({
    label: row.label || '—',
    count: row.count,
    percent: total ? Math.round((row.count / total) * 100) : 0
  }))
}

function toCountRows(rows: Array<Record<string, unknown>>): CountRow[] {
  return rows.map((row) => ({
    label: typeof row.label === 'string' ? row.label : undefined,
    count: Number(row.count || 0)
  }))
}

export async function cacheWorkItemsForDashboard(organization: string, project: string, items: AzureWorkItem[]): Promise<void> {
  if (!organization || !project || !items.length) return

  const db = await getDatabase()
  const cachedAt = new Date().toISOString()
  const upsert = db.prepare(`
    INSERT INTO work_item_cache (
      organization,
      project,
      id,
      title,
      type,
      state,
      assigned_to,
      created_by,
      changed_date,
      created_date,
      cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization, project, id) DO UPDATE SET
      title = excluded.title,
      type = excluded.type,
      state = excluded.state,
      assigned_to = excluded.assigned_to,
      created_by = excluded.created_by,
      changed_date = excluded.changed_date,
      created_date = excluded.created_date,
      cached_at = excluded.cached_at
  `)

  db.exec('BEGIN')

  try {
    for (const item of items) {
      upsert.run(
        organization,
        project,
        item.id,
        item.title,
        item.type,
        item.state,
        item.assignedTo || null,
        item.createdBy || null,
        item.changedDate || null,
        item.createdDate || null,
        cachedAt
      )
    }

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export async function getDashboardMetrics(organization: string, project: string): Promise<DashboardMetrics> {
  if (!organization || !project) {
    return { total: 0, byState: [], byType: [], byAssignee: [], freshness: [] }
  }

  const db = await getDatabase()
  const params = [organization, project]
  const totalRow = db.prepare('SELECT COUNT(*) AS count FROM work_item_cache WHERE organization = ? AND project = ?').get(...params)
  const total = Number(totalRow?.count || 0)
  const lastSyncedAt = db.prepare('SELECT MAX(cached_at) AS lastSyncedAt FROM work_item_cache WHERE organization = ? AND project = ?').get(...params)?.lastSyncedAt as string | undefined
  const byState = toCountRows(db.prepare(`
    SELECT state AS label, COUNT(*) AS count
    FROM work_item_cache
    WHERE organization = ? AND project = ?
    GROUP BY state
    ORDER BY count DESC, state ASC
  `).all(...params))
  const byType = toCountRows(db.prepare(`
    SELECT type AS label, COUNT(*) AS count
    FROM work_item_cache
    WHERE organization = ? AND project = ?
    GROUP BY type
    ORDER BY count DESC, type ASC
  `).all(...params))
  const byAssignee = toCountRows(db.prepare(`
    SELECT COALESCE(NULLIF(assigned_to, ''), 'Unassigned') AS label, COUNT(*) AS count
    FROM work_item_cache
    WHERE organization = ? AND project = ?
    GROUP BY COALESCE(NULLIF(assigned_to, ''), 'Unassigned')
    ORDER BY count DESC, label ASC
    LIMIT 6
  `).all(...params))
  const cachedItems = db.prepare(`
    SELECT changed_date AS changedDate
    FROM work_item_cache
    WHERE organization = ? AND project = ?
  `).all(...params) as Array<{ changedDate?: string }>
  const freshnessCounts = new Map<string, number>()

  for (const item of cachedItems) {
    const bucket = getBucketForChangedDate(item.changedDate)
    freshnessCounts.set(bucket, (freshnessCounts.get(bucket) || 0) + 1)
  }

  const freshnessOrder = ['Updated today', 'This week', 'This month', 'Older', 'No update date']
  const freshness = freshnessOrder
    .filter((label) => freshnessCounts.has(label))
    .map((label) => ({ label, count: freshnessCounts.get(label) || 0 }))

  return {
    total,
    byState: withPercent(byState, total),
    byType: withPercent(byType, total),
    byAssignee: withPercent(byAssignee, total),
    freshness: withPercent(freshness, total),
    lastSyncedAt
  }
}
