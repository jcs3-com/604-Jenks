CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  intent TEXT,
  message TEXT,
  source TEXT,
  ip TEXT,
  country TEXT,
  mailed INTEGER DEFAULT 0
);

