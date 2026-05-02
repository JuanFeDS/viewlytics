# Viewlytics – Database Schema (v2)

## Overview

Designed for PostgreSQL (Supabase). Supports:

- Google OAuth authentication with YouTube API token storage
- User-defined organization of subscriptions
- Internal video state (pending, watched, favorites)
- Full behavioral event tracking
- Time-series analytics via daily snapshots

---

## Tables

### `users`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `BIGSERIAL` | PK | |
| `google_id` | `TEXT` | UNIQUE NOT NULL | |
| `email` | `TEXT` | NOT NULL | |
| `name` | `TEXT` | | |
| `avatar_url` | `TEXT` | | Profile picture from Google |
| `access_token` | `TEXT` | | ⚠️ Encrypt at rest |
| `refresh_token` | `TEXT` | | ⚠️ Encrypt at rest |
| `token_expires_at` | `TIMESTAMPTZ` | | Used to trigger proactive refresh |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() | |
| `updated_at` | `TIMESTAMPTZ` | DEFAULT now() | Update on token refresh |

---

### `channels`

Reference table. Populated on first interaction with a channel.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `channel_id` | `TEXT` | PK | YouTube channel ID |
| `name` | `TEXT` | NOT NULL | |
| `thumbnail_url` | `TEXT` | | |
| `subscriber_count` | `BIGINT` | | Snapshot — not real-time |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() | When first seen by the app |
| `updated_at` | `TIMESTAMPTZ` | DEFAULT now() | Last time metadata was refreshed |

---

### `videos`

Centralized video metadata. Populated when a user first interacts with a video.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `video_id` | `TEXT` | PK | YouTube video ID |
| `title` | `TEXT` | NOT NULL | |
| `channel_id` | `TEXT` | FK → channels NOT NULL | |
| `channel_title` | `TEXT` | | Denormalized for query convenience |
| `thumbnail_url` | `TEXT` | | |
| `duration` | `TEXT` | | ISO 8601 (e.g. `PT10M30S`) |
| `view_count` | `BIGINT` | | Snapshot — not real-time |
| `published_at` | `TIMESTAMPTZ` | | |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() | When first stored |
| `updated_at` | `TIMESTAMPTZ` | DEFAULT now() | |

---

### `subscription_categories`

User-defined labels for organizing YouTube subscriptions.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `BIGSERIAL` | PK | |
| `user_id` | `BIGINT` | FK → users NOT NULL CASCADE | |
| `name` | `TEXT` | NOT NULL | |
| `color` | `TEXT` | DEFAULT `'#6366f1'` | Hex color |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() | |

---

### `subscription_category_map`

Many-to-many: YouTube subscriptions ↔ user categories.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `user_id` | `BIGINT` | FK → users NOT NULL CASCADE | |
| `subscription_id` | `TEXT` | NOT NULL | YouTube subscription resource ID |
| `category_id` | `BIGINT` | FK → subscription_categories NOT NULL CASCADE | |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() | |

**Primary key:** (`user_id`, `subscription_id`, `category_id`)

> `subscription_id` is the YouTube API resource ID (not a local FK) because subscriptions are not stored locally — they're fetched live from the API.

---

### `pending_videos`

Videos saved internally to watch later. Independent from YouTube's Watch Later playlist.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `BIGSERIAL` | PK | |
| `user_id` | `BIGINT` | FK → users NOT NULL CASCADE | |
| `video_id` | `TEXT` | FK → videos NOT NULL | |
| `added_at` | `TIMESTAMPTZ` | DEFAULT now() | |
| `watched_at` | `TIMESTAMPTZ` | | NULL = not yet watched |
| `notes` | `TEXT` | | Optional user annotation |

**Unique:** (`user_id`, `video_id`)

---

### `favorite_videos`

Videos explicitly starred by the user inside the app.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `BIGSERIAL` | PK | |
| `user_id` | `BIGINT` | FK → users NOT NULL CASCADE | |
| `video_id` | `TEXT` | FK → videos NOT NULL | |
| `saved_at` | `TIMESTAMPTZ` | DEFAULT now() | |

**Unique:** (`user_id`, `video_id`)

---

### `user_events`

