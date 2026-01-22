import express from 'express';
import cors from 'cors';
import multer from 'multer';
import JSZip from 'jszip';
import OpenAI from 'openai';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join, basename, extname } from 'path';
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync, readFileSync, rmSync } from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Base upload directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';

// Ensure upload directory exists
mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(UPLOAD_DIR));

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

// Generate a session ID (date-based with random suffix)
function generateSessionId(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
  const random = crypto.randomBytes(4).toString('hex');
  return `${date}_${time}_${random}`;
}

// Sanitize filename for safe storage
function sanitizeFilename(filename: string): string {
  // Remove path components, keep only the filename
  const base = basename(filename);
  // Replace unsafe characters
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200);
}

// Create session directory structure
function createSessionDir(sessionId: string): string {
  const sessionDir = join(UPLOAD_DIR, sessionId);
  mkdirSync(join(sessionDir, 'originals'), { recursive: true });
  mkdirSync(join(sessionDir, 'extracted'), { recursive: true });
  mkdirSync(join(sessionDir, 'converted'), { recursive: true });
  return sessionDir;
}

// Save file and return URL
function saveFile(sessionId: string, subdir: string, filename: string, data: Buffer): string {
  const safeFilename = sanitizeFilename(filename);
  const filePath = join(UPLOAD_DIR, sessionId, subdir, safeFilename);

  // Handle duplicate filenames
  let finalPath = filePath;
  let counter = 1;
  const ext = extname(safeFilename);
  const nameWithoutExt = safeFilename.slice(0, -ext.length || undefined);

  while (existsSync(finalPath)) {
    finalPath = join(UPLOAD_DIR, sessionId, subdir, `${nameWithoutExt}_${counter}${ext}`);
    counter++;
  }

  writeFileSync(finalPath, data);
  const savedFilename = basename(finalPath);
  return `/uploads/${sessionId}/${subdir}/${savedFilename}`;
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

    files.push({ name: basename(filename), data, mimeType });
  }

  return files;
}

