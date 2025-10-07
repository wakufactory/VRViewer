const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const https = require('https');
const path = require('path');
const config = require('./config.json');
const WebSocket = require('ws');

const app = express();
const PORT = config.port;

let lastSelection = null;
let lastParameters = {
  modelScale: 1,
  modelOrientation: 'front'
};


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
    let thumbMap = new Map();
    const thumbDir = path.join(absPath, '.thumb');
    try {
      const thumbEntries = await fsp.readdir(thumbDir, { withFileTypes: true });
      for (const thumbEntry of thumbEntries) {
        const thumbName = thumbEntry.name;
        const normalized = thumbName.normalize('NFC');
        if (!thumbMap.has(normalized)) {
          thumbMap.set(normalized, thumbName);
        }
      }
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
        let thumbFile = null;
        if (entry.name.toLowerCase().endsWith('.mp4')) {
          const jpgName = path.parse(entry.name).name + '.jpg';
          const normalizedJpg = jpgName.normalize('NFC');
          const matchedJpg = thumbMap.get(normalizedJpg);
          if (matchedJpg) {
            thumbFile = matchedJpg;
          }
        }
        if (!thumbFile) {
          const normalizedName = entry.name.normalize('NFC');
          const sameNameThumb = thumbMap.get(normalizedName);
          if (sameNameThumb) {
            thumbFile = sameNameThumb;
          }
        }
        const thumbUrl = thumbFile
          ? '/data/' + (relPath ? relPath + '/' : '') + '.thumb/' + encodeURIComponent(thumbFile)
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
  const body = req.body;
  // 後方互換: 配列だけ送られてきた場合に包む
  const payload = Array.isArray(body) ? { files: body } : body;
  const files = payload.files || [];
  console.log('Selected files:', files, 'info:', payload.info, 'path:', payload.path);
  lastSelection = payload && typeof payload === 'object' ? payload : null;
  // WebSocket通知
  const message = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
  res.json({ success: true, ...payload });
});

app.get('/api/last-selection', (req, res) => {
  if (!lastSelection) {
    return res.json({ files: [] });
  }
  res.json(lastSelection);
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
  if (lastSelection) {
    try {
      ws.send(JSON.stringify(lastSelection));
    } catch (err) {
      console.warn('Failed to send last selection to client:', err);
    }
  }
  if (lastParameters && Object.keys(lastParameters).length > 0) {
    try {
      ws.send(JSON.stringify({ type: 'params', params: lastParameters }));
    } catch (err) {
      console.warn('Failed to send last parameters to client:', err);
    }
  }
  ws.on('message', message => {
    const text = typeof message === 'string' ? message : message.toString('utf8');
    let parsed = null;
    if (text && text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        parsed = null;
      }
    }

    const isParamPayload = parsed && typeof parsed === 'object' && parsed.type === 'params' && parsed.params && typeof parsed.params === 'object';
    if (isParamPayload) {
      lastParameters = { ...lastParameters, ...parsed.params };
      const payload = JSON.stringify({ type: 'params', params: lastParameters });
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
      return;
    }

    console.log(`Client log [${ip}]:`, text);
  });
});
server.listen(PORT, () => {
  console.log(`Server running at https://localhost:${PORT}`);
});
