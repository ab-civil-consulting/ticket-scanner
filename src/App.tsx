import { FileUpload } from './components/FileUpload';
import './App.css';

function App() {
  return (
    <div className="app">
      <header>
        <h1>Ticket Scanner</h1>
        <p>Upload your tickets to get started</p>
      </header>
      <main>
        <FileUpload />
      </main>
    </div>
  );
}

export default App;
