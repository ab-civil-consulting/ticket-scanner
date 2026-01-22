import * as pdfjsLib from 'pdfjs-dist';

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
}

export interface ConversionResult {
  fileName: string;
  fileType: string;
  pages: ConvertedPage[];
  error?: string;
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
 * Convert any supported file to images
 */
export async function convertFileToImages(file: File): Promise<ConversionResult> {
  const result: ConversionResult = {
    fileName: file.name,
    fileType: file.type,
    pages: [],
  };

  try {
    if (file.type === 'application/pdf') {
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
 * Check if a file type is supported for conversion
 */
export function isConvertibleFile(file: File): boolean {
  return file.type === 'application/pdf' || file.type.startsWith('image/');
}
