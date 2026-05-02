-- Viewlytics – Initial Schema Migration
-- Target: Supabase (PostgreSQL 15)
-- Run this in the Supabase SQL Editor

-- ─────────────────────────────────────────
-- Trigger function: auto-update updated_at
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────
-- profiles
-- Extends auth.users (managed by Supabase Auth).
-- Stores YouTube OAuth tokens obtained after Google login.
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id                    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT        NOT NULL,
  name                  TEXT,
  avatar_url            TEXT,
  provider_token        TEXT,
  provider_refresh_token TEXT,
  token_expires_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create profile row when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────
-- channels
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channels (
  channel_id       TEXT        PRIMARY KEY,
  name             TEXT        NOT NULL,
  thumbnail_url    TEXT,
  subscriber_count BIGINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────
-- videos
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS videos (
  video_id      TEXT        PRIMARY KEY,
  title         TEXT        NOT NULL,
  channel_id    TEXT        NOT NULL REFERENCES channels(channel_id),
  channel_title TEXT,
  thumbnail_url TEXT,
  duration      TEXT,
  view_count    BIGINT,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);

-- ─────────────────────────────────────────
-- subscription_categories
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_categories (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- subscription_category_map
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_category_map (
  user_id         UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id TEXT    NOT NULL,
  category_id     BIGINT  NOT NULL REFERENCES subscription_categories(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, subscription_id, category_id)
);

-- ─────────────────────────────────────────
-- pending_videos
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_videos (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id   TEXT        NOT NULL REFERENCES videos(video_id),
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  watched_at TIMESTAMPTZ,
  notes      TEXT,
  UNIQUE (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_videos_user
  ON pending_videos(user_id);

CREATE INDEX IF NOT EXISTS idx_pending_videos_unwatched
  ON pending_videos(user_id) WHERE watched_at IS NULL;

-- ─────────────────────────────────────────
-- favorite_videos
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS favorite_videos (
  id       BIGSERIAL   PRIMARY KEY,
  user_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id TEXT        NOT NULL REFERENCES videos(video_id),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_videos_user
  ON favorite_videos(user_id);

-- ─────────────────────────────────────────
-- user_events
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_events (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES profiles(id),
  event_type TEXT        NOT NULL,
  video_id   TEXT        REFERENCES videos(video_id),
  channel_id TEXT        REFERENCES channels(channel_id),
  source     TEXT        NOT NULL DEFAULT 'app',
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_event_has_target CHECK (video_id IS NOT NULL OR channel_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_user_events_user_time
  ON user_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_events_type
  ON user_events(user_id, event_type);

-- ─────────────────────────────────────────
-- daily_snapshots
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id                       BIGSERIAL PRIMARY KEY,
  user_id                  UUID      NOT NULL REFERENCES profiles(id),
  date                     DATE      NOT NULL,
  total_subscriptions      INTEGER,
  total_likes              INTEGER,
  total_watch_later        INTEGER,
  total_pending_internal   INTEGER,
  total_watched_internal   INTEGER,
  total_favorites_internal INTEGER,
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_user_date
  ON daily_snapshots(user_id, date DESC);

-- ─────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────

ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_category_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_videos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_videos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots         ENABLE ROW LEVEL SECURITY;

-- profiles: each user sees only their own row
CREATE POLICY "profiles: own row" ON profiles
  FOR ALL USING (auth.uid() = id);

-- subscription_categories
CREATE POLICY "subscription_categories: own rows" ON subscription_categories
  FOR ALL USING (auth.uid() = user_id);

-- subscription_category_map
CREATE POLICY "subscription_category_map: own rows" ON subscription_category_map
  FOR ALL USING (auth.uid() = user_id);

-- pending_videos
CREATE POLICY "pending_videos: own rows" ON pending_videos
  FOR ALL USING (auth.uid() = user_id);

-- favorite_videos
CREATE POLICY "favorite_videos: own rows" ON favorite_videos
  FOR ALL USING (auth.uid() = user_id);

-- user_events
CREATE POLICY "user_events: own rows" ON user_events
  FOR ALL USING (auth.uid() = user_id);

-- daily_snapshots
CREATE POLICY "daily_snapshots: own rows" ON daily_snapshots
  FOR ALL USING (auth.uid() = user_id);

-- channels and videos are shared reference data (no RLS needed)
