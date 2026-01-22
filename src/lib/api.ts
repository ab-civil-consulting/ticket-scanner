const API_BASE = '/api';

export interface ExtractedFile {
  name: string;
  mimeType: string;
  dataUrl: string | null;
  size: number;
}

export interface ExtractZipResponse {
  files: ExtractedFile[];
}

export interface AnalysisResponse {
  analysis: string;
}

export async function extractZip(file: File): Promise<ExtractedFile[]> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/extract-zip`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to extract ZIP');
  }

  const data: ExtractZipResponse = await response.json();
  return data.files;
}

export async function analyzeImages(images: string[], prompt?: string): Promise<string> {
  const response = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ images, prompt }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to analyze images');
  }

  const data: AnalysisResponse = await response.json();
  return data.analysis;
}
