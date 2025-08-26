const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const https = require('https');
const path = require('path');
const config = require('./config.json');
const WebSocket = require('ws');

const app = express();
const PORT = config.port;


 // 静的ファイル配信
 app.use('/data', express.static(path.join(__dirname, 'public', 'data'), { dotfiles: 'allow' }));
 app.use(express.static(path.join(__dirname, 'public')));
 app.use(express.json());

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
    const entries = await fsp.readdir(absPath, { withFileTypes: true });
    const folders = [];
    const files = [];
    const regex = new RegExp(config.fileRegex);

    // サムネイルフォルダ検出
    let thumbSet = new Set();
    const thumbDir = path.join(absPath, '.thumb');
    try {
      const thumbEntries = await fsp.readdir(thumbDir);
      thumbSet = new Set(thumbEntries);
    } catch (err) {
      // サムネイルフォルダが無い場合は無視
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const entryPath = path.join(absPath, entry.name);
      const stats = await fsp.stat(entryPath);
      if (entry.isDirectory()) {
        let infoData = null;
        const infoPath = path.join(entryPath, '.info.json');
        try {
          const raw = await fsp.readFile(infoPath, 'utf8');
          infoData = JSON.parse(raw);
        } catch (err) {
          // .info.json missing or invalid
        }
        folders.push({ name: entry.name, mtime: stats.mtimeMs, info: infoData });
      } else if (entry.isFile() && regex.test(entry.name)) {
        const thumbExists = thumbSet.has(entry.name);
        const thumbUrl = thumbExists
          ? '/data/' + (relPath ? relPath + '/' : '') + '.thumb/' + encodeURIComponent(entry.name)
          : null;
        files.push({ name: entry.name, mtime: stats.mtimeMs, thumbUrl });
      }
    }
    let dirInfo = null;
    const infoPath = path.join(absPath, '.info.json');
    try {
      const rawInfo = await fsp.readFile(infoPath, 'utf8');
      dirInfo = JSON.parse(rawInfo);
    } catch (err) {
      // .info.json missing or invalid
    }
    res.json({ folders, files, selectionMode: config.selectionMode, info: dirInfo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


 // 選択ファイルリスト受信用エンドポイント
 app.post('/api/select', (req, res) => {
  const files = req.body;
  console.log('Selected files:', files);
  // WebSocket通知
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(files));
    }
  });
  res.json({ success: true, files });
});

const options = {
  key: fs.readFileSync(path.join(__dirname, 'ssl', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'ssl', 'cert.pem'))
};

const server = https.createServer(options, app);
const wss = new WebSocket.Server({ server });

// クライアントからのログ受信
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  ws.on('message', message => {
    const text = typeof message === 'string' ? message : message.toString('utf8');
    console.log(`Client log [${ip}]:`, text);
  });
});
server.listen(PORT, () => {
  console.log(`Server running at https://localhost:${PORT}`);
});
