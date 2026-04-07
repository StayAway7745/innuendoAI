const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const PROJECT_LIMIT = 5;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

const dbPath = path.join(__dirname, 'data.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(user_id)
);
`);

const insertUser = db.prepare('INSERT OR IGNORE INTO users (user_id, created_at) VALUES (?, ?)');
const countProjects = db.prepare('SELECT COUNT(*) AS count FROM projects WHERE user_id = ?');
const insertProject = db.prepare('INSERT INTO projects (user_id, created_at) VALUES (?, ?)');

function nowIso() {
  return new Date().toISOString();
}

app.post('/api/users/init', (req, res) => {
  const userId = req.body?.user_id;
  if (!userId) {
    return res.status(400).json({ error: 'user_id required' });
  }
  insertUser.run(userId, nowIso());
  const count = countProjects.get(userId).count || 0;
  res.json({ user_id: userId, project_count: count, project_limit: PROJECT_LIMIT });
});

app.post('/api/projects/create', (req, res) => {
  const userId = req.body?.user_id;
  if (!userId) {
    return res.status(400).json({ error: 'user_id required' });
  }
  insertUser.run(userId, nowIso());
  const count = countProjects.get(userId).count || 0;
  if (count >= PROJECT_LIMIT) {
    return res.status(429).json({
      error: 'PROJECT_LIMIT',
      project_count: count,
      project_limit: PROJECT_LIMIT
    });
  }
  const info = insertProject.run(userId, nowIso());
  res.json({
    project_id: String(info.lastInsertRowid),
    project_count: count + 1,
    project_limit: PROJECT_LIMIT
  });
});

app.post('/api/tavily/search', async (req, res) => {
  if (!TAVILY_API_KEY) {
    return res.status(500).json({ error: 'TAVILY_KEY_MISSING' });
  }

  const query = req.body?.query;
  const searchDepth = req.body?.search_depth || 'basic';
  const projectId = req.body?.project_id;
  const userId = req.body?.user_id;

  if (!query) {
    return res.status(400).json({ error: 'query required' });
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TAVILY_API_KEY}`
    };

    if (projectId || userId) {
      headers['X-Project-ID'] = projectId || userId;
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        search_depth: searchDepth
      })
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return res.status(502).json({ error: 'TAVILY_BAD_RESPONSE', raw: text });
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'TAVILY_REQUEST_FAILED' });
  }
});

app.listen(PORT, () => {
  console.log(`InnuendoAI server running on http://localhost:${PORT}`);
});
