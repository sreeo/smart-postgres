import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db-client';

export async function POST(request: Request) {
  try {
    const { query, dbConfig, page = 1 } = await request.json();

    const result = await executeQuery(dbConfig, query, page);

    return NextResponse.json({
      success: true,
      data: result.rows,
      pagination: result.pagination
    });
  } catch (error: any) {
    console.error('Error executing query:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
} 