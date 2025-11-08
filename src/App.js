import React, { useState, useRef } from 'react';
import { Upload, FileText, Image, Music, Video, Search, Trash2, Download, AlertCircle } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import './style.css';

const MultimodalProcessor = () => {
  const [files, setFiles] = useState([]);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileLink, setFileLink] = useState('');
  const [youtubeLink, setYoutubeLink] = useState('');
  const fileInputRef = useRef(null);

  GlobalWorkerOptions.workerSrc = `http://localhost:3000/pdf.worker.min.mjs`;

  const BACKEND_URL = 'http://localhost:5000/api/query';

  const getFileCategory = (type, name) => {
    if (type.startsWith('text/') || name.match(/\.(txt|md|pdf|docx|pptx)$/i)) return 'text';
    if (type.startsWith('image/') || name.match(/\.(png|jpg|jpeg|gif|webp)$/i)) return 'image';
    if (type.startsWith('audio/') || name.match(/\.(mp3|wav|ogg)$/i)) return 'audio';
    if (type.startsWith('video/') || name.match(/\.(mp4|webm|mov)$/i)) return 'video';
    return 'other';
  };

  const extractTextFromPdf = async (arrayBuffer) => {
    const pdf = await getDocument(arrayBuffer).promise;
    let fullText = '';
    for (let i = 0; i < pdf.numPages; i++) {
      const page = await pdf.getPage(i + 1);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((item) => item.str).join(' ') + '\n';
    }
    return fullText;
  };

  const processFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        const content = e.target?.result ?? null;
        if (file.type === 'application/pdf') {
          const text = await extractTextFromPdf(content);
          resolve({
            id: Date.now(),
            name: file.name,
            type: file.type,
            size: file.size,
            content: text,
            category: getFileCategory(file.type, file.name),
            processedAt: new Date().toISOString(),
          });
        } else {
          resolve({
            id: Date.now(),
            name: file.name,
            type: file.type,
            size: file.size,
            content,
            category: getFileCategory(file.type, file.name),
            processedAt: new Date().toISOString(),
          });
        }
      };

      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileUpload = async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const uploadedFile = e.target.files[0];
    const processed = await processFile(uploadedFile);
    setFiles([processed]);
  };

  const removeFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const buildContext = (files) =>
    files.map((f) => `File: ${f.name}\nContent: ${f.content?.toString().slice(0, 1000)}...`).join('\n\n');

  const handleQuery = async () => {
    if (!query.trim()) return setError('Please enter a question');
    if (files.length === 0) return setError('Please upload at least one file');

    setError('');
    setLoading(true);
    try {
      const context = buildContext(files);
      const apiResponse = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `Context:\n${context}\n\nQuery:\n${query}` }),
      });
      const data = await apiResponse.json();
      setResponse(data.answer || 'No response');
    } catch (err) {
      setError('Backend error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(files, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f2c] via-[#1a3cff] to-[#122b75] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-300 tracking-tight shadow-lg drop-shadow-[0_4px_10px_rgba(0,0,255,0.4)]">
            Multimodal Data Processing System
          </h1>
          <p className="text-blue-200">Upload files, ask questions, get AI-powered answers</p>
        </div>

        {/* Upload Section */}
        <div className="bg-white/10 backdrop-blur-lg p-6 rounded-xl border border-white/20 mb-8">
          <label className="cursor-pointer w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg flex items-center justify-center gap-2 mb-4">
            <Upload className="w-5 h-5" />
            Upload Files
            <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
          </label>

          {files.length > 0 && (
            <div className="space-y-3">
              {files.map((file) => (
                <div key={file.id} className="flex items-center justify-between bg-white/10 p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <p>{file.name}</p>
                  </div>
                  <button onClick={() => removeFile(file.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Query Section */}
        <div className="bg-white/10 backdrop-blur-lg p-6 rounded-xl border border-white/20 mb-8">
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            <Search className="w-5 h-5" /> Ask a Question
          </h2>
          <textarea
            className="w-full p-4 bg-white/10 rounded-lg border border-white/20 focus:ring-2 focus:ring-blue-500 resize-none"
            rows="4"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything about your uploaded files..."
          />
          <button
            onClick={handleQuery}
            disabled={loading}
            className="mt-4 w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:opacity-90 py-3 rounded-lg font-medium flex justify-center gap-2"
          >
            {loading ? 'Processing...' : 'Search'}
          </button>
        </div>

        {/* Response */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-4">
            <AlertCircle className="w-5 h-5 inline-block text-red-300 mr-2" />
            {error}
          </div>
        )}
        {response && (
          <div className="bg-white/10 backdrop-blur-lg p-6 rounded-xl border border-white/20">
            <h2 className="text-xl font-semibold mb-3">Response</h2>
            <p className="text-blue-100 whitespace-pre-wrap">{response}</p>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-gray-400 mt-10 border-t border-white/10 pt-6">
          © {new Date().getFullYear()} Shaik Lalbee — All rights reserved.
        </footer>
      </div>
    </div>
  );
};

export default MultimodalProcessor;
