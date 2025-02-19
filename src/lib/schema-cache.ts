import { DatabaseSchema } from '@/types/schema';

interface SchemaCache {
  [key: string]: {
    schema: DatabaseSchema;
    timestamp: number;
    expiresAt: number;
  };
}

const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const schemaCache: SchemaCache = {};

function getCacheKey(dbConfig: any): string {
  // Create a unique key based on connection details
  return `${dbConfig.host}:${dbConfig.port}/${dbConfig.database}/${dbConfig.user}`;
}

export function getCachedSchema(dbConfig: any): DatabaseSchema | null {
  const key = getCacheKey(dbConfig);
  const cached = schemaCache[key];
  
  if (!cached) return null;
  
  // Check if cache has expired
  if (Date.now() > cached.expiresAt) {
    delete schemaCache[key];
    return null;
  }
  
  return cached.schema;
}

export function cacheSchema(dbConfig: any, schema: DatabaseSchema): void {
  const key = getCacheKey(dbConfig);
  const now = Date.now();
  
  schemaCache[key] = {
    schema,
    timestamp: now,
    expiresAt: now + CACHE_EXPIRY_MS
  };
}

export function invalidateCache(dbConfig: any): void {
  const key = getCacheKey(dbConfig);
  delete schemaCache[key];
}
