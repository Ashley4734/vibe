import express from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import sharp from 'sharp';
import archiver from 'archiver';
import fs from 'fs';
import cors from 'cors';
import path from 'path';
import { PassThrough } from 'stream';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ dest: 'uploads/' });

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_MODEL_VERSION = process.env.REPLICATE_MODEL_VERSION; // <-- real version hash
const PORT = process.env.PORT || 3000;

if (!REPLICATE_API_TOKEN) {
  console.warn('⚠️  Missing REPLICATE_API_TOKEN');
}
if (!REPLICATE_MODEL_VERSION) {
  console.warn('⚠️  Missing REPLICATE_MODEL_VERSION');
}

const MOCKUP_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../mockups.json'), 'utf-8')
);

app.use(cors());
app.use(express.static(path.join(__dirname, '../client/dist')));

const connections = {}; // genId -> (data) => void

// ---------- Replicate helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startPrediction(prompt) {
  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: REPLICATE_MODEL_VERSION,
      input: { prompt },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replicate create failed: ${res.status} ${text}`);
  }
  return res.json(); // { id, status, ... }
}

async function getPrediction(id) {
  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replicate fetch failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function pollPrediction(id, onTick) {
  // Poll every 1.2s until status is terminal
  while (true) {
    const j = await getPrediction(id);
    onTick?.(j);
    if (j.status === 'succeeded') return j;
    if (j.status === 'failed' || j.status === 'canceled') {
      throw new Error(`Replicate status: ${j.status} ${j.error || ''}`);
    }
    await sleep(1200);
  }
}

// ---------- Core generation ----------
async function generateMockup(mockup, title, collection, sendUpdate) {
  const prompt = mockup.prompt.replace('{artwork_subject}', title);

  try {
    // Fire prediction
    const created = await startPrediction(prompt);
    sendUpdate({ type: mockup.type, status: 'queued', id: created.id });

    // Poll for completion (and forward progress)
    const result = await pollPrediction(created.id, (tick) => {
      sendUpdate({
        type: mockup.type,
        status: tick.status,
        logs: tick.logs || null,
        metrics: tick.metrics || null,
      });
    });

    const imageUrl = result.output?.[0];
    if (!imageUrl) throw new Error(`No output from Replicate for ${mockup.type}`);

    // Fetch and normalize to target size/format
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      const t = await imageRes.text();
      throw new Error(`Image fetch failed: ${imageRes.status} ${t}`);
    }
    const buf = Buffer.from(await imageRes.arrayBuffer());

    const processedImage = await sharp(buf)
      .resize(mockup.size[0], mockup.size[1], { fit: 'cover' })
      .toFormat('png')
      .toBuffer();

    const filename = `AG_${collection}_${title}_${new Date()
      .toISOString()
      .slice(0, 10)}_MOCKUP_${mockup.type.replace(/\s+/g, '_')}.png`;

    const preview = `data:image/png;base64,${processedImage.toString('base64')}`;
    sendUpdate({ type: mockup.type, status: 'succeeded', filename, preview });

    return { filename, buffer: processedImage };
  } catch (err) {
    sendUpdate({ type: mockup.type, status: 'error', error: err.message });
    return null;
  }
}

// ---------- SSE progress ----------
app.get('/progress/:id', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const id = req.params.id;
  connections[id] = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  req.on('close', () => {
    delete connections[id];
  });
});

// ---------- Generate route ----------
app.post('/generate', upload.single('artwork'), async (req, res) => {
  if (!REPLICATE_API_TOKEN || !REPLICATE_MODEL_VERSION) {
    return res.status(500).json({
      error:
        'Server missing Replicate configuration. Set REPLICATE_API_TOKEN and REPLICATE_MODEL_VERSION.',
    });
  }

  const { title = 'Untitled', collection = 'Default' } = req.body;
  const genId = Date.now().toString();

  const sendUpdate = (data) => {
    const fn = connections[genId];
    if (fn) fn(data);
  };

  try {
    const results = (
      await Promise.all(
        MOCKUP_CONFIG.map((m) => generateMockup(m, title, collection, sendUpdate))
      )
    ).filter(Boolean);

    // Build ZIP in memory (stream)
    const archive = archiver('zip', { zlib: { level: 9 } });
    const zipStream = new PassThrough();
    const chunks = [];

    zipStream.on('data', (c) => chunks.push(c));
    zipStream.on('end', () => {
      const zipBuffer = Buffer.concat(chunks);
      const b64 = `data:application/zip;base64,${zipBuffer.toString('base64')}`;
      res.json({ zip: b64, genId });
    });

    archive.on('error', (err) => {
      console.error('Archiver error:', err);
      res.status(500).json({ error: 'Failed to create ZIP' });
    });

    archive.pipe(zipStream);

    for (const { filename, buffer } of results) {
      archive.append(buffer, { name: filename });
    }

    await archive.finalize();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Generation failed' });
  }
});

// ---------- SPA fallback ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Mockup generator running on port ${PORT}`);
});
