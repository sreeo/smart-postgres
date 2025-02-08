import { NextResponse } from 'next/server';
import { getDatabaseSchema, initializeDatabase } from '@/lib/db';
import { generateSQLQuery, initializeLLM } from '@/lib/llm';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, dbConfig, openAIKey } = body;

    // Initialize services if not already initialized
    await initializeDatabase(dbConfig);
    initializeLLM(openAIKey);

    try {
      // Get database schema
      const schema = await getDatabaseSchema();

      // Generate SQL query from natural language
      const sqlQuery = await generateSQLQuery(schema, query);

      return NextResponse.json({
        success: true,
        query: sqlQuery,
      });
    } catch (error: any) {
      // Get suggestion from LLM for the error
      return NextResponse.json({
        success: false,
        error: error.message,
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