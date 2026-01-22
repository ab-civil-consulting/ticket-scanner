const API_BASE = '/api';

export interface SessionFile {
  name: string;
  url: string;
  mimeType: string;
  size: number;
  source?: string; // For extracted files, the original ZIP name
  created?: string;
}

export interface Session {
  id: string;
  created: string;
  modified: string;
  files: {
    originals: number;
    extracted: number;
    converted: number;
  };
}

export interface SessionDetails {
  id: string;
  files: {
    originals: SessionFile[];
    extracted: SessionFile[];
    converted: SessionFile[];
  };
}

export interface AnalysisResponse {
  analysis: string;
}

// Create a new session
export async function createSession(): Promise<string> {
  const response = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create session');
  }

  const data = await response.json();
  return data.sessionId;
}

// List all sessions
export async function listSessions(): Promise<Session[]> {
  const response = await fetch(`${API_BASE}/sessions`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to list sessions');
  }

  const data = await response.json();
  return data.sessions;
}

// Get session details
export async function getSession(sessionId: string): Promise<SessionDetails> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get session');
  }

  return await response.json();
}

// Delete a session
export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete session');
  }
}

// Upload files to a session
export async function uploadFiles(sessionId: string, files: File[]): Promise<SessionFile[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const response = await fetch(`${API_BASE}/sessions/${sessionId}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload files');
  }

  const data = await response.json();
  return data.files;
}

// Save converted images (from PDF.js)
export async function saveConvertedImages(
  sessionId: string,
  images: Array<{ name: string; dataUrl: string }>
): Promise<SessionFile[]> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/converted`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ images }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save converted images');
  }

  const data = await response.json();
  return data.files;
}

// Auto-orient a single image
export async function orientImage(sessionId: string, imageUrl: string): Promise<{ rotated: number; url: string; originalUrl?: string }> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/orient`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageUrl }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to orient image');
  }

  return await response.json();
}

// Auto-orient all images in a session
export async function orientAllImages(sessionId: string): Promise<Array<{ url: string; rotated: number; newUrl?: string }>> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/orient-all`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to orient images');
  }

  const data = await response.json();
  return data.results;
}

// Analyze images with AI
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
