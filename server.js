const express = require('express');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
const EMBEDDINGS_MODEL = 'openai/text-embedding-3-small';
const LLM_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

// In-memory vector database class
class InMemoryVectorDB {
  constructor() {
    this.documents = [];
    this.embeddings = [];
    this.ids = [];
  }

  // Add documents with embeddings
  add(data) {
    const { ids, embeddings, documents } = data;
    for (let i = 0; i < ids.length; i++) {
      this.ids.push(ids[i]);
      this.embeddings.push(embeddings[i]);
      this.documents.push(documents[i]);
    }
  }

  // Calculate cosine similarity between two vectors
  cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  // Query for similar documents
  query(queryEmbedding, nResults = 3) {
    const similarities = this.embeddings.map((embedding, index) => ({
      index,
      similarity: this.cosineSimilarity(queryEmbedding, embedding),
      document: this.documents[index],
      id: this.ids[index],
    }));

    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Return top results
    return similarities.slice(0, nResults).map((item) => item.document);
  }

  // Clear all data
  clear() {
    this.documents = [];
    this.embeddings = [];
    this.ids = [];
  }
}

// Initialize in-memory vector database
const vectorDB = new InMemoryVectorDB();

// Load PDF from data/Profile.pdf
async function loadPDF() {
  try {
    const pdfPath = path.join(__dirname, 'data', 'Profile.pdf');
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await new pdf.PDFParse({ data: dataBuffer }).getText();
    return data.text;
  } catch (error) {
    console.error('Error loading PDF:', error);
    throw error;
  }
}

// Split text into chunks
function splitIntoChunks(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  let currentChunk = '';

  for (const sentence of sentences) {
    if (
      (currentChunk + sentence).length > chunkSize &&
      currentChunk.length > 0
    ) {
      chunks.push(currentChunk.trim());
      // Keep overlap from the end of current chunk
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 5)); // Approximate word count for overlap
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
    } else {
      currentChunk += ' ' + sentence;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Create embeddings using OpenRouter embeddings endpoint
async function createEmbedding(text) {
  try {
    const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDINGS_MODEL,
        input: text,
      }),
    });

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error creating embedding:', error);
    throw error;
  }
}

// Store chunks and embeddings in in-memory vector database
async function initializeVectorStore() {
  try {
    console.log('Loading PDF and creating vector store...');

    // Clear existing data
    vectorDB.clear();

    // Load PDF content
    const pdfContent = await loadPDF();
    console.log('PDF loaded successfully');

    // Split into chunks
    const chunks = splitIntoChunks(pdfContent);
    console.log(`Text split into ${chunks.length} chunks`);

    console.log('In-memory vector database initialized');

    // Create embeddings and store in vector database
    const batchSize = 5; // Process in batches to avoid rate limits

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = [];
      const documents = [];
      const ids = [];

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        try {
          const embedding = await createEmbedding(chunk);
          embeddings.push(embedding);
          documents.push(chunk);
          ids.push(`chunk_${i + j}`);

          // Rate limiting delay
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error processing chunk ${i + j}:`, error);
        }
      }

      if (embeddings.length > 0) {
        vectorDB.add({
          ids: ids,
          embeddings: embeddings,
          documents: documents,
        });
      }

      console.log(
        `Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          chunks.length / batchSize
        )}`
      );
    }

    console.log('Vector store initialized successfully');
  } catch (error) {
    console.error('Error initializing vector store:', error);
  }
}

// Search for relevant context
async function searchRelevantContext(query, numResults = 3) {
  try {
    const queryEmbedding = await createEmbedding(query);
    const results = vectorDB.query(queryEmbedding, numResults);
    return results;
  } catch (error) {
    console.error('Error searching context:', error);
    return [];
  }
}

// prompt to answer all queries for a person's career profile
const SYSTEM_PROMPT = `
ROLE
You are Abhishek Tanwar. 

TASK
Use the provided context to answer user questions.

INSTRUCTIONS
- Use only the provided context to answer questions.
- If the context does not contain the answer, respond with "No".
- Keep responses concise and relevant.
- Respond as if you are Abhishek Tanwar.
`;

app.post('/chat', async (req, res) => {
  const { message } = req.body;

  try {
    // Search for relevant context from the profile
    const relevantContext = await searchRelevantContext(message);

    // Create enhanced prompt with context
    const contextPrompt =
      relevantContext.length > 0
        ? `
        Context from profile:
        ${relevantContext.join('\n\n')}
          
        User question: 
        ${message}
        
        ${SYSTEM_PROMPT}`
        : `
        User question: 
        ${message}
        
        ${SYSTEM_PROMPT}
        `;

    // Call OpenRouter API
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contextPrompt },
        ],
      }),
    });

    const data = await response.json();
    console.log('OpenRouter response received');
    res.json({ reply: data.choices[0].message.content });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Initialize vector store and start server
async function startServer() {
  try {
    // Check if OPENROUTER_API_KEY is set
    if (!OPENROUTER_API_KEY) {
      console.error(
        'Error: OPENROUTER_API_KEY environment variable is not set'
      );
      console.log('Please set your OpenRouter API key:');
      console.log('export OPENROUTER_API_KEY="your_api_key_here"');
      process.exit(1);
    }

    // Initialize vector store
    await initializeVectorStore();

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Vector store initialized and ready for chat!');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
