// server.js - Backend API Proxy Server
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config({ path: './backend/.env' });

const app = express();
const PORT = 5000;

// Multer storage config (for file uploads)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

// Ensure uploads folder exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// MongoDB connection
const MONGODB_URI = 'mongodb://localhost:27017/multimodal';
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('MongoDB Connected...'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

// MongoDB Schema
const interactionSchema = new mongoose.Schema({
  file: {
    type: new mongoose.Schema({
      name: String,
      type: String,
      size: Number,
      category: String,
      content: String,
      processedAt: Date,
    }),
    _id: false,
  },
  query: String,
  response: String,
  timestamp: { type: Date, default: Date.now },
});
const Interaction = mongoose.model('Interaction', interactionSchema);

// Gemini API configuration
const GEMINI_API_KEY = 'AIzaSyBQ9smnMFHlsOt3jEWV2k7tUEk7J5lL7IM';
const GEMINI_MODEL_ID = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent`;

// ✅ CORS setup (Express 5)
app.use(
  cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ✅ Handle preflight OPTIONS requests
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Query endpoint - Gemini AI
app.post('/api/query', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const fileContextMatch = prompt.match(
      /Context from uploaded files:\n([\s\S]*?)\n\nUser Query: ([\s\S]*)/
    );
    let fileData = null;
    let userQuery = prompt;

    if (fileContextMatch && fileContextMatch[1] && fileContextMatch[2]) {
      const fileContentString = fileContextMatch[1];
      userQuery = fileContextMatch[2];

      const fileNameAndCategoryMatch = fileContentString.match(/File: (.*?) \((.*?)\)/);
      if (fileNameAndCategoryMatch) {
        fileData = {
          name: fileNameAndCategoryMatch[1],
          category: fileNameAndCategoryMatch[2],
          content: null,
        };

        // Handle text or image file
        if (fileData.category === 'text' && fileContentString.includes('Content:')) {
          const contentStartIndex =
            fileContentString.indexOf('Content:') + 'Content:'.length;
          const contentEndIndex = fileContentString.indexOf('...', contentStartIndex);
          if (contentStartIndex !== -1) {
            fileData.content = fileContentString
              .substring(
                contentStartIndex,
                contentEndIndex !== -1 ? contentEndIndex : fileContentString.length
              )
              .trim();
          }
        } else if (fileData.category === 'image') {
          fileData.content = 'Image file uploaded (visual content available)';
        } else {
          fileData.content = `${fileData.category} file uploaded`;
        }
      }
    }

    console.log('Received query:', userQuery.substring(0, 100) + '...');

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', errorText);
      return res.status(response.status).json({
        error: 'Failed to get response from AI',
        details: errorText,
      });
    }

    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';

    const newInteraction = new Interaction({
      file: fileData,
      query: userQuery,
      response: answer,
    });
    await newInteraction.save();

    console.log('Response generated successfully');
    res.json({ answer });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
  console.log(`📡 Query endpoint: http://localhost:${PORT}/api/query`);
});
