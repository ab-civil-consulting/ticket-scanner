import { FileUpload } from './components/FileUpload';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="logo">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M7 15h0M2 9.5h20" />
              <path d="M7 4v16" />
            </svg>
            <span>Ticket Scanner</span>
          </div>
          <div className="header-meta">
            <span className="badge">AB Civil</span>
          </div>
        </div>
      </header>
      <main className="app-main">
        <div className="hero-section">
          <h1>Material Ticket Processing</h1>
          <p>Upload scanned tickets to extract data with AI-powered OCR. Review, edit, and export to CSV.</p>
        </div>
        <FileUpload />
      </main>
      <footer className="app-footer">
        <p>Powered by Gemini Flash 2.5</p>
      </footer>
    </div>
  );
}

export default App;
