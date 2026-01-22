import { useState, useCallback, useRef } from 'react';
import { convertFileToImages, isConvertibleFile, type ConversionResult } from '../lib/fileToImage';

interface UploadedFile {
  file: File;
  preview?: string;
  conversion?: ConversionResult;
  isConverting?: boolean;
}

export function FileUpload() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File): Promise<UploadedFile> => {
    const uploadedFile: UploadedFile = { file };

    if (file.type.startsWith('image/')) {
      uploadedFile.preview = URL.createObjectURL(file);
    }

    if (isConvertibleFile(file)) {
      uploadedFile.isConverting = true;
    }

    return uploadedFile;
  };

  const convertFile = async (index: number) => {
    setUploadedFiles((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], isConverting: true };
      }
      return updated;
    });

    const file = uploadedFiles[index]?.file;
    if (!file) return;

    const conversion = await convertFileToImages(file);

    setUploadedFiles((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          conversion,
          isConverting: false,
          preview: conversion.pages[0]?.dataUrl || updated[index].preview,
        };
      }
      return updated;
    });
  };

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;

    const newFiles: UploadedFile[] = await Promise.all(
      Array.from(files).map(processFile)
    );

    setUploadedFiles((prev) => {
      const startIndex = prev.length;
      // Auto-convert files after adding
      newFiles.forEach((_, i) => {
        const file = newFiles[i];
        if (file.isConverting) {
          setTimeout(() => convertFile(startIndex + i), 0);
        }
      });
      return [...prev, ...newFiles];
    });
  }, []);

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
    setUploadedFiles((prev) => {
      const file = prev[index];
      if (file.preview && !file.preview.startsWith('data:')) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
    if (selectedFile === uploadedFiles[index]) {
      setSelectedFile(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileStatus = (item: UploadedFile): string => {
    if (item.isConverting) return 'Converting...';
    if (item.conversion?.error) return `Error: ${item.conversion.error}`;
    if (item.conversion?.pages.length) {
      return `${item.conversion.pages.length} page${item.conversion.pages.length > 1 ? 's' : ''}`;
    }
    return formatFileSize(item.file.size);
  };

  return (
    <div className="upload-container">
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={handleInputChange}
          className="file-input"
        />
        <div className="drop-zone-content">
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
          <p className="drop-zone-hint">Supports images and PDFs</p>
        </div>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="file-list">
          <h3>Uploaded Files ({uploadedFiles.length})</h3>
          <ul>
            {uploadedFiles.map((item, index) => (
              <li
                key={index}
                className={`file-item ${selectedFile === item ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(item);
                }}
              >
                {item.preview ? (
                  <img src={item.preview} alt={item.file.name} className="file-preview" />
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
                  <span className="file-name">{item.file.name}</span>
                  <span className={`file-size ${item.conversion?.error ? 'error' : ''}`}>
                    {getFileStatus(item)}
                  </span>
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

      {selectedFile?.conversion?.pages && selectedFile.conversion.pages.length > 0 && (
        <div className="preview-panel">
          <div className="preview-header">
            <h3>{selectedFile.file.name}</h3>
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
          <div className="preview-pages">
            {selectedFile.conversion.pages.map((page) => (
              <div key={page.pageNumber} className="preview-page">
                <img
                  src={page.dataUrl}
                  alt={`Page ${page.pageNumber}`}
                />
                {selectedFile.conversion!.pages.length > 1 && (
                  <span className="page-number">Page {page.pageNumber}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
