import { MongoClient, MongoServerError, type Collection, type Db } from "mongodb";
import { DuplicateError, type Store } from "./types.js";
import type { Alert, ModelRun, User } from "../types.js";

/** MongoDB-backed store (works with Atlas). `_id` is used for natural keys. */
export function mongoStore(uri: string, dbName = "pump_guardian"): Store {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  let db: Db;
  let users: Collection<User & { _id: string }>;
  let alerts: Collection<Alert & { _id: string }>;
  let runs: Collection<ModelRun & { _id: string }>;

  const strip = <T extends { _id?: unknown }>(doc: T | null): Omit<T, "_id"> | null => {
    if (!doc) return null;
    const { _id: _ignored, ...rest } = doc;
    return rest;
  };

  return {
    kind: "mongo",
    async init() {
      await client.connect();
      db = client.db(dbName);
      users = db.collection("users");
      alerts = db.collection("alerts");
      runs = db.collection("modelRuns");
      await alerts.createIndex({ start: -1 });
      await alerts.createIndex({ status: 1 });
      await runs.createIndex({ recordedAt: -1 });
    },
    async close() { await client.close(); },
    users: {
      count: () => users.countDocuments(),
      find: async (username) => strip(await users.findOne({ _id: username.toLowerCase() })) as User | null,
      async create(u) {
        const key = u.username.toLowerCase();
        const user: User = { ...u, username: key, createdAt: new Date().toISOString() };
        try { await users.insertOne({ ...user, _id: key }); }
        catch (e) { if (e instanceof MongoServerError && e.code === 11000) throw new DuplicateError("username taken"); throw e; }
        return user;
      },
      async list() {
        const docs = await users.find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: 1 }).toArray();
        return docs.map((d) => strip(d)) as Omit<User, "passwordHash">[];
      },
    },
    alerts: {
      async upsert(a) {
        const { acknowledged: _a, acknowledgedBy: _b, acknowledgedAt: _c, id, ...fields } = a;
        await alerts.updateOne(
          { _id: id },
          { $set: { ...fields, id }, $setOnInsert: { acknowledged: false } },
          { upsert: true },
        );
      },
      get: async (id) => strip(await alerts.findOne({ _id: id })) as Alert | null,
      async list(upTo) {
        const docs = await alerts.find(upTo ? { start: { $lte: upTo } } : {}).sort({ start: -1 }).limit(500).toArray();
        return docs.map((d) => strip(d)) as Alert[];
      },
      async ack(id, by) {
        const doc = await alerts.findOneAndUpdate(
          { _id: id },
          { $set: { acknowledged: true, acknowledgedBy: by, acknowledgedAt: new Date().toISOString() } },
          { returnDocument: "after" },
        );
        return strip(doc) as Alert | null;
      },
    },
    modelRuns: {
      async record(r) { await runs.updateOne({ _id: r.id }, { $setOnInsert: { ...r } }, { upsert: true }); },
      async list() { return (await runs.find().sort({ recordedAt: -1 }).limit(50).toArray()).map((d) => strip(d)) as ModelRun[]; },
    },
  };
}
