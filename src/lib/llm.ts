import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { DatabaseSchema, Table } from '@/types/schema';
import { LLMConfig, getConfig, llmConfigSchema } from '@/config/llm';

let llm: ChatOpenAI | ChatOllama;

export const initializeLLM = (userConfig: LLMConfig) => {
  // Validate and merge with defaults
  const config = getConfig(llmConfigSchema.parse(userConfig));

  if (config.provider === 'openrouter' || config.provider === 'openai-compatible') {
    llm = new ChatOpenAI({
      openAIApiKey: config.apiKey,
      modelName: config.model,
      configuration: {
        baseURL: config.baseUrl,
        defaultHeaders: config.defaultHeaders,
        organization: config.organization,
      },
      temperature: 0,
    });
  } else {
    llm = new ChatOllama({
      baseUrl: config.baseUrl,
      model: config.model,
      temperature: 0,
    });
  }
};

const analyzeQueryTemplate = `You are a PostgreSQL expert. Given the following database schema, natural language query, and context, 
determine if this requires:
1. A SQL query to fetch data
2. A natural language explanation about the database structure
3. Additional user input before generating SQL

For queries about PostgreSQL monitoring, performance, or administration:
   - You can use system catalogs (pg_*) and views even if not in the schema
   - Common monitoring views include:
     * pg_stat_activity: For current session/query information
     * pg_locks: For lock information
     * pg_stat_statements: For query performance statistics
     * pg_stat_database: For database-wide statistics
   - Check that necessary extensions (e.g., pg_stat_statements) are enabled
  Try returning a query first, and only if that fails, provide an explanation.

IMPORTANT: If the query involves ANY of these, it ALWAYS requires user input:
- Specific dates or date ranges
- Specific IDs or values to filter by
- Thresholds or limits (e.g., "more than X", "at least Y")
- Time periods (e.g., "last 7 days", "this month")

Database Schema:
{schema}

User Query: {query}

Previous Context:
{context}

Respond with ONLY "NEEDS_QUERY", "NEEDS_EXPLANATION", or "NEEDS_INPUT".`;

export const analyzeQueryType = async (
  schema: DatabaseSchema, 
  query: string,
  context?: string | null
): Promise<'NEEDS_EXPLANATION' | 'NEEDS_INPUT' | 'READY'> => {
  if (!llm) {
    throw new Error('LLM not initialized. Call initializeLLM first.');
  }

  const prompt = PromptTemplate.fromTemplate(analyzeQueryTemplate);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const schemaString = schema.tables.map((table: Table) => {
    return `Table: ${table.name}\nColumns: ${table.columns.map(col => 
      `${col.name} (${col.type})`).join(', ')}\n`;
  }).join('\n');

  const response = await chain.invoke({
    schema: schemaString,
    query: query,
    context: context || 'No previous context available.',
  });

  return response.trim() as 'NEEDS_EXPLANATION' | 'NEEDS_INPUT' | 'READY';
};

const identifyInputsTemplate = `You are a PostgreSQL expert. Given the following database schema, natural language query, and context,
identify what additional inputs are needed from the user to generate a complete SQL query.

IMPORTANT: ALWAYS identify inputs for:
- Any specific dates or date ranges mentioned
- Any specific IDs or values used for filtering
- Any thresholds or limits (e.g., "more than X", "at least Y")
- Any time periods (e.g., "last 7 days", "this month")

Database Schema:
{schema}

User Query: {query}

Previous Context:
{context}

RULES:
1. Return a valid JSON array of required inputs
2. Each input must have: name, description, type, and example
3. Use descriptive names (e.g., "start_date", "user_id", "min_amount")
4. Type must be one of: "text", "number", "date"
5. Return an empty array [] if no inputs are needed
6. DO NOT include comments or explanations in the JSON`;