Append-only event log. Every meaningful user action emits a row here.
Foundation for behavioral analysis, trends, and future ML features.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `BIGSERIAL` | PK | |
| `user_id` | `BIGINT` | FK → users NOT NULL | |
| `event_type` | `TEXT` | NOT NULL | See enum below |
| `video_id` | `TEXT` | FK → videos | Nullable for channel-level events |
| `channel_id` | `TEXT` | FK → channels | Nullable for video-level events |
| `source` | `TEXT` | DEFAULT `'app'` | `app` or `youtube` |
| `metadata` | `JSONB` | | Flexible payload for future event types |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() | |

**Check constraint:** `video_id IS NOT NULL OR channel_id IS NOT NULL`

**`event_type` values:**

| Value | Meaning |
|-------|---------|
| `video_saved` | Added to pending list |
| `video_watched` | Marked as watched |
| `video_unsaved` | Removed from pending |
| `video_favorited` | Added to favorites |
| `video_unfavorited` | Removed from favorites |
| `channel_categorized` | Subscription assigned to a category |
| `channel_uncategorized` | Category assignment removed |
| `search_performed` | User ran a search |

> `metadata` (JSONB) allows attaching arbitrary context to any event without schema changes — e.g. `{"query": "react hooks"}` for `search_performed`, or `{"from": "search"}` for `video_saved`.

---

### `daily_snapshots`

One row per user per day. Captures point-in-time counts for trend analysis.
Populated by a scheduled job (cron or background function).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `BIGSERIAL` | PK | |
| `user_id` | `BIGINT` | FK → users NOT NULL | |
| `date` | `DATE` | NOT NULL | |
| `total_subscriptions` | `INTEGER` | | From YouTube API |
| `total_likes` | `INTEGER` | | From YouTube API |
| `total_watch_later` | `INTEGER` | | From YouTube API |
| `total_pending_internal` | `INTEGER` | | Unwatched rows in `pending_videos` |
| `total_watched_internal` | `INTEGER` | | Watched rows in `pending_videos` |
| `total_favorites_internal` | `INTEGER` | | Rows in `favorite_videos` |

**Unique:** (`user_id`, `date`) — one snapshot per user per day

---

## Indexes

```sql
-- Hot query paths
CREATE INDEX idx_pending_videos_user       ON pending_videos(user_id);
CREATE INDEX idx_pending_videos_unwatched  ON pending_videos(user_id) WHERE watched_at IS NULL;
CREATE INDEX idx_favorite_videos_user      ON favorite_videos(user_id);
CREATE INDEX idx_user_events_user_time     ON user_events(user_id, created_at DESC);
CREATE INDEX idx_user_events_type          ON user_events(user_id, event_type);
CREATE INDEX idx_daily_snapshots_user_date ON daily_snapshots(user_id, date DESC);
CREATE INDEX idx_videos_channel            ON videos(channel_id);
```

---

## Relationships

```
users
├── subscription_categories (1:N)
│    └── subscription_category_map (N:M)
├── pending_videos (1:N)
├── favorite_videos (1:N)
├── user_events (1:N)
└── daily_snapshots (1:N)

channels
└── videos (1:N)

videos
├── pending_videos (1:N)
├── favorite_videos (1:N)
└── user_events (1:N)
```

---

## Migration from v1

| v1 | v2 |
|----|----|
| Metadata inline in `pending_videos` / `favorite_videos` | Extracted to `videos` + `channels` |
| `INTEGER` PKs, `DATETIME` types | `BIGSERIAL` PKs, `TIMESTAMPTZ` types |
| No `avatar_url`, no `token_expires_at` | Added to `users` |
| `subscription_category_map` PK missing `user_id` | Fixed — PK is now `(user_id, subscription_id, category_id)` |
| No behavioral tracking | `user_events` with JSONB metadata |
| No analytics layer | `daily_snapshots` |
| No indexes defined | Explicit index strategy |

---

## Future Extensions

- **`channel_subscriptions`** — local snapshot of which channels a user follows (enables offline analytics without hitting the YouTube API)
- **`user_video_state`** — unified flags table to replace separate pending/favorites if state complexity grows
- **Materialized views** — pre-aggregated metrics for the Stats page
- **Recommendation tables** — store scored channel/video suggestions per user
- **Token encryption** — apply AES-256 or use Supabase Vault for `access_token` / `refresh_token`

---

## Security Notes

- `access_token` and `refresh_token` should be encrypted at rest — consider [Supabase Vault](https://supabase.com/docs/guides/database/vault) or application-level AES encryption before storing
- Row Level Security (RLS) should be enabled on all user-scoped tables in Supabase
- Never expose tokens to the frontend — all YouTube API calls are server-side only
