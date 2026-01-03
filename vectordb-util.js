const { getContent } = require('./data-extractor');
const { QdrantClient } = require('@qdrant/js-client-rest');

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const BATCH_SIZE = 5;
const EMBEDDINGS_MODEL = 'openai/text-embedding-3-small';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';

// Qdrant configuration
const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = 'career-bot-collection';
const VECTOR_SIZE = 1536; // text-embedding-3-small dimension
const MAX_RESULTS = 3;

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
});

// Qdrant vector database operations
class QdrantVectorDB {
  constructor() {
    this.client = qdrantClient;
    this.collectionName = COLLECTION_NAME;
  }

  // Create collection if it doesn't exist
  async createCollection() {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(
        (col) => col.name === this.collectionName
      );

      if (!collectionExists) {
        console.log(`Creating collection: ${this.collectionName}`);
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: VECTOR_SIZE,
            distance: 'Cosine',
          },
        });
        console.log('Collection created successfully');
      } else {
        console.log('Collection already exists');
      }
    } catch (error) {
      console.error('Error creating collection:', error);
      throw error;
    }
  }

  // Add documents with embeddings
  async add(data) {
    const { ids, embeddings, documents } = data;
    const points = [];

    for (let i = 0; i < ids.length; i++) {
      points.push({
        id: ids[i],
        vector: embeddings[i],
        payload: {
          document: documents[i],
          chunk_id: ids[i],
        },
      });
    }

    try {
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: points,
      });
    } catch (error) {
      console.error('Error adding documents to Qdrant:', error);
      throw error;
    }
  }

  // Query for similar documents
  async query(queryEmbedding, nResults = 3) {
    try {
      const searchResult = await this.client.search(this.collectionName, {
        vector: queryEmbedding,
        limit: nResults,
        with_payload: true,
      });

      return searchResult.map((result) => result.payload.document);
    } catch (error) {
      console.error('Error querying Qdrant:', error);
      return [];
    }
  }

  // Clear all data
  async clear() {
    try {
      // Delete collection and recreate
      await this.client.deleteCollection(this.collectionName);
      await this.createCollection();
    } catch (error) {
      console.error('Error clearing collection:', error);
      throw error;
    }
  }

  // Get collection info
  async getInfo() {
    try {
      const info = await this.client.getCollection(this.collectionName);
      return info;
    } catch (error) {
      console.error('Error getting collection info:', error);
      return null;
    }
  }
}

// Initialize Qdrant vector database
const vectorDB = new QdrantVectorDB();

// Split text into chunks
function splitIntoChunks(
  text,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
) {
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

// Store chunks and embeddings in Qdrant vector database
async function initializeVectorStore() {
  try {
    console.log('Loading content and creating Qdrant vector store...');

    // Create collection if it doesn't exist
    await vectorDB.createCollection();

    // Clear existing data
    await vectorDB.clear();

    // Load content
    const textContent = getContent();
    console.log('Content loaded successfully');

    // Split into chunks
    const chunks = splitIntoChunks(textContent);
    console.log(`Text split into ${chunks.length} chunks`);

    // Create embeddings and store in Qdrant
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = [];
      const documents = [];
      const ids = [];

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        try {
          const embedding = await createEmbedding(chunk);
          embeddings.push(embedding);
          documents.push(chunk);
          ids.push(i + j);

          // Rate limiting delay
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error processing chunk ${i + j}:`, error);
        }
      }

      if (embeddings.length > 0) {
        await vectorDB.add({
          ids: ids,
          embeddings: embeddings,
          documents: documents,
        });
      }

      console.log(
        `Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          chunks.length / BATCH_SIZE
        )}`
      );
    }

    // Get collection info
    const collectionInfo = await vectorDB.getInfo();
    console.log(
      `Qdrant vector store initialized with ${
        collectionInfo?.points_count || 0
      } vectors`
    );
  } catch (error) {
    console.error('Error initializing Qdrant vector store:', error);
  }
}

// Search for relevant context
async function searchRelevantContext(query, numResults = MAX_RESULTS) {
  try {
    const queryEmbedding = await createEmbedding(query);
    const results = await vectorDB.query(queryEmbedding, numResults);
    return results;
  } catch (error) {
    console.error('Error searching context:', error);
    return [];
  }
}

// Export functions and database instance
module.exports = {
  searchRelevantContext,
};
