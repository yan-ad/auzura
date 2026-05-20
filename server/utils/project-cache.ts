import { attachDatabasePool } from '@vercel/functions'
import { MongoClient, type Collection, type Db } from 'mongodb'
import type { AzureProject } from '../../app/types/azure-devops'

type ProjectCacheDocument = {
  userKey: string
  organization: string
  projects: AzureProject[]
  updatedAt: Date
}

let mongoClient: MongoClient | undefined
let mongoClientPromise: Promise<MongoClient> | undefined

function getRuntimeConfig() {
  const runtimeGlobal = globalThis as typeof globalThis & { useRuntimeConfig?: () => { mongodbUri?: unknown, mongodbDb?: unknown } }
  return typeof runtimeGlobal.useRuntimeConfig === 'function' ? runtimeGlobal.useRuntimeConfig() : {}
}

function getMongoUri(): string {
  const config = getRuntimeConfig()
  const uri = String(config.mongodbUri || process.env.MONGODB_URI || '').trim()

  if (!uri) {
    throw new Error('MONGODB_URI is required for project cache.')
  }

  return uri
}

function getDatabaseName(): string {
  const config = getRuntimeConfig()
  return String(config.mongodbDb || process.env.MONGODB_DB || 'auzura').trim() || 'auzura'
}

function getMongoClient(): Promise<MongoClient> {
  if (mongoClientPromise) return mongoClientPromise

  mongoClient = new MongoClient(getMongoUri())
  attachDatabasePool(mongoClient)
  mongoClientPromise = mongoClient.connect()

  return mongoClientPromise
}

async function getDatabase(): Promise<Db> {
  const client = await getMongoClient()
  return client.db(getDatabaseName())
}

async function getCollection(): Promise<Collection<ProjectCacheDocument>> {
  const db = await getDatabase()
  const collection = db.collection<ProjectCacheDocument>('project_cache')

  await collection.createIndex({ userKey: 1, organization: 1 }, { unique: true })
  await collection.createIndex({ updatedAt: -1 })

  return collection
}

export function getSessionUserKey(user?: { email?: string, displayName?: string } | null): string | undefined {
  const email = String(user?.email || '').trim().toLowerCase()
  if (email) return email

  const displayName = String(user?.displayName || '').trim().toLowerCase()
  return displayName || undefined
}

export async function getCachedProjects(userKey: string, organization: string): Promise<AzureProject[]> {
  if (!userKey || !organization) return []
  const collection = await getCollection()
  const document = await collection.findOne({ userKey, organization })
  return document?.projects ?? []
}

export async function setCachedProjects(userKey: string, organization: string, projects: AzureProject[]): Promise<void> {
  if (!userKey || !organization) return
  const collection = await getCollection()
  await collection.updateOne(
    { userKey, organization },
    {
      $set: {
        userKey,
        organization,
        projects,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  )
}
