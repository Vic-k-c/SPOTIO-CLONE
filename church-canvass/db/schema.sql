-- Church Canvass schema

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','leader','member')),
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lists (
  id       SERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  position INT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id              SERIAL PRIMARY KEY,
  list_id         INT REFERENCES lists(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  notes           TEXT,
  interest_level  TEXT DEFAULT 'warm' CHECK (interest_level IN ('hot','warm','cold')),
  assigned_to     INT REFERENCES users(id) ON DELETE SET NULL,
  created_by      INT REFERENCES users(id) ON DELETE SET NULL,
  position        INT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cards_list_id ON cards(list_id);
CREATE INDEX IF NOT EXISTS idx_cards_latlng ON cards(lat, lng);

-- session store table (used by connect-pg-simple)
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    varchar NOT NULL COLLATE "default",
  "sess"   json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
