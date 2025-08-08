import express from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import sharp from 'sharp';
import archiver from 'archiver';
import fs from 'fs';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ dest: 'uploads/' });

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const MOCKUP_CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '../mockups.json'), 'utf-8'));

app.use(cors());
app.use(express.static(path.join(__dirname, '../client/dist')));

let connections = {};

async function generateMockup(mockup, title, collection, sendUpdate) {
  const prompt = mockup.prompt.replace('{artwork_subject}', title);

  try {
    const replicateRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: "flux-schnell-model-id", // Replace with your Replicate model/version
        input: { prompt }
      })
    });
    const data = await replicateRes.json();
    const imageUrl = data.output?.[0];
    if (!imageUrl) throw new Error(`No output from Replicate for ${mockup.type}`);

    const imageRes = await fetch(imageUrl);
    const buffer = await imageRes.arrayBuffer();

    const processedImage = await sharp(Buffer.from(buffer))
      .resize(mockup.size[0], mockup.size[1], { fit: 'cover' })
      .toFormat('png')
      .toBuffer();

    const filename = `AG_${collection}_${title}_${new Date().toISOString().slice(0,10)}_MOCKUP_${mockup.type.replace(/\s+/g, '_')}.png`;

    const preview = `data:image/png;base64,${processedImage.toString('base64')}`;
    sendUpdate({ type: mockup.type, filename, preview });

    return { filename, buffer: processedImage };
  } catch (err) {
    sendUpdate({ type: mockup.type, error: err.message });
    return null;
  }
}

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

app.post('/generate', upload.single('artwork'), async (req, res) => {
  const { title, collection } = req.body;
  const genId = Date.now().toString();

  const sendUpdate = (data) => {
    if (connections[genId]) {
      connections[genId](data);
    }
  };

  const results = (await Promise.all(
    MOCKUP_CONFIG.map(mockup => generateMockup(mockup, title, collection, sendUpdate))
  )).filter(Boolean);

  const zipFile = archiver('zip');
  results.forEach(({ filename, buffer }) => zipFile.append(buffer, { name: filename }));

  const chunks = [];
  zipFile.on('data', chunk => chunks.push(chunk));

  zipFile.finalize();
  zipFile.on('end', () => {
    const zipBuffer = Buffer.concat(chunks);
    const zipBase64 = `data:application/zip;base64,${zipBuffer.toString('base64')}`;
    res.json({ zip: zipBase64, genId });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(3000, () => console.log('🚀 Mockup generator running on port 3000'));
