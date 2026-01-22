import { useState, useEffect, useCallback, useRef } from 'react';
import type { ExtractedTicket, TicketField } from '../lib/api';
import { TICKET_FIELDS, FIELD_LABELS } from '../lib/api';
import './TicketReview.css';

interface TicketReviewProps {
  tickets: ExtractedTicket[];
  onTicketsChange: (tickets: ExtractedTicket[]) => void;
  onClose: () => void;
}

export function TicketReview({ tickets, onTicketsChange, onClose }: TicketReviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedTickets, setEditedTickets] = useState<ExtractedTicket[]>(tickets);
  const [imageZoom, setImageZoom] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const currentTicket = editedTickets[currentIndex];
  const approvedCount = editedTickets.filter((t) => t.status === 'approved').length;
  const flaggedCount = editedTickets.filter((t) => t.status === 'flagged').length;
  const pendingCount = editedTickets.filter((t) => t.status === 'pending').length;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
        case 'k':
          e.preventDefault();
          setCurrentIndex((i) => Math.max(0, i - 1));
          break;
        case 'ArrowRight':
        case 'j':
          e.preventDefault();
          setCurrentIndex((i) => Math.min(editedTickets.length - 1, i + 1));
          break;
        case 'a':
          e.preventDefault();
          handleApprove();
          break;
        case 'f':
          e.preventDefault();
          handleFlag();
          break;
        case '+':
        case '=':
          e.preventDefault();
          setImageZoom((z) => Math.min(3, z + 0.25));
          break;
        case '-':
          e.preventDefault();
          setImageZoom((z) => Math.max(0.5, z - 0.25));
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editedTickets.length, currentIndex]);

  const handleFieldChange = useCallback(
    (field: TicketField, value: string) => {
      setEditedTickets((prev) => {
        const updated = [...prev];
        updated[currentIndex] = {
          ...updated[currentIndex],
          fields: {
            ...updated[currentIndex].fields,
            [field]: {
              ...updated[currentIndex].fields[field],
              value,
              needsReview: false, // User has reviewed
            },
          },
        };
        return updated;
      });
    },
    [currentIndex]
  );

  const handleApprove = useCallback(() => {
    setEditedTickets((prev) => {
      const updated = [...prev];
      updated[currentIndex] = { ...updated[currentIndex], status: 'approved' };
      return updated;
    });
    // Auto-advance to next ticket
    if (currentIndex < editedTickets.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, editedTickets.length]);

  const handleFlag = useCallback(() => {
    setEditedTickets((prev) => {
      const updated = [...prev];
      updated[currentIndex] = { ...updated[currentIndex], status: 'flagged' };
      return updated;
    });
  }, [currentIndex]);

  const handleSave = useCallback(() => {
    onTicketsChange(editedTickets);
  }, [editedTickets, onTicketsChange]);

  const getConfidenceClass = (confidence: number): string => {
    if (confidence >= 85) return 'high';
    if (confidence >= 60) return 'medium';
    return 'low';
  };

  const getConfidenceIcon = (confidence: number): string => {
    if (confidence >= 85) return '✓';
    if (confidence >= 60) return '?';
    return '!';
  };

  const exportToCSV = useCallback(() => {
    const headers = ['Status', 'Image', 'Overall Confidence', ...TICKET_FIELDS.map((f) => FIELD_LABELS[f])];
    const rows = editedTickets.map((ticket) => [
      ticket.status,
      ticket.imageUrl,
      ticket.overallConfidence.toString(),
      ...TICKET_FIELDS.map((f) => `"${ticket.fields[f].value.replace(/"/g, '""')}"`),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [editedTickets]);

  const exportApprovedToCSV = useCallback(() => {
    const approved = editedTickets.filter((t) => t.status === 'approved');
    const headers = ['Image', ...TICKET_FIELDS.map((f) => FIELD_LABELS[f])];
    const rows = approved.map((ticket) => [
      ticket.imageUrl,
      ...TICKET_FIELDS.map((f) => `"${ticket.fields[f].value.replace(/"/g, '""')}"`),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets_approved_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }, [editedTickets]);

  if (!currentTicket) {
    return (
      <div className="ticket-review-empty">
        <p>No tickets to review</p>
        <button onClick={onClose}>Close</button>
      </div>
    );
  }

  return (
    <div className="ticket-review">
      <div className="review-header">
        <div className="review-title">
          <h2>Ticket Review</h2>
          <div className="review-stats">
            <span className="stat approved">{approvedCount} approved</span>
            <span className="stat pending">{pendingCount} pending</span>
            <span className="stat flagged">{flaggedCount} flagged</span>
          </div>
        </div>

        <div className="review-actions">
          <div className="export-dropdown">
            <button
              className="export-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export
            </button>
            {showExportMenu && (
              <div className="export-menu">
                <button onClick={exportToCSV}>Export All ({editedTickets.length})</button>
                <button onClick={exportApprovedToCSV} disabled={approvedCount === 0}>
                  Export Approved ({approvedCount})
                </button>
              </div>
            )}
          </div>

          <button className="save-btn" onClick={handleSave}>
            Save Changes
          </button>

          <button className="close-review-btn" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="review-navigation">
        <button
          className="nav-btn"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Previous
        </button>

        <div className="nav-indicator">
          <span className="nav-current">{currentIndex + 1}</span>
          <span className="nav-separator">/</span>
          <span className="nav-total">{editedTickets.length}</span>
        </div>

        <button
          className="nav-btn"
          onClick={() => setCurrentIndex((i) => Math.min(editedTickets.length - 1, i + 1))}
          disabled={currentIndex === editedTickets.length - 1}
        >
          Next
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="review-content">
        <div className="review-image-panel">
          <div className="image-toolbar">
            <div className="zoom-controls">
              <button onClick={() => setImageZoom((z) => Math.max(0.5, z - 0.25))}>−</button>
              <span>{Math.round(imageZoom * 100)}%</span>
              <button onClick={() => setImageZoom((z) => Math.min(3, z + 0.25))}>+</button>
            </div>
            <button className="reset-zoom" onClick={() => setImageZoom(1)}>
              Reset
            </button>
          </div>
          <div className="image-container">
            <img
              src={currentTicket.imageUrl}
              alt="Ticket"
              style={{ transform: `scale(${imageZoom})` }}
            />
          </div>
        </div>

        <div className="review-form-panel" ref={formRef}>
          <div className="form-header">
            <div className="ticket-meta">
              <span className={`status-badge ${currentTicket.status}`}>
                {currentTicket.status}
              </span>
              <span className={`confidence-badge ${getConfidenceClass(currentTicket.overallConfidence)}`}>
                {currentTicket.overallConfidence}% confidence
              </span>
            </div>
            <div className="quick-actions">
              <button
                className="action-btn approve"
                onClick={handleApprove}
                title="Approve (A)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Approve
              </button>
              <button
                className="action-btn flag"
                onClick={handleFlag}
                title="Flag for Review (F)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
                Flag
              </button>
            </div>
          </div>

          <div className="form-fields">
            {TICKET_FIELDS.map((field) => {
              const fieldData = currentTicket.fields[field];
              const confidenceClass = getConfidenceClass(fieldData.confidence);

              return (
                <div
                  key={field}
                  className={`form-field ${confidenceClass} ${fieldData.needsReview ? 'needs-review' : ''}`}
                >
                  <label htmlFor={field}>
                    {FIELD_LABELS[field]}
                    <span className={`confidence-indicator ${confidenceClass}`} title={`${fieldData.confidence}% confidence`}>
                      {getConfidenceIcon(fieldData.confidence)}
                    </span>
                  </label>
                  {field === 'notes' ? (
                    <textarea
                      id={field}
                      value={fieldData.value}
                      onChange={(e) => handleFieldChange(field, e.target.value)}
                      placeholder={`Enter ${FIELD_LABELS[field].toLowerCase()}`}
                      rows={3}
                    />
                  ) : (
                    <input
                      type="text"
                      id={field}
                      value={fieldData.value}
                      onChange={(e) => handleFieldChange(field, e.target.value)}
                      placeholder={`Enter ${FIELD_LABELS[field].toLowerCase()}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="keyboard-shortcuts">
        <span><kbd>←</kbd><kbd>→</kbd> Navigate</span>
        <span><kbd>A</kbd> Approve</span>
        <span><kbd>F</kbd> Flag</span>
        <span><kbd>+</kbd><kbd>−</kbd> Zoom</span>
        <span><kbd>Esc</kbd> Close</span>
      </div>
    </div>
  );
}
