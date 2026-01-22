import express from 'express';
import cors from 'cors';
import multer from 'multer';
import JSZip from 'jszip';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// OpenRouter client for Gemini
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
});

// Supported image MIME types
const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/heic',
  'image/heif',
  'image/avif',
];

// Check if file is an image
function isImage(mimeType: string): boolean {
  return IMAGE_TYPES.includes(mimeType) || mimeType.startsWith('image/');
}

// Extract files from ZIP
async function extractZip(buffer: Buffer): Promise<Array<{ name: string; data: Buffer; mimeType: string }>> {
  const zip = await JSZip.loadAsync(buffer);
  const files: Array<{ name: string; data: Buffer; mimeType: string }> = [];

  for (const [filename, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;

    // Skip hidden files and macOS metadata
    if (filename.startsWith('.') || filename.includes('__MACOSX')) continue;

    const data = await zipEntry.async('nodebuffer');
    const mimeType = getMimeType(filename);

    files.push({ name: filename, data, mimeType });
  }

  return files;
}

// Get MIME type from filename
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    heic: 'image/heic',
    heif: 'image/heif',
    avif: 'image/avif',
    pdf: 'application/pdf',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

// Convert buffer to base64 data URL
function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

// Endpoint to extract ZIP files
app.post('/api/extract-zip', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const files = await extractZip(req.file.buffer);

    // Return file info with base64 data for images/PDFs
    const result = files.map((f) => ({
      name: f.name,
      mimeType: f.mimeType,
      dataUrl: isImage(f.mimeType) || f.mimeType === 'application/pdf'
        ? toDataUrl(f.data, f.mimeType)
        : null,
      size: f.data.length,
    }));

    res.json({ files: result });
  } catch (error) {
    console.error('ZIP extraction error:', error);
    res.status(500).json({ error: 'Failed to extract ZIP file' });
  }
});

// Endpoint to analyze images with Gemini
app.post('/api/analyze', async (req, res) => {
  try {
    const { images, prompt } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
    }

    // Build content array with images
    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: 'text',
        text: prompt || 'Analyze these scanned ticket documents. Extract all relevant information including dates, amounts, ticket numbers, descriptions, and any other important details. Format the output in a structured way.',
      },
    ];

    // Add each image
    for (const imageDataUrl of images) {
      content.push({
        type: 'image_url',
        image_url: {
          url: imageDataUrl,
        },
      });
    }

    const response = await openai.chat.completions.create({
      model: 'google/gemini-flash-2.5',
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      max_tokens: 4096,
    });

    const analysis = response.choices[0]?.message?.content || 'No analysis available';

    res.json({ analysis });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to analyze images'
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('Warning: OPENROUTER_API_KEY not set. AI analysis will not work.');
  }
});