// Start a new upload session
app.post('/api/sessions', (req, res) => {
  try {
    const sessionId = generateSessionId();
    createSessionDir(sessionId);
    res.json({ sessionId });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// List all sessions
app.get('/api/sessions', (req, res) => {
  try {
    if (!existsSync(UPLOAD_DIR)) {
      return res.json({ sessions: [] });
    }

    const sessions = readdirSync(UPLOAD_DIR)
      .filter(name => {
        const path = join(UPLOAD_DIR, name);
        return statSync(path).isDirectory();
      })
      .map(name => {
        const path = join(UPLOAD_DIR, name);
        const stats = statSync(path);

        // Count files in each subdirectory
        const countFiles = (subdir: string) => {
          const subdirPath = join(path, subdir);
          if (!existsSync(subdirPath)) return 0;
          return readdirSync(subdirPath).length;
        };

        return {
          id: name,
          created: stats.birthtime,
          modified: stats.mtime,
          files: {
            originals: countFiles('originals'),
            extracted: countFiles('extracted'),
            converted: countFiles('converted'),
          },
        };
      })
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

    res.json({ sessions });
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// Get session details
app.get('/api/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionDir = join(UPLOAD_DIR, sessionId);

    if (!existsSync(sessionDir)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const getFiles = (subdir: string) => {
      const subdirPath = join(sessionDir, subdir);
      if (!existsSync(subdirPath)) return [];

      return readdirSync(subdirPath).map(name => {
        const filePath = join(subdirPath, name);
        const stats = statSync(filePath);
        return {
          name,
          url: `/uploads/${sessionId}/${subdir}/${name}`,
          size: stats.size,
          mimeType: getMimeType(name),
          created: stats.birthtime,
        };
      });
    };

    res.json({
      id: sessionId,
      files: {
        originals: getFiles('originals'),
        extracted: getFiles('extracted'),
        converted: getFiles('converted'),
      },
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Delete a session
app.delete('/api/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionDir = join(UPLOAD_DIR, sessionId);

    if (!existsSync(sessionDir)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    rmSync(sessionDir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Upload files to a session
app.post('/api/sessions/:sessionId/upload', upload.array('files', 50), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionDir = join(UPLOAD_DIR, sessionId);

    if (!existsSync(sessionDir)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const results = [];

    for (const file of files) {
      const mimeType = getMimeType(file.originalname);
      const isZip = file.mimetype === 'application/zip' ||
                    file.mimetype === 'application/x-zip-compressed' ||
                    file.originalname.toLowerCase().endsWith('.zip');

      if (isZip) {
        // Extract ZIP and save each file
        const extracted = await extractZip(file.buffer);

        // Save original ZIP
        const originalUrl = saveFile(sessionId, 'originals', file.originalname, file.buffer);

        for (const extractedFile of extracted) {
          if (isImage(extractedFile.mimeType) || extractedFile.mimeType === 'application/pdf') {
            const url = saveFile(sessionId, 'extracted', extractedFile.name, extractedFile.data);
            results.push({
              name: extractedFile.name,
              url,
              mimeType: extractedFile.mimeType,
              size: extractedFile.data.length,
              source: file.originalname,
            });
          }
        }
      } else if (isImage(mimeType) || mimeType === 'application/pdf') {
        // Save directly to originals
        const url = saveFile(sessionId, 'originals', file.originalname, file.buffer);
        results.push({
          name: file.originalname,
          url,
          mimeType,
          size: file.buffer.length,
        });
      }
    }

    res.json({ files: results });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Save converted images (from PDF.js on frontend)
app.post('/api/sessions/:sessionId/converted', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { images } = req.body; // Array of { name, dataUrl }

    const sessionDir = join(UPLOAD_DIR, sessionId);
    if (!existsSync(sessionDir)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ error: 'No images provided' });
    }

    const results = [];

    for (const image of images) {
      const { name, dataUrl } = image;

      // Parse data URL
      const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) continue;

      const mimeType = matches[1];
      const data = Buffer.from(matches[2], 'base64');

      const url = saveFile(sessionId, 'converted', name, data);
      results.push({
        name: basename(url),
        url,
        mimeType,
        size: data.length,
      });
    }

    res.json({ files: results });
  } catch (error) {
    console.error('Save converted error:', error);
    res.status(500).json({ error: 'Failed to save converted images' });
  }
});

// Analyze images with Gemini
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

    // Add each image - can be URL or data URL
    for (const image of images) {
      let imageUrl = image;

      // If it's a relative URL, we need to read the file and convert to base64
      if (image.startsWith('/uploads/')) {
        const filePath = join(UPLOAD_DIR, image.replace('/uploads/', ''));
        if (existsSync(filePath)) {
          const data = readFileSync(filePath);
          const mimeType = getMimeType(filePath);
          imageUrl = `data:${mimeType};base64,${data.toString('base64')}`;
        }
      }

      content.push({
        type: 'image_url',
        image_url: {
          url: imageUrl,
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

// Detect image orientation using Gemini
async function detectOrientation(imageData: Buffer, mimeType: string): Promise<number> {
  if (!process.env.OPENROUTER_API_KEY) {
    return 0; // Can't detect without API key
  }

  const dataUrl = `data:${mimeType};base64,${imageData.toString('base64')}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'google/gemini-flash-2.5',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Look at this scanned document image. Determine its orientation based on the text direction. Reply with ONLY a single number:\n- 0 if correctly oriented (text reads normally left-to-right)\n- 90 if rotated 90° clockwise (text reads top-to-bottom)\n- 180 if upside down\n- 270 if rotated 90° counter-clockwise (text reads bottom-to-top)\n\nReply with just the number, nothing else.',
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
      max_tokens: 10,
    });

    const result = response.choices[0]?.message?.content?.trim() || '0';
    const rotation = parseInt(result, 10);

    if ([0, 90, 180, 270].includes(rotation)) {
      return rotation;
    }
    return 0;
  } catch (error) {
    console.error('Orientation detection error:', error);
    return 0;
  }
}

// Rotate image using sharp
async function rotateImage(imageData: Buffer, degrees: number): Promise<Buffer> {
  if (degrees === 0) {
    return imageData;
  }

  return await sharp(imageData)
    .rotate(degrees)
    .toBuffer();
}

// Auto-orient image (detect + rotate)
async function autoOrientImage(imageData: Buffer, mimeType: string): Promise<{ data: Buffer; rotated: number }> {
  const rotation = await detectOrientation(imageData, mimeType);

  if (rotation === 0) {
    return { data: imageData, rotated: 0 };
  }

  // Sharp rotates counter-clockwise, so we need to invert
  // If image is rotated 90° clockwise, we rotate 270° (or -90°) to fix it
  const correctionMap: Record<number, number> = {
    90: 270,  // Image rotated 90° CW -> rotate 270° to fix
    180: 180, // Upside down -> rotate 180° to fix
    270: 90,  // Image rotated 270° CW -> rotate 90° to fix
  };

  const correctedData = await rotateImage(imageData, correctionMap[rotation] || 0);
  return { data: correctedData, rotated: rotation };
}

// Endpoint to auto-orient an image
app.post('/api/sessions/:sessionId/orient', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'No image URL provided' });
    }

    const sessionDir = join(UPLOAD_DIR, sessionId);
    if (!existsSync(sessionDir)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Read the image file
    const filePath = join(UPLOAD_DIR, imageUrl.replace('/uploads/', ''));
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const imageData = readFileSync(filePath);
    const mimeType = getMimeType(filePath);

    // Auto-orient
    const { data: orientedData, rotated } = await autoOrientImage(imageData, mimeType);

    if (rotated === 0) {
      // No rotation needed
      return res.json({ rotated: 0, url: imageUrl });
    }

    // Save the oriented image
    const originalName = basename(filePath);
    const ext = extname(originalName);
    const nameWithoutExt = originalName.slice(0, -ext.length || undefined);
    const newName = `${nameWithoutExt}_oriented${ext}`;

    // Determine which subdir the original was in
    const relativePath = imageUrl.replace('/uploads/', '').replace(`${sessionId}/`, '');
    const subdir = relativePath.split('/')[0];

    const newUrl = saveFile(sessionId, subdir, newName, orientedData);

    res.json({ rotated, url: newUrl, originalUrl: imageUrl });
  } catch (error) {
    console.error('Orient error:', error);
    res.status(500).json({ error: 'Failed to orient image' });
  }
});

// Endpoint to auto-orient all images in a session
app.post('/api/sessions/:sessionId/orient-all', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const sessionDir = join(UPLOAD_DIR, sessionId);
    if (!existsSync(sessionDir)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const results: Array<{ url: string; rotated: number; newUrl?: string }> = [];

    // Process all subdirectories
    for (const subdir of ['originals', 'extracted', 'converted']) {
      const subdirPath = join(sessionDir, subdir);
      if (!existsSync(subdirPath)) continue;

      const files = readdirSync(subdirPath);
      for (const filename of files) {
        const filePath = join(subdirPath, filename);
        const mimeType = getMimeType(filename);

        // Skip non-images and already oriented files
        if (!isImage(mimeType) || filename.includes('_oriented')) continue;

        const imageData = readFileSync(filePath);
        const { data: orientedData, rotated } = await autoOrientImage(imageData, mimeType);

        const originalUrl = `/uploads/${sessionId}/${subdir}/${filename}`;

        if (rotated === 0) {
          results.push({ url: originalUrl, rotated: 0 });
        } else {
          // Save oriented version
          const ext = extname(filename);
          const nameWithoutExt = filename.slice(0, -ext.length || undefined);
          const newName = `${nameWithoutExt}_oriented${ext}`;
          const newUrl = saveFile(sessionId, subdir, newName, orientedData);

          results.push({ url: originalUrl, rotated, newUrl });
        }
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Orient-all error:', error);
    res.status(500).json({ error: 'Failed to orient images' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uploadDir: UPLOAD_DIR });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Upload directory: ${UPLOAD_DIR}`);
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('Warning: OPENROUTER_API_KEY not set. AI analysis will not work.');
  }
});
