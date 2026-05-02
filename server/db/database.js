import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, 'youtube_analyzer.db'))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    access_token TEXT,
    refresh_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscription_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscription_category_map (
    subscription_id TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES subscription_categories(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (subscription_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS pending_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    channel_id TEXT,
    channel_title TEXT,
    thumbnail_url TEXT,
    duration TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    watched_at DATETIME,
    notes TEXT,
    UNIQUE(user_id, video_id)
  );

  CREATE TABLE IF NOT EXISTS favorite_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    channel_id TEXT,
    channel_title TEXT,
    thumbnail_url TEXT,
    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, video_id)
  );
`)

// Migrations for existing DBs
for (const col of ['channel_id']) {
  try { db.exec(`ALTER TABLE pending_videos ADD COLUMN ${col} TEXT`) } catch {}
  try { db.exec(`ALTER TABLE favorite_videos ADD COLUMN ${col} TEXT`) } catch {}
}

export default db
