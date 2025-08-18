const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const config = require('./config.json');

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// JSON API: /api/files?path=<relative path>
app.get('/api/files', async (req, res) => {
  try {
    const relPath = req.query.path || '';
    const root = path.resolve(config.rootFolder);
    const absPath = path.resolve(root, relPath);
    // ルート外アクセス防止
    if (!absPath.startsWith(root)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const entries = await fs.readdir(absPath, { withFileTypes: true });
    const folders = [];
    const files = [];
    const regex = new RegExp(config.fileRegex);
    for (const entry of entries) {
      const entryPath = path.join(absPath, entry.name);
      const stats = await fs.stat(entryPath);
      if (entry.isDirectory()) {
        folders.push({ name: entry.name, mtime: stats.mtimeMs });
      } else if (entry.isFile() && regex.test(entry.name)) {
        files.push({ name: entry.name, mtime: stats.mtimeMs });
      }
    }
    res.json({ folders, files, selectionMode: config.selectionMode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
