import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

export interface DatabaseConfig extends PoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export const initializeDatabase = async (config: DatabaseConfig) => {
  pool = new Pool(config);
  
  // Test connection and set read-only mode
  try {
    const client = await pool.connect();
    try {
      // Set session to read-only mode
      await client.query('SET default_transaction_read_only = on;');
      // Additional safety: Set statement timeout to 30 seconds
      await client.query('SET statement_timeout = 30000;');
      return pool;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

export const getPool = () => {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return pool;
};

export const getDatabaseSchema = async () => {
  const pool = getPool();
  const tableQuery = `
    SELECT 
      t.table_name,
      array_agg(
        json_build_object(
          'column_name', c.column_name,
          'data_type', c.data_type,
          'is_nullable', c.is_nullable,
          'column_default', c.column_default
        )
      ) as columns
    FROM 
      information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name
    WHERE 
      t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    GROUP BY 
      t.table_name;
  `;

  const result = await pool.query(tableQuery);
  return result.rows;
};

export const executeQuery = async (query: string, params?: any[]) => {
  const pool = getPool();
  try {
    console.log('\n=== Database Query Execution ===');
    // Strip any markdown formatting
    let cleanQuery = query;
    if (query.startsWith('```')) {
      cleanQuery = query
        .replace(/^```(\w+)?\n/, '') // Remove opening ```sql or just ```
        .replace(/\n```$/, '')       // Remove closing ```
        .trim();
      console.log('Stripped markdown formatting from query');
    }

    // Log the original and cleaned query
    console.log('Original query:', query);
    console.log('Cleaned query:', cleanQuery);
    if (params) {
      console.log('Parameters:', params);
    }

    // Normalize query for checking
    const normalizedQuery = cleanQuery.trim().toLowerCase();
    console.log('Normalized query:', normalizedQuery);
    
    // List of disallowed operation keywords
    const writeOperations = [
      'delete',
      'insert',
      'update',
      'truncate',
      'create',
      'alter',
      'drop',
      'grant',
      'revoke',
      'lock',
      'vacuum',
      'copy',
      'refresh materialized view',
      'merge',
      'call',
      'do'
    ];

    // Check if query starts with any write operation
    // Also check for CTEs that might contain write operations
    console.log('Checking for write operations...');
    const hasWriteOperation = writeOperations.some(op => {
      // Check at the start of the query
      if (normalizedQuery.startsWith(op + ' ')) {
        console.log(`Found write operation at start: ${op}`);
        return true;
      }
      
      // Check after WITH keyword for CTEs
      const withIndex = normalizedQuery.indexOf('with ');
      if (withIndex !== -1) {
        console.log('Found WITH clause, checking CTEs...');
        const afterWith = normalizedQuery.slice(withIndex + 5);
        // Look for write operations after each CTE name declaration
        const cteMatches = afterWith.match(/\w+\s*(?:\(.*?\))?\s*as\s*\(/g);
        if (cteMatches) {
          return cteMatches.some(cte => {
            const cteContent = afterWith.slice(afterWith.indexOf(cte) + cte.length);
            const hasWriteOp = writeOperations.some(wop => cteContent.trim().startsWith(wop + ' '));
            if (hasWriteOp) {
              console.log(`Found write operation in CTE: ${cte}`);
            }
            return hasWriteOp;
          });
        }
      }
      return false;
    });

    if (hasWriteOperation) {
      console.log('Query rejected: Contains write operation');
      throw new Error('Write operations are not allowed in read-only mode. Only SELECT and read-only operations are permitted.');
    }

    console.log('Executing query on database...');
    const result = await pool.query(cleanQuery, params);
    console.log('Query executed successfully');
    console.log(`Returned ${result.rows.length} rows`);
    return result;
  } catch (error: any) {
    console.error('Database Error:', {
      message: error.message,
      code: error.code,
      position: error.position,
      detail: error.detail,
      hint: error.hint,
      where: error.where
    });
    throw error;
  } finally {
    console.log('=== Database Query Complete ===\n');
  }
}; 