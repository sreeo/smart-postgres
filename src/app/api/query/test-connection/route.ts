import { NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { dbConfig } = await request.json();

    // Attempt to initialize database connection
    await initializeDatabase(dbConfig);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // Return a more user-friendly error message
    let errorMessage = error.message;
    
    // Handle common Postgres error codes
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Could not connect to the database server. Please check if the host and port are correct and the server is running.';
    } else if (error.code === '28P01') {
      errorMessage = 'Authentication failed. Please check your username and password.';
    } else if (error.code === '3D000') {
      errorMessage = 'Database does not exist. Please check the database name.';
    }

    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 400 });
  }
} 