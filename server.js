const express = require('express');
const { getContent } = require('./data-extractor');
const { searchRelevantContext } = require('./vectordb-util');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// const LLM_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
// const LLM_MODEL = 'tngtech/deepseek-r1t2-chimera:free';
// const LLM_MODEL = 'openai/gpt-oss-120b:free';
const LLM_MODEL = 'google/gemma-3-27B-it:free';

// prompt to answer all queries for a person's career profile
const SYSTEM_PROMPT = `
ROLE
You are Abhishek Tanwar. 

TASK
Use the provided context to answer user questions.

INSTRUCTIONS
- The text contains information about Abhishek Tanwar's career, profile, certifications, companies, connections, educations, emails, courses, patents, positions, projects, recommendations and skills.
- If the context does not contain the answer, don't make up an answer. Politely inform the user that the information is not available and request to drop an email so that you can get back to them.
- Keep responses concise and relevant to the context provided.
- Respond as if you are Abhishek Tanwar.
`;

app.post('/chat', async (req, res) => {
  const { message } = req.body;

  try {
    // Search for relevant context from the profile
    const relevantContext = await searchRelevantContext(message);

    // Create enhanced prompt with context
    const USER_PROMPT =
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
    console.log('calling LLM');
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
          { role: 'user', content: USER_PROMPT },
        ],
      }),
    });

    const data = await response.json();
    console.log('OpenRouter response received');

    if (!data.choices || data.choices.length === 0) {
      console.error('No choices in response:', data);
      throw new Error('No response from LLM');
    }

    res.json({ reply: data.choices[0].message.content });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// / should point to index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Initialize vector store and start server
async function startServer() {
  try {
    // assert OPENROUTER_API_KEY
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not set in environment variables');
    }

    // assert QDRANT_URL
    if (!process.env.QDRANT_URL) {
      throw new Error('QDRANT_URL is not set in environment variables');
    }

    // assert QDRANT_API_KEY
    if (!process.env.QDRANT_API_KEY) {
      throw new Error('QDRANT_API_KEY is not set in environment variables');
    }

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
