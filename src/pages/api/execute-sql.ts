import { NextApiRequest, NextApiResponse } from 'next';
import { Client } from 'pg';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, dbConfig } = req.body;

  if (!query || !dbConfig) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const client = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    ssl: dbConfig.ssl ? {
      rejectUnauthorized: false
    } : undefined
  });

  try {
    await client.connect();
    const startTime = new Date();
    const result = await client.query(query);
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    return res.status(200).json({
      success: true,
      data: result.rows,
      rowCount: result.rowCount,
      timing: {
        startTime: startTime.toISOString(),
        duration: duration
      }
    });
  } catch (error: any) {
    console.error('Database query error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    await client.end();
  }
}
