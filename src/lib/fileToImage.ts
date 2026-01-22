import * as pdfjsLib from 'pdfjs-dist';
import { extractZip, type ExtractedFile } from './api';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface ConvertedPage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
  fileName?: string; // For files extracted from ZIP
}

export interface ConversionResult {
  fileName: string;
  fileType: string;
  pages: ConvertedPage[];
  error?: string;
  extractedFiles?: ExtractedFile[]; // For ZIP files
}

/**
 * Convert a PDF file to images (one per page)
 */
async function pdfToImages(file: File, scale: number = 2): Promise<ConvertedPage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: ConvertedPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    }).promise;

    pages.push({
      pageNumber: i,
      dataUrl: canvas.toDataURL('image/png'),
      width: viewport.width,
      height: viewport.height,
    });
  }

  return pages;
}

/**
 * Convert an image file to a data URL
 */
async function imageToDataUrl(file: File): Promise<ConvertedPage[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        resolve([
          {
            pageNumber: 1,
            dataUrl: e.target?.result as string,
            width: img.width,
            height: img.height,
          },
        ]);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a base64 data URL to a ConvertedPage
 */
async function dataUrlToPage(dataUrl: string, pageNumber: number, fileName?: string): Promise<ConvertedPage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        pageNumber,
        dataUrl,
        width: img.width,
        height: img.height,
        fileName,
      });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/**
 * Convert PDF from data URL (for ZIP-extracted PDFs)
 */
async function pdfDataUrlToImages(dataUrl: string, scale: number = 2): Promise<ConvertedPage[]> {
  // Extract base64 data from data URL
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: ConvertedPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    }).promise;

    pages.push({
      pageNumber: i,
      dataUrl: canvas.toDataURL('image/png'),
      width: viewport.width,
      height: viewport.height,
    });
  }

  return pages;
}

/**
 * Process ZIP file - extracts and converts all supported files
 */
async function processZipFile(file: File): Promise<ConversionResult> {
  const result: ConversionResult = {
    fileName: file.name,
    fileType: file.type,
    pages: [],
  };

  try {
    const extractedFiles = await extractZip(file);
    result.extractedFiles = extractedFiles;

    let pageNumber = 1;

    for (const extracted of extractedFiles) {
      if (!extracted.dataUrl) continue;

      if (extracted.mimeType === 'application/pdf') {
        // Convert PDF pages
        const pdfPages = await pdfDataUrlToImages(extracted.dataUrl);
        for (const page of pdfPages) {
          result.pages.push({
            ...page,
            pageNumber: pageNumber++,
            fileName: extracted.name,
          });
        }
      } else if (extracted.mimeType.startsWith('image/')) {
        // Add image directly
        const page = await dataUrlToPage(extracted.dataUrl, pageNumber++, extracted.name);
        result.pages.push(page);
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Failed to process ZIP';
  }

  return result;
}

/**
 * Convert any supported file to images
 */
export async function convertFileToImages(file: File): Promise<ConversionResult> {
  const result: ConversionResult = {
    fileName: file.name,
    fileType: file.type,
    pages: [],
  };

  try {
    if (isZipFile(file)) {
      return await processZipFile(file);
    } else if (file.type === 'application/pdf') {
      result.pages = await pdfToImages(file);
    } else if (file.type.startsWith('image/')) {
      result.pages = await imageToDataUrl(file);
    } else {
      result.error = `Unsupported file type: ${file.type || 'unknown'}`;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}

/**
 * Check if file is a ZIP archive
 */
export function isZipFile(file: File): boolean {
  return file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed' ||
    file.name.toLowerCase().endsWith('.zip');
}

/**
 * Check if a file type is supported for conversion
 */
export function isConvertibleFile(file: File): boolean {
  return file.type === 'application/pdf' ||
    file.type.startsWith('image/') ||
    isZipFile(file);
}
