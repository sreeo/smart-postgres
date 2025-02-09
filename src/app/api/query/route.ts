import { NextResponse } from 'next/server';
import { executeQuery, getSchema } from '@/lib/db-client';
import { 
  generateSQLQuery, 
  initializeLLM, 
  validateQueryResult, 
  getSuggestionForError,
  analyzeQueryType,
  generateSchemaExplanation,
  identifyRequiredInputs
} from '@/lib/llm';

export async function POST(request: Request) {
  try {
    console.log('\n=== Starting API Request ===');
    const body = await request.json();
    console.log('Request body:', {
      query: body.query,
      hasDbConfig: !!body.dbConfig,
      hasLlmConfig: !!body.llmConfig,
      hasInputs: !!body.inputs,
      hasContext: !!body.context
    });

    const { query, dbConfig, llmConfig, inputs, context } = body;

    try {
      initializeLLM(llmConfig);
    } catch (error) {
      console.error('LLM initialization error:', error);
      throw error;
    }

    try {
      // Get database schema
      console.log('Fetching database schema...');
      const schema = await getSchema(dbConfig);
      console.log('Schema fetched successfully');

      // Log context if available
      if (context) {
        console.log('Using context:', context);
      }

      // Analyze the query type
      console.log('Analyzing query type...');
      const queryType = await analyzeQueryType(schema, query, context);
      console.log('Query type:', queryType);

      if (queryType === 'NEEDS_EXPLANATION') {
        console.log('Generating schema explanation...');
        const explanation = await generateSchemaExplanation(schema, query);
        return NextResponse.json({
          success: true,
          type: 'explanation',
          explanation,
        });
      } else if (queryType === 'NEEDS_INPUT' && !inputs) {
        console.log('Identifying required inputs...');
        const requiredInputs = await identifyRequiredInputs(schema, query, context);
        console.log('Required inputs:', requiredInputs);
        return NextResponse.json({
          success: true,
          type: 'input_required',
          requiredInputs,
        });
      } else {
        console.log('Generating SQL query...');
        const sqlQuery = await generateSQLQuery(schema, query, inputs, context);
        console.log('Generated SQL:', sqlQuery);

        if (sqlQuery.startsWith('ERROR:')) {
          console.log('SQL generation error:', sqlQuery);
          throw new Error(sqlQuery);
        }

        console.log('Executing query...');
        const result = await executeQuery(dbConfig, sqlQuery);
        console.log('Query executed successfully');

        console.log('Validating result...');
        const validation = await validateQueryResult(sqlQuery, result.rows, query);
        console.log('Validation result:', validation);

        return NextResponse.json({
          success: true,
          type: 'query',
          query: sqlQuery,
          result: result.rows,
          validation,
        });
      }
    } catch (error: any) {
      console.error('Error in query processing:', error);
      // Get suggestion from LLM for the error
      const suggestion = await getSuggestionForError(error.message, query);
      console.log('Error suggestion:', suggestion);
      
      return NextResponse.json({
        success: false,
        error: error.message,
        suggestion,
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  } finally {
    console.log('=== API Request Complete ===\n');
  }
} 