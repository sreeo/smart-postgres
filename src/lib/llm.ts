import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOllama } from '@langchain/community/chat_models/ollama';

let llm: ChatOpenAI | ChatOllama;

interface LLMConfig {
  provider: 'openrouter' | 'ollama';
  apiKey?: string;  // Required for OpenRouter
  baseUrl?: string; // Optional for Ollama, defaults to http://localhost:11434
  model?: string;   // Optional, defaults based on provider
}

export const initializeLLM = (config: LLMConfig) => {
  if (config.provider === 'openrouter') {
    llm = new ChatOpenAI({
      openAIApiKey: config.apiKey,
      modelName: config.model || 'anthropic/claude-3-opus-20240229',
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/your-username/smart-postgres',
          'X-Title': 'Smart Postgres',
        },
      },
      temperature: 0,
    });
  } else {
    llm = new ChatOllama({
      baseUrl: config.baseUrl || 'http://localhost:11434',
      model: config.model || 'codellama:7b-instruct',
      temperature: 0,
    });
  }
};

const analyzeQueryTemplate = `You are a PostgreSQL expert. Given the following database schema and natural language query, 
determine if this requires:
1. A SQL query to fetch data
2. A natural language explanation about the database structure
3. Additional user input before generating SQL

IMPORTANT: If the query involves ANY of these, it ALWAYS requires user input:
- Specific dates or date ranges
- Specific IDs or values to filter by
- Thresholds or limits (e.g., "more than X", "at least Y")
- Time periods (e.g., "last 7 days", "this month")

If it requires a SQL query with no additional input, respond with: NEEDS_QUERY
If it requires an explanation, respond with: NEEDS_EXPLANATION
If it requires additional user input, respond with: NEEDS_INPUT

Database Schema:
{schema}

User Query: {query}

Respond with ONLY "NEEDS_QUERY", "NEEDS_EXPLANATION", or "NEEDS_INPUT".`;

export const analyzeQueryType = async (schema: any[], query: string) => {
  if (!llm) {
    throw new Error('LLM not initialized. Call initializeLLM first.');
  }

  const prompt = PromptTemplate.fromTemplate(analyzeQueryTemplate);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const schemaString = schema.map(table => {
    return `Table: ${table.table_name}\nColumns: ${table.columns.map((col: any) => 
      `${col.column_name} (${col.data_type})`).join(', ')}\n`;
  }).join('\n');

  const response = await chain.invoke({
    schema: schemaString,
    query: query,
  });

  return response.trim();
};

const identifyInputsTemplate = `You are a PostgreSQL expert. Given the following database schema and natural language query,
identify what additional inputs are needed from the user to generate a complete SQL query.

IMPORTANT: ALWAYS identify inputs for:
- Any specific dates or date ranges mentioned
- Any specific IDs or values used for filtering
- Any thresholds or limits (e.g., "more than X", "at least Y")
- Any time periods (e.g., "last 7 days", "this month")

For date inputs:
- Use type "date" for single dates
- Provide example in ISO format (YYYY-MM-DD)
- Be explicit about the date's purpose in the description

Database Schema:
{schema}

User Query: {query}

RULES:
1. Return a valid JSON array of required inputs
2. Each input must have: name, description, type, and example
3. Use descriptive names (e.g., "start_date", "user_id", "min_amount")
4. Type must be one of: "text", "number", "date"
5. Return an empty array [] if no inputs are needed
6. DO NOT include comments or explanations in the JSON

Example format (DO NOT COPY, CREATE YOUR OWN BASED ON THE QUERY):
[
  {{
    "name": "start_date",
    "description": "Start date for filtering transactions",
    "type": "date",
    "example": "2024-03-20"
  }}
]`;

export const identifyRequiredInputs = async (schema: any[], query: string) => {
  if (!llm) {
    throw new Error('LLM not initialized. Call initializeLLM first.');
  }

  const prompt = PromptTemplate.fromTemplate(identifyInputsTemplate);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const schemaString = schema.map(table => {
    return `Table: ${table.table_name}\nColumns: ${table.columns.map((col: any) => 
      `${col.column_name} (${col.data_type})`).join(', ')}\n`;
  }).join('\n');

  try {
    const response = await chain.invoke({
      schema: schemaString,
      query: query,
    });

    console.log('Raw LLM response for input identification:', response);

    // Clean up the response - remove any markdown formatting
    const cleanResponse = response.replace(/```json\n?|\n?```/g, '').trim();
    console.log('Cleaned response:', cleanResponse);

    try {
      const parsedInputs = JSON.parse(cleanResponse);

      // Validate the structure of the response
      if (!Array.isArray(parsedInputs)) {
        console.error('Invalid response format: not an array');
        throw new Error('Invalid response format from LLM: expected an array of inputs');
      }

      // Validate each input object
      parsedInputs.forEach((input, index) => {
        const { name, description, type, example } = input;
        
        if (!name || !description || !type || !example) {
          console.error('Invalid input object:', input);
          throw new Error(`Input at index ${index} is missing required fields`);
        }

        if (!['text', 'number', 'date'].includes(type)) {
          console.error('Invalid input type:', type);
          throw new Error(`Invalid type "${type}" for input "${name}"`);
        }

        // Additional validation for date format
        if (type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(example)) {
          console.error('Invalid date format:', example);
          throw new Error(`Invalid date format for input "${name}". Expected YYYY-MM-DD`);
        }
      });

      return parsedInputs;
    } catch (parseError: any) {
      console.error('Parse error:', parseError);
      if (parseError instanceof SyntaxError) {
        throw new Error('Invalid JSON response from LLM');
      }
      throw parseError;
    }
  } catch (error: any) {
    console.error('Error in identifyRequiredInputs:', error);
    throw new Error(`Failed to identify required inputs: ${error.message}`);
  }
};

