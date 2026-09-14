import { MongoClient, type Db } from "mongodb"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Position = "ARQ" | "DEF" | "MED" | "DEL"

type Group = { id: string; name: string }
type Player = { id: string; name: string; groups: string[]; positions: Position[]; active: boolean }
type Evaluation = {
  id: string
  playerId: string
  groupId: string
  month: string
  scores: Record<string, number>
  updatedAt: string
}

type Payload = {
  type: "group" | "player" | "evaluation"
  action: "upsert" | "delete"
  data: Partial<Group & Player & Evaluation> & { id: string }
}

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB || "futbol_amateur"

const globalForMongo = globalThis as unknown as { _mongoClientPromise?: Promise<MongoClient> }

function getClientPromise() {
  if (!uri) {
    throw new Error("Falta MONGODB_URI en .env.local")
  }

  if (uri.includes("REEMPLAZAR_USUARIO") || uri.includes("<db_username>")) {
    throw new Error("MONGODB_URI todavia tiene el usuario de ejemplo. Reemplazalo por el usuario real de MongoDB Atlas en .env.local")
  }

  if (!globalForMongo._mongoClientPromise) {
    globalForMongo._mongoClientPromise = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 }).connect()
  }

  return globalForMongo._mongoClientPromise
}

async function getDb(): Promise<Db> {
  try {
    const client = await getClientPromise()
    return client.db(dbName)
  } catch (error) {
    globalForMongo._mongoClientPromise = undefined

    const message = (error as Error).message
    if (message.includes("bad auth") || message.includes("Authentication failed")) {
      throw new Error("Usuario o contrasena de MongoDB incorrectos. Revisa MONGODB_URI en .env.local")
    }
    if (message.includes("ENOTFOUND") || message.includes("querySrv")) {
      throw new Error("No se pudo resolver el cluster de MongoDB. Revisa la URL del cluster")
    }
    if (message.includes("timed out") || message.includes("ETIMEDOUT")) {
      throw new Error("Tiempo de espera agotado. Habilita tu IP en Network Access de MongoDB Atlas")
    }

    throw error
  }
}

export async function GET() {
  try {
    const db = await getDb()
    const [groups, players, evaluations] = await Promise.all([
      db.collection<Group>("groups").find({}, { projection: { _id: 0 } }).toArray(),
      db.collection<Player>("players").find({}, { projection: { _id: 0 } }).toArray(),
      db.collection<Evaluation>("evaluations").find({}, { projection: { _id: 0 } }).toArray(),
    ])

    return NextResponse.json({ groups, players, evaluations })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Payload
    if (!body?.type || !body?.action || !body?.data?.id) {
      return NextResponse.json({ error: "Payload invalido" }, { status: 400 })
    }

    const collections = { group: "groups", player: "players", evaluation: "evaluations" } as const
    const db = await getDb()
    const collection = db.collection(collections[body.type])

    if (body.action === "delete") {
      await collection.deleteOne({ id: body.data.id })

      if (body.type === "group") {
        await db.collection("evaluations").deleteMany({ groupId: body.data.id })
        await db.collection<Player>("players").updateMany({}, { $pull: { groups: body.data.id } })
      }

      if (body.type === "player") {
        await db.collection("evaluations").deleteMany({ playerId: body.data.id })
      }
    } else {
      const { id, ...rest } = body.data
      await collection.updateOne({ id }, { $set: { id, ...rest } }, { upsert: true })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

