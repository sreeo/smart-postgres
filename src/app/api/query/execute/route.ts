import { NextResponse } from 'next/server';
import { executeQuery, initializeDatabase } from '@/lib/db';
import { initializeLLM, validateQueryResult, getSuggestionForError } from '@/lib/llm';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, dbConfig, openAIKey } = body;

    // Initialize services if not already initialized
    await initializeDatabase(dbConfig);
    initializeLLM(openAIKey);

    try {
      // Execute the query
      const result = await executeQuery(query);

      // Validate the result
      const validation = await validateQueryResult(query, result.rows, query);

      return NextResponse.json({
        success: true,
        result: result.rows,
        validation,
      });
    } catch (error: any) {
      // Get suggestion from LLM for the error
      const suggestion = await getSuggestionForError(error.message, query);
      
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
  }
} 