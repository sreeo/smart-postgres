import { NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/db';
import { DatabaseSchema } from '@/types/schema';

export async function POST(request: Request) {
  try {
    const { dbConfig } = await request.json();
    const pool = await initializeDatabase(dbConfig);

    const schemaQuery = `
      WITH RECURSIVE table_columns AS (
        SELECT 
          t.table_name,
          jsonb_agg(
            jsonb_build_object(
              'name', c.column_name,
              'type', c.udt_name,
              'nullable', c.is_nullable = 'YES',
              'description', pd.description,
              'default', c.column_default,
              'isPrimary', EXISTS (
                SELECT 1 FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu 
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                  AND tc.table_name = kcu.table_name
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_schema = 'public'
                  AND tc.table_name = t.table_name
                  AND kcu.column_name = c.column_name
              )
            ) ORDER BY c.ordinal_position
          ) as columns
        FROM information_schema.tables t
        JOIN information_schema.columns c 
          ON c.table_name = t.table_name 
          AND c.table_schema = t.table_schema
        LEFT JOIN pg_catalog.pg_statio_all_tables st 
          ON st.schemaname = t.table_schema 
          AND st.relname = t.table_name
        LEFT JOIN pg_catalog.pg_description pd
          ON pd.objoid = st.relid
          AND pd.objsubid = c.ordinal_position
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
        GROUP BY t.table_name
      ),
      foreign_keys AS (
        SELECT
          tc.table_name,
          jsonb_agg(
            jsonb_build_object(
              'column', kcu.column_name,
              'referencedTable', ccu.table_name,
              'referencedColumn', ccu.column_name,
              'onDelete', rc.delete_rule,
              'onUpdate', rc.update_rule
            )
          ) as foreign_keys
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
        GROUP BY tc.table_name
      ),
      table_indexes AS (
        SELECT 
          c.relname as tablename,
          jsonb_agg(
            jsonb_build_object(
              'name', i.relname,
              'isUnique', ix.indisunique,
              'isPrimary', ix.indisprimary,
              'definition', pg_get_indexdef(i.oid),
              'isValid', ix.indisvalid,
              'indexType', am.amname
            )
          ) as indexes
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_index ix ON ix.indrelid = c.oid
        JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
        JOIN pg_catalog.pg_am am ON am.oid = i.relam
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname = 'public'
        GROUP BY c.relname
      ),
      table_constraints AS (
        SELECT 
          tc.table_name,
          jsonb_agg(
            jsonb_build_object(
              'name', tc.constraint_name,
              'type', tc.constraint_type,
              'definition', CASE 
                WHEN tc.constraint_type = 'CHECK' THEN pg_get_constraintdef(pgc.oid)
                WHEN tc.constraint_type = 'UNIQUE' THEN pg_get_constraintdef(pgc.oid)
                ELSE NULL
              END
            )
          ) as constraints
        FROM information_schema.table_constraints tc
        LEFT JOIN pg_catalog.pg_constraint pgc 
          ON pgc.conname = tc.constraint_name
          AND pgc.connamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = tc.table_schema)
        WHERE tc.table_schema = 'public'
          AND tc.constraint_type NOT IN ('PRIMARY KEY', 'FOREIGN KEY')
        GROUP BY tc.table_name
      ),
      table_stats AS (
        SELECT
          c.relname as table_name,
          jsonb_build_object(
            'totalRows', COALESCE(s.n_live_tup, 0),
            'sizeInBytes', pg_total_relation_size(c.oid),
            'lastVacuum', s.last_vacuum,
            'lastAutoVacuum', s.last_autovacuum,
            'lastAnalyze', s.last_analyze,
            'lastAutoAnalyze', s.last_autoanalyze,
            'modificationsSinceAnalyze', s.n_mod_since_analyze
          ) as stats
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_catalog.pg_stat_user_tables s ON s.relid = c.oid
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
      )
      SELECT 
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'name', tc.table_name,
              'columns', tc.columns,
              'foreignKeys', COALESCE(fk.foreign_keys, '[]'::jsonb),
              'indexes', COALESCE(ti.indexes, '[]'::jsonb),
              'constraints', COALESCE(tcon.constraints, '[]'::jsonb),
              'statistics', COALESCE(ts.stats, '{}'::jsonb)
            )
          ),
          '[]'::jsonb
        ) as schema
      FROM table_columns tc
      LEFT JOIN foreign_keys fk ON fk.table_name = tc.table_name
      LEFT JOIN table_indexes ti ON ti.tablename = tc.table_name
      LEFT JOIN table_constraints tcon ON tcon.table_name = tc.table_name
      LEFT JOIN table_stats ts ON ts.table_name = tc.table_name;
    `;

    const result = await pool.query(schemaQuery);
    const schema: DatabaseSchema = {
      tables: result.rows[0].schema || []
    };

    return NextResponse.json({
      success: true,
      schema,
    });
  } catch (error: any) {
    console.error('Error fetching database schema:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      schema: { tables: [] },
    }, { status: 500 });
  }
} 