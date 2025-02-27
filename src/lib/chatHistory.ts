import { QueryResult } from '../components/QueryInterface';

const HISTORY_PREFIX = 'smart_postgres_chat_history_';

interface ChatHistoryData {
  database: string;
  history: QueryResult[];
  exportedAt: string;
}

/**
 * Get the storage key for a specific database's chat history
 */
function getStorageKey(databaseName: string): string {
  // Sanitize database name to create a valid storage key
  const sanitizedName = databaseName.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${HISTORY_PREFIX}${sanitizedName}`;
}

/**
 * Save chat history to localStorage
 */
export function saveHistory(databaseName: string, history: QueryResult[]): void {
  try {
    const key = getStorageKey(databaseName);
    localStorage.setItem(key, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save chat history:', error);
  }
}

/**
 * Load chat history from localStorage
 */
export function loadHistory(databaseName: string): QueryResult[] {
  try {
    const key = getStorageKey(databaseName);
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load chat history:', error);
  }
  return [];
}

/**
 * Clear chat history from localStorage
 */
export function clearHistory(databaseName: string): void {
  try {
    const key = getStorageKey(databaseName);
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to clear chat history:', error);
  }
}

/**
 * Export chat history to a JSON file
 */
export function exportHistory(databaseName: string, history: QueryResult[]): void {
  try {
    const exportData: ChatHistoryData = {
      database: databaseName,
      history: history,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `chat_history_${databaseName.replace(/[^a-zA-Z0-9-_]/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export chat history:', error);
  }
}

/**
 * Import chat history from a JSON file
 * @returns A promise that resolves to the imported history or null if import failed
 */
export function importHistory(file: File): Promise<ChatHistoryData | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content) as ChatHistoryData;
          
          // Validate the imported data structure
          if (!data.database || !Array.isArray(data.history) || !data.exportedAt) {
            console.error('Invalid chat history file format');
            resolve(null);
            return;
          }
          
          resolve(data);
        } catch (error) {
          console.error('Failed to parse chat history file:', error);
          resolve(null);
        }
      };
      
      reader.onerror = () => {
        console.error('Failed to read chat history file');
        resolve(null);
      };
      
      reader.readAsText(file);
    } catch (error) {
      console.error('Failed to import chat history:', error);
      resolve(null);
    }
  });
}