const sqlGenerationTemplate = `You are a SQL expert. Given the following database schema, natural language query, and user inputs, 
generate a PostgreSQL query that answers the question.

IMPORTANT RULES:
1. NEVER use placeholder values like 'your_specific_date', 'your_id', etc.
2. ALWAYS use the provided user inputs for specific values
3. If a required input is missing, generate an error message instead of a query
4. Return ONLY the raw SQL query with no formatting, quotes, backticks, or markdown

Database Schema:
{schema}

User Query: {query}

User Inputs: {inputs}

The response should be a valid PostgreSQL query with no additional formatting or explanation.
If any required inputs are missing, respond with "ERROR: Missing required input: <input description>"`;

export const generateSQLQuery = async (schema: any[], query: string, inputs?: Record<string, any>) => {
  if (!llm) {
    throw new Error('LLM not initialized. Call initializeLLM first.');
  }

  const prompt = PromptTemplate.fromTemplate(sqlGenerationTemplate);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const schemaString = schema.map(table => {
    return `Table: ${table.table_name}\nColumns: ${table.columns.map((col: any) => 
      `${col.column_name} (${col.data_type})`).join(', ')}\n`;
  }).join('\n');

  const response = await chain.invoke({
    schema: schemaString,
    query: query,
    inputs: inputs ? JSON.stringify(inputs) : 'No additional inputs provided',
  });

  return response.trim();
};

const schemaExplanationTemplate = `You are a database expert. Given the following database schema and user's question,
provide a clear and concise explanation about the database structure.

Database Schema:
{schema}

User Question: {query}

Provide a natural language explanation that answers the user's question about the database structure.`;

export const generateSchemaExplanation = async (schema: any[], query: string) => {
  if (!llm) {
    throw new Error('LLM not initialized. Call initializeLLM first.');
  }

  const prompt = PromptTemplate.fromTemplate(schemaExplanationTemplate);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const schemaString = schema.map(table => {
    return `Table: ${table.table_name}\nColumns: ${table.columns.map((col: any) => 
      `${col.column_name} (${col.data_type})`).join(', ')}\n`;
  }).join('\n');

  const response = await chain.invoke({
    schema: schemaString,
    query: query,
  });

  return response.trim();
};

export const validateQueryResult = async (query: string, result: any, userQuery: string) => {
  if (!llm) {
    throw new Error('LLM not initialized. Call initializeLLM first.');
  }

  const validationTemplate = `Given the following:
Original question: {userQuery}
SQL Query: {query}
Query Result: {result}

Did the query successfully answer the original question? If not, what needs to be fixed?
Return ONLY "SUCCESS" if the query worked well, or a brief explanation of what needs to be fixed if it didn't.`;

  const prompt = PromptTemplate.fromTemplate(validationTemplate);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const response = await chain.invoke({
    userQuery,
    query,
    result: JSON.stringify(result),
  });

  return response.trim();
};

export const getSuggestionForError = async (error: string, userQuery: string) => {
  if (!llm) {
    throw new Error('LLM not initialized. Call initializeLLM first.');
  }

  const errorTemplate = `You are a PostgreSQL expert. Given the following error and the user's original query, 
explain what went wrong and suggest how to fix it. Be concise but helpful.

Error: {error}
User's Question: {userQuery}

Provide a clear explanation of the error and how to resolve it.`;

  const prompt = PromptTemplate.fromTemplate(errorTemplate);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const response = await chain.invoke({
    error,
    userQuery,
  });

  return response.trim();
};

export async function generateLLMResponse(prompt: string, llmConfig: any): Promise<string> {
  const systemPrompt = `You are a database query analyzer. Your role is to analyze natural language queries,
understand their intent, and identify if they need previous context. Respond in JSON format as specified in the prompt.
Be precise and concise in your analysis.`;

  try {
    const response = await callLLM(systemPrompt, prompt, llmConfig);
    return response;
  } catch (error) {
    console.error('Error generating LLM response:', error);
    throw error;
  }
} 