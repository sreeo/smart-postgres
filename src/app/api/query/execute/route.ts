import { NextResponse } from 'next/server';
import { executeQuery, initializeDatabase } from '@/lib/db';
import { initializeLLM, validateQueryResult, getSuggestionForError } from '@/lib/llm';

const PAGE_SIZE = 50;

export async function POST(request: Request) {
  try {
    const { query, dbConfig, page = 1 } = await request.json();
    const pool = await initializeDatabase(dbConfig);

    // Get total count
    const countQuery = `WITH query AS (${query}) SELECT COUNT(*) as total FROM query`;
    const countResult = await pool.query(countQuery);
    const total = parseInt(countResult.rows[0].total);

    // Add pagination to the query
    const paginatedQuery = `WITH query AS (${query}) 
      SELECT * FROM query 
      LIMIT ${PAGE_SIZE} 
      OFFSET ${(page - 1) * PAGE_SIZE}`;

    const result = await pool.query(paginatedQuery);

    return NextResponse.json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
        hasMore: page * PAGE_SIZE < total
      }
    });
  } catch (error: any) {
    console.error('Error executing query:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
} 