export const identifyRequiredInputs = async (
  schema: DatabaseSchema, 
  query: string,
  context?: string | null
): Promise<any[]> => {
  if (!llm) {
    throw new Error('LLM not initialized. Call initializeLLM first.');
  }

  const prompt = PromptTemplate.fromTemplate(identifyInputsTemplate);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const schemaString = schema.tables.map((table: Table) => {
    return `Table: ${table.name}\nColumns: ${table.columns.map(col => 
      `${col.name} (${col.type})`).join(', ')}\n`;
  }).join('\n');

  try {
    const response = await chain.invoke({
      schema: schemaString,
      query: query,
      context: context || 'No previous context available.',
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
    throw error;
  }
};

const sqlGenerationTemplate = `You are a PostgreSQL expert. Given the following database schema, natural language query, user inputs, and context, 
generate a PostgreSQL query that answers the question.

IMPORTANT RULES:
1. NEVER use placeholder values like 'your_specific_date', 'your_id', etc.
2. ALWAYS use the provided user inputs for specific values
3. If a required input is missing, generate an error message instead of a query
4. Return ONLY the raw SQL query with no formatting, quotes, backticks, or markdown
5. Use the context from previous queries to understand what the user is asking about
6. For queries about PostgreSQL monitoring, performance, or administration:
   - You can use system catalogs (pg_*) and views even if not in the schema
   - Common monitoring views include:
     * pg_stat_activity: For current session/query information
     * pg_locks: For lock information
     * pg_stat_statements: For query performance statistics
     * pg_stat_database: For database-wide statistics
   - Check that necessary extensions (e.g., pg_stat_statements) are enabled

Database Schema:
{schema}

User Query: {query}

User Inputs: {inputs}

Previous Context:
{context}

The response should be a valid PostgreSQL query with no additional formatting or explanation.
If any required inputs are missing, respond with "ERROR: Missing required input: <input description>"`;

export const generateSQLQuery = async (
  schema: DatabaseSchema, 
  query: string, 
  inputs?: any,
  context?: string | null
): Promise<string> => {
  if (!llm) {
    throw new Error('LLM not initialized. Call initializeLLM first.');
  }

  const prompt = PromptTemplate.fromTemplate(sqlGenerationTemplate);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const schemaString = schema.tables.map((table: Table) => {
    return `Table: ${table.name}\nColumns: ${table.columns.map(col => 
      `${col.name} (${col.type})`).join(', ')}\n`;
  }).join('\n');

  const response = await chain.invoke({
    schema: schemaString,
    query: query,
    inputs: inputs ? JSON.stringify(inputs) : 'No additional inputs provided',
    context: context || 'No previous context available.',
  });

  return response.trim();
};

const schemaExplanationTemplate = `You are a postgresql database expert. Given the following database schema and user's question,
provide a clear and concise explanation about the database structure. 
For queries about PostgreSQL monitoring, performance, or administration:
   - You can use system catalogs (pg_*) and views even if not in the schema
   - Common monitoring views include:
     * pg_stat_activity: For current session/query information
     * pg_locks: For lock information
     * pg_stat_statements: For query performance statistics
     * pg_stat_database: For database-wide statistics
   - Check that necessary extensions (e.g., pg_stat_statements) are enabled

Database Schema:
{schema}

User Question: {query}

Provide a natural language explanation that answers the user's question about the database structure.`;

export const generateSchemaExplanation = async (schema: DatabaseSchema, query: string) => {
  if (!llm) {
    throw new Error('LLM not initialized. Call initializeLLM first.');
  }

  const prompt = PromptTemplate.fromTemplate(schemaExplanationTemplate);
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const schemaString = schema.tables.map(table => {
    return `Table: ${table.name}\nColumns: ${table.columns.map(col => 
      `${col.name} (${col.type})`).join(', ')}\n`;
  }).join('\n');

  const response = await chain.invoke({
    schema: schemaString,
    query: query,
  });

  return response.trim();
};

export const validateQueryResult = async (query: string, result: any, userQuery: string) => {
  try {
    if (!llm) {
      console.warn('LLM not initialized in validateQueryResult, skipping validation');
      return 'SUCCESS';
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
      result: JSON.stringify(result || []),
    });

    return response.trim() || 'SUCCESS';
  } catch (error) {
    console.error('Error in validateQueryResult:', error);
    return 'SUCCESS'; // Default to success if validation fails
  }
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