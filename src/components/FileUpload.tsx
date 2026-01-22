import { useState, useCallback, useRef, useEffect } from 'react';
import { convertPdfToImages } from '../lib/fileToImage';
import {
  createSession,
  uploadFiles,
  saveConvertedImages,
  analyzeImages,
  type SessionFile,
} from '../lib/api';

interface UploadedFile {
  name: string;
  url: string;
  mimeType: string;
  size: number;
  source?: string;
  // For PDFs that need conversion
  pages?: Array<{ url: string; pageNumber: number }>;
  isConverting?: boolean;
  // Analysis
  analysis?: string;
  isAnalyzing?: boolean;
  analysisError?: string;
}

export function FileUpload() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create session on mount
  useEffect(() => {
    createSession()
      .then(setSessionId)
      .catch((err) => setError(`Failed to create session: ${err.message}`));
  }, []);

  const processUploadedFiles = async (files: SessionFile[]) => {
    const newFiles: UploadedFile[] = [];

    for (const file of files) {
      if (file.mimeType === 'application/pdf') {
        // Convert PDF to images
        const uploadedFile: UploadedFile = {
          ...file,
          isConverting: true,
        };
        newFiles.push(uploadedFile);

        // Convert in background
        convertPdfToImages(file.url).then(async (pages) => {
          if (sessionId && pages.length > 0) {
            // Save converted images to server
            const images = pages.map((p, i) => ({
              name: `${file.name.replace('.pdf', '')}_page_${i + 1}.png`,
              dataUrl: p.dataUrl,
            }));

            try {
              const savedPages = await saveConvertedImages(sessionId, images);

              setUploadedFiles((prev) =>
                prev.map((f) =>
                  f.url === file.url
                    ? {
                        ...f,
                        isConverting: false,
                        pages: savedPages.map((p, i) => ({
                          url: p.url,
                          pageNumber: i + 1,
                        })),
                      }
                    : f
                )
              );
            } catch (err) {
              console.error('Failed to save converted pages:', err);
              setUploadedFiles((prev) =>
                prev.map((f) =>
                  f.url === file.url ? { ...f, isConverting: false } : f
                )
              );
            }
          }
        });
      } else {
        newFiles.push(file);
      }
    }

    setUploadedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !sessionId) return;

      setIsUploading(true);
      setError(null);

      try {
        const uploaded = await uploadFiles(sessionId, Array.from(files));
        await processUploadedFiles(uploaded);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [sessionId]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    if (selectedFile === uploadedFiles[index]) {
      setSelectedFile(null);
    }
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileStatus = (item: UploadedFile): string => {
    if (item.isConverting) return 'Converting...';
    if (item.isAnalyzing) return 'Analyzing...';
    if (item.analysisError) return `Error: ${item.analysisError}`;
    if (item.analysis) return 'Analyzed';
    if (item.pages?.length) {
      return `${item.pages.length} page${item.pages.length > 1 ? 's' : ''}`;
    }
    return formatFileSize(item.size);
  };

  const getImageUrls = (file: UploadedFile): string[] => {
    if (file.pages?.length) {
      return file.pages.map((p) => p.url);
    }
    if (file.mimeType.startsWith('image/')) {
      return [file.url];
    }
    return [];
  };

  const analyzeFile = async (index: number) => {
    const file = uploadedFiles[index];
    const imageUrls = getImageUrls(file);
    if (imageUrls.length === 0) return;

    setUploadedFiles((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], isAnalyzing: true, analysisError: undefined };
      }
      return updated;
    });

    try {
      const analysis = await analyzeImages(imageUrls);

      setUploadedFiles((prev) => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = {
            ...updated[index],
            analysis,
            isAnalyzing: false,
          };
        }
        return updated;
      });
    } catch (err) {
      setUploadedFiles((prev) => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = {
            ...updated[index],
            isAnalyzing: false,
            analysisError: err instanceof Error ? err.message : 'Analysis failed',
          };
        }
        return updated;
      });
    }
  };

  const analyzeAllFiles = async () => {
    const filesToAnalyze = uploadedFiles
      .map((f, i) => ({ file: f, index: i }))
      .filter(({ file }) => {
        const hasImages = getImageUrls(file).length > 0;
        return hasImages && !file.analysis && !file.isAnalyzing && !file.isConverting;
      });

    for (const { index } of filesToAnalyze) {
      await analyzeFile(index);
    }
  };

  const canAnalyze = uploadedFiles.some((f) => {
    const hasImages = getImageUrls(f).length > 0;
    return hasImages && !f.analysis && !f.isAnalyzing && !f.isConverting;
  });

  return (
    <div className="upload-container">
      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {sessionId && (
        <div className="session-info">
          Session: <code>{sessionId}</code>
        </div>
      )}

      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.zip,application/zip,application/x-zip-compressed"
          onChange={handleInputChange}
          className="file-input"
          disabled={!sessionId || isUploading}
        />
        <div className="drop-zone-content">
          {isUploading ? (
            <>
              <div className="spinner large" />
              <p className="drop-zone-text">Uploading...</p>
            </>
          ) : (
            <>
              <svg
                className="upload-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="drop-zone-text">
                {isDragging
                  ? 'Drop files here...'
                  : 'Drag & drop files here, or click to select'}
              </p>
              <p className="drop-zone-hint">Supports images, PDFs, and ZIP files</p>
            </>
          )}
        </div>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="file-list">
          <div className="file-list-header">
            <h3>Uploaded Files ({uploadedFiles.length})</h3>
            <button
              className="analyze-all-btn"
              onClick={analyzeAllFiles}
              disabled={!canAnalyze}
            >
              Analyze All
            </button>
          </div>
          <ul>
            {uploadedFiles.map((item, index) => (
              <li
                key={`${item.url}-${index}`}
                className={`file-item ${selectedFile === item ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(item);
                  setShowAnalysis(false);
                }}
              >
                {item.mimeType.startsWith('image/') ? (
                  <img src={item.url} alt={item.name} className="file-preview" />
                ) : item.pages?.[0] ? (
                  <img src={item.pages[0].url} alt={item.name} className="file-preview" />
                ) : (
                  <div className={`file-icon ${item.isConverting ? 'converting' : ''}`}>
                    {item.isConverting ? (
                      <div className="spinner" />
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    )}
                  </div>
                )}
                <div className="file-info">
                  <span className="file-name">{item.name}</span>
                  <span className={`file-size ${item.analysisError ? 'error' : ''}`}>
                    {getFileStatus(item)}
                  </span>
                  {item.source && (
                    <span className="file-source">from {item.source}</span>
                  )}
                </div>
                <button
                  className="remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  aria-label="Remove file"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedFile && (getImageUrls(selectedFile).length > 0 || selectedFile.analysis) && (
        <div className="preview-panel">
          <div className="preview-header">
            <h3>{selectedFile.name}</h3>
            <div className="preview-header-actions">
              <div className="preview-tabs">
                <button
                  className={`tab-btn ${!showAnalysis ? 'active' : ''}`}
                  onClick={() => setShowAnalysis(false)}
                >
                  Preview
                </button>
                <button
                  className={`tab-btn ${showAnalysis ? 'active' : ''}`}
                  onClick={() => setShowAnalysis(true)}
                  disabled={!selectedFile.analysis && !selectedFile.isAnalyzing}
                >
                  Analysis
                </button>
              </div>
              {!selectedFile.analysis && !selectedFile.isAnalyzing && !selectedFile.isConverting && (
                <button
                  className="analyze-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const index = uploadedFiles.indexOf(selectedFile);
                    if (index >= 0) analyzeFile(index);
                  }}
                >
                  Analyze
                </button>
              )}
              {selectedFile.isAnalyzing && (
                <span className="analyzing-indicator">
                  <div className="spinner small" /> Analyzing...
                </span>
              )}
              <button
                className="close-btn"
                onClick={() => setSelectedFile(null)}
                aria-label="Close preview"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          {showAnalysis && selectedFile.analysis ? (
            <div className="analysis-content">
              <pre>{selectedFile.analysis}</pre>
            </div>
          ) : (
            <div className="preview-pages">
              {selectedFile.pages ? (
                selectedFile.pages.map((page) => (
                  <div key={page.pageNumber} className="preview-page">
                    <img src={page.url} alt={`Page ${page.pageNumber}`} />
                    {selectedFile.pages!.length > 1 && (
                      <span className="page-number">Page {page.pageNumber}</span>
                    )}
                  </div>
                ))
              ) : selectedFile.mimeType.startsWith('image/') ? (
                <div className="preview-page">
                  <img src={selectedFile.url} alt={selectedFile.name} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
