import { useState, useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import SchemaViewer from './SchemaViewer';
import TruncatedText from './TruncatedText';
import { fetchOpenRouterModels, getModelDisplayName, OpenRouterModel } from '../lib/openrouter';
import { loadHistory, saveHistory, clearHistory, exportHistory, importHistory } from '../lib/chatHistory';

// Form Configuration
const FORM_CONFIG = {
  PROVIDERS: {
    OPENROUTER: 'openrouter',
    OLLAMA: 'ollama',
    OPENAI_COMPATIBLE: 'openai-compatible',
  },
  PROVIDER_LABELS: {
    OPENROUTER: 'OpenRouter (Claude, GPT-4)',
    OLLAMA: 'Ollama (Local Models)',
    OPENAI_COMPATIBLE: 'Custom OpenAI-Compatible',
  },
  PLACEHOLDERS: {
    OLLAMA_URL: 'http://localhost:11434',
    OPENAI_URL: 'https://api.example.com/v1',
    OLLAMA_MODEL: 'codellama:7b-instruct',
    OPENAI_MODEL: 'gpt-3.5-turbo',
    CUSTOM_HEADERS: '{"X-Custom-Header": "value"}',
  },
} as const;

interface QueryInterfaceProps {
  config: {
    dbConfig: any;
    llmConfig: {
      provider: 'openrouter' | 'ollama' | 'openai-compatible';
      apiKey: string;
      baseUrl?: string;
      model?: string;
      organization?: string;
      defaultHeaders?: Record<string, string>;
    };
  };
  onDisconnect: () => void;
}

interface QueryResult {
  type: 'query' | 'explanation';
  naturalQuery: string;
  sqlQuery?: string;
  result?: any[];
  validation?: string;
  explanation?: string;
  error?: {
    message: string;
    suggestion?: string;
  };
  pagination?: PaginationState;
  timing?: {
    startTime: string;
    duration: number;
  };
}

interface RequiredInput {
  name: string;
  description: string;
  type: 'text' | 'number' | 'date';
  example: string;
}

interface PendingQuery {
  query: string;
  inputs: RequiredInput[];
}

interface DatabaseSchema {
  tables: {
    name: string;
    columns: {
      name: string;
      type: string;
      nullable: boolean;
      description?: string;
      default?: string;
      isPrimary: boolean;
    }[];
    foreignKeys?: {
      column: string;
      referencedTable: string;
      referencedColumn: string;
      onDelete: string;
      onUpdate: string;
    }[];
    indexes?: {
      name: string;
      isUnique: boolean;
      definition: string;
    }[];
    constraints?: {
      name: string;
      type: string;
      definition: string;
    }[];
    statistics?: {
      totalRows: number;
      sizeInBytes: number;
      lastVacuum?: string;
      lastAutoVacuum?: string;
    };
  }[];
}

interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export default function QueryInterface({ config, onDisconnect }: QueryInterfaceProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QueryResult[]>([]);
  
  // Load history on component mount (client-side only)
  useEffect(() => {
    const loadSavedHistory = () => {
      if (typeof window !== 'undefined' && config.dbConfig?.database) {
        try {
          const savedHistory = loadHistory(config.dbConfig.database);
          if (savedHistory && savedHistory.length > 0) {
            setHistory(savedHistory);
          }
        } catch (error) {
          console.error('Error loading history:', error);
        }
      }
    };
    loadSavedHistory();
  }, [config.dbConfig?.database]);

  // Save history whenever it changes
  useEffect(() => {
    const saveCurrentHistory = () => {
      if (typeof window !== 'undefined' && config.dbConfig?.database) {
        try {
          saveHistory(config.dbConfig.database, history);
        } catch (error) {
          console.error('Error saving history:', error);
        }
      }
    };
    saveCurrentHistory();
  }, [history, config.dbConfig?.database]);
  const [availableModels, setAvailableModels] = useState<OpenRouterModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<PendingQuery | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [llmConfig, setLlmConfig] = useState(config.llmConfig);
  const [showLLMConfig, setShowLLMConfig] = useState(false);
  const [dbSchema, setDbSchema] = useState<DatabaseSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState | null>(null);
  const [showSchemaViewer, setShowSchemaViewer] = useState(false);
  const [useContext, setUseContext] = useState(false);
  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const fetchSchema = async () => {
    setSchemaLoading(true);
    try {
      const response = await fetch('/api/query/schema', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dbConfig: config.dbConfig,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setDbSchema(data.schema);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Failed to fetch database schema:', error);
      setHistory(prev => [{
        type: 'explanation',
        naturalQuery: 'Fetching database schema',
        error: {
          message: 'Failed to fetch database schema. Some functionality might be limited.',
          suggestion: 'Please check your database connection or try reconnecting.',
        },
      }, ...prev]);
    } finally {
      setSchemaLoading(false);
    }
  };

  useEffect(() => {
    fetchSchema();
    if (llmConfig.provider === 'openrouter' && llmConfig.apiKey) {
      fetchModels(llmConfig.apiKey);
    }
  }, [config.dbConfig]);

  useEffect(() => {
    if (llmConfig.provider === 'openrouter' && llmConfig.apiKey) {
      fetchModels(llmConfig.apiKey);
    }
  }, [llmConfig.provider, llmConfig.apiKey]);

  const fetchModels = async (apiKey: string) => {
    if (!apiKey) return;
    setLoadingModels(true);
    try {
      const models = await fetchOpenRouterModels(apiKey);
      setAvailableModels(models);
    } catch (error) {
      console.error('Error fetching models:', error);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (resultsContainerRef.current) {
      resultsContainerRef.current.scrollTop = resultsContainerRef.current.scrollHeight;
    }
  }, [history]);

  const getQueryContext = () => {
    if (!history.length) return null;
    
    const lastQuery = history[history.length - 1];
    if (!lastQuery) return null;

    let context = `Previous query: "${lastQuery.naturalQuery}"\n`;
    
    if (lastQuery.type === 'query') {
      if (lastQuery.sqlQuery) {
        context += `SQL used: ${lastQuery.sqlQuery}\n`;
        
        if (lastQuery.result && lastQuery.result.length > 0) {
          const resultSummary = lastQuery.result.length === 1 
            ? JSON.stringify(lastQuery.result[0])
            : `${lastQuery.result.length} rows, first row: ${JSON.stringify(lastQuery.result[0])}`;
          context += `Result: ${resultSummary}`;
        }
      }
    } else if (lastQuery.type === 'explanation') {
      context += `Explanation: ${lastQuery.explanation}`;
    }

    return context;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    const startTime = new Date();
    try {
      const contextInfo = useContext ? getQueryContext() : null;
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          dbConfig: config.dbConfig,
          llmConfig,
          dbSchema,
          page: currentPage,
          context: contextInfo,
        }),
      });

      const data = await response.json();
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      if (!data.success) {
        setHistory(prev => [...prev, {
          type: 'query',
          naturalQuery: query,
          result: [],
          validation: 'ERROR',
          error: {
            message: data.error,
            suggestion: data.suggestion,
          },
          timing: {
            startTime: startTime.toISOString(),
            duration: duration
          }
        }]);
        return;
      }

      if (data.type === 'input_required') {
        setPendingQuery({
          query: query,
          inputs: data.requiredInputs,
        });
        setInputValues({});
      } else {
        setHistory(prev => [...prev, {
          type: data.type,
          naturalQuery: query,
          ...(data.type === 'query' ? {
            sqlQuery: data.query,
            result: data.result,
            validation: data.validation,
            pagination: data.pagination,
          } : {
            explanation: data.explanation,
          }),
          timing: {
            startTime: startTime.toISOString(),
            duration: duration
          }
        }]);
        setPagination(data.pagination);
        setQuery('');
      }
    } catch (error: any) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      setHistory(prev => [...prev, {
        type: 'query',
        naturalQuery: query,
        result: [],
        validation: 'ERROR',
        error: {
          message: error.message,
        },
        timing: {
          startTime: startTime.toISOString(),
          duration: duration
        }
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (name: string, value: string) => {
    setInputValues(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingQuery) return;

    setLoading(true);
    try {
      // Validate all required inputs are provided
      const missingInputs = pendingQuery.inputs.filter(
        input => !inputValues[input.name] || inputValues[input.name].trim() === ''
      );

      if (missingInputs.length > 0) {
        throw new Error(`Please provide values for: ${missingInputs.map(i => i.description).join(', ')}`);
      }

      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: pendingQuery.query,
          inputs: inputValues,
          dbConfig: config.dbConfig,
          llmConfig,
          dbSchema,
        }),
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error);
      }

      setHistory(prev => [...prev, {
        type: data.type,
        naturalQuery: pendingQuery.query,
        sqlQuery: data.query,
        result: data.result,
        validation: data.validation,
      }]);
      setPendingQuery(null);
      setInputValues({});
      setQuery('');
    } catch (error: any) {
      setHistory(prev => [...prev, {
        type: 'query',
        naturalQuery: pendingQuery.query,
        result: [],
        validation: 'ERROR',
        error: {
          message: error.message,
          suggestion: error.suggestion,
        },
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelInput = () => {
    setPendingQuery(null);
    setInputValues({});
  };

  const downloadCSV = (result: any[]) => {
    if (!result || result.length === 0) return;

    // Get headers from the first row
    const headers = Object.keys(result[0]);
    
    // Convert data to CSV format
    const csvContent = [
      headers.join(','), // Header row
      ...result.map(row => 
        headers.map(header => {
          const value = row[header];
          // Handle special cases (null, undefined, objects)
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') return JSON.stringify(value);
          // Escape quotes and wrap in quotes if contains comma
          const stringValue = String(value);
          if (stringValue.includes(',') || stringValue.includes('"')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      )
    ].join('\n');

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'query_result.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fallbackCopyText = (text: string) => {
    // Create temporary textarea
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }

    document.body.removeChild(textArea);
  };

  const handleLLMConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setLlmConfig(prev => {
      // If changing provider, handle provider-specific defaults
      if (name === 'provider') {
        const newConfig = {
          ...prev,
          [name]: value,
          // Clear fields that don't apply to the new provider
          baseUrl: '',
          organization: '',
          model: '',
        };

        // Set provider-specific defaults
        if (value === 'openrouter') {
          newConfig.model = config.llmConfig.model || '';
        } else if (value === 'ollama') {
          newConfig.baseUrl = FORM_CONFIG.PLACEHOLDERS.OLLAMA_URL;
          newConfig.model = FORM_CONFIG.PLACEHOLDERS.OLLAMA_MODEL;
        } else if (value === 'openai-compatible') {
          newConfig.model = FORM_CONFIG.PLACEHOLDERS.OPENAI_MODEL;
        }

        return newConfig;
      }

      return {
        ...prev,
        [name]: value,
      };
    });
  };

  const handlePageChange = async (page: number) => {
    if (!pagination) return;
    
    setCurrentPage(page);
    setLoading(true);
    
    try {
      const response = await fetch('/api/query/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: history[history.length - 1].sqlQuery,
          dbConfig: config.dbConfig,
          page,
        }),
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error);
      }

      // Update the last history item with new results
      setHistory(prev => {
        const newHistory = [...prev];
        const lastItem = newHistory[newHistory.length - 1];
        if (lastItem && lastItem.type === 'query') {
          lastItem.result = data.data;
          lastItem.pagination = data.pagination;
        }
        return newHistory;
      });
      setPagination(data.pagination);
    } catch (error: any) {
      console.error('Error fetching page:', error);
    } finally {
      setLoading(false);
    }
  };

  // Update context summary when useContext changes or history updates
  useEffect(() => {
    if (useContext) {
      const context = getQueryContext();
      setContextSummary(context);
    } else {
      setContextSummary(null);
    }
  }, [useContext, history]);

  return (
    <div className={`flex flex-col h-full ${theme === 'dark' ? 'dark' : ''}`}>
      <div className="border-b sticky top-0 bg-white dark:bg-gray-800 z-10">
        <div className="p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">
              Connected to: {config.dbConfig.database}
            </h2>
            <div className="flex items-center space-x-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {config.dbConfig.user}@{config.dbConfig.host}:{config.dbConfig.port}
              </p>
              {dbSchema && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  ({dbSchema.tables.length} tables, {dbSchema.tables.reduce((acc, table) => acc + (table.statistics?.totalRows || 0), 0).toLocaleString()} total rows)
                </p>
              )}
              {schemaLoading ? (
                <span className="text-sm text-gray-500 dark:text-gray-400">(Loading schema...)</span>
              ) : (
                <button
                  onClick={fetchSchema}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  title="Refresh database schema"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {dbSchema && (
              <button
                onClick={() => setShowSchemaViewer(true)}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                title="View database schema"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              {theme === 'dark' ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setShowLLMConfig(!showLLMConfig)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              {showLLMConfig ? 'Hide LLM Settings' : 'Show LLM Settings'}
            </button>
            <button
              onClick={onDisconnect}
              className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Disconnect
            </button>
          </div>
        </div>

        {showLLMConfig && (
          <div className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="provider" className="block text-sm font-medium text-gray-900">
                  LLM Provider
                </label>
                <select
                  id="provider"
                  name="provider"
                  value={llmConfig.provider}
                  onChange={handleLLMConfigChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                >
                  <option value="openrouter">OpenRouter (Claude)</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>

              {llmConfig.provider === 'openrouter' ? (
                <>
                  <div>
                    <label htmlFor="model" className="block text-sm font-medium text-gray-900">
                      Model
                    </label>
                    {loadingModels ? (
                      <div className="mt-1 flex items-center text-sm text-gray-500">
                        <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Loading available models...
                      </div>
                    ) : (
                      <select
                        id="model"
                        name="model"
                        value={llmConfig.model || ''}
                        onChange={handleLLMConfigChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                      >
                        <option value="">Select a model</option>
                        {availableModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {getModelDisplayName(model)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label htmlFor="apiKey" className="block text-sm font-medium text-gray-900">
                      OpenRouter API Key
                    </label>
                    <input
                      type="password"
                      id="apiKey"
                      name="apiKey"
                      value={llmConfig.apiKey || ''}
                      onChange={handleLLMConfigChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                      placeholder="Enter your API key"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-900">
                      Ollama URL
                    </label>
                    <input
                      type="text"
                      id="baseUrl"
                      name="baseUrl"
                      value={llmConfig.baseUrl || 'http://localhost:11434'}
                      onChange={handleLLMConfigChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="model" className="block text-sm font-medium text-gray-900">
                      Ollama Model
                    </label>
                    <input
                      type="text"
                      id="model"
                      name="model"
                      value={llmConfig.model || 'codellama:7b-instruct'}
                      onChange={handleLLMConfigChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white dark:bg-gray-800" ref={resultsContainerRef}>
        {history.map((item, index) => (
          <div key={index} className="space-y-2">
            <div className="bg-gray-100 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <h3 className="font-mono text-sm text-gray-900">Your Question:</h3>
                {item.timing && (
                  <span className="text-xs text-gray-600">
                    {new Date(item.timing.startTime).toLocaleTimeString()} • {(item.timing.duration / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
              <p className="mt-1 text-gray-900">{item.naturalQuery}</p>
            </div>

            {item.error ? (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <h3 className="font-medium text-red-800">Error:</h3>
                <p className="mt-1 text-red-700">{item.error.message}</p>
                {item.error.suggestion && (
                  <div className="mt-3 bg-white p-3 rounded border border-red-100">
                    <h4 className="font-medium text-gray-900">Suggestion:</h4>
                    <p className="text-gray-900">{item.error.suggestion}</p>
                  </div>
                )}
              </div>
            ) : item.type === 'explanation' ? (
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-gray-900 whitespace-pre-wrap">{item.explanation}</p>
              </div>
            ) : (
              <>
                <div className="bg-gray-100 p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <h3 className="font-mono text-sm text-gray-900">Generated SQL:</h3>
                    <div className="flex space-x-2">
                    {!item.error && item.sqlQuery && (
                      <>
                        <button
                          onClick={() => {
                            const text = item.sqlQuery || '';
                            try {
                              if (navigator.clipboard && window.isSecureContext) {
                                // Use Clipboard API if available and in secure context
                                navigator.clipboard.writeText(text).then(() => {
                                  setCopiedIndex(index);
                                  setTimeout(() => setCopiedIndex(null), 2000);
                                }).catch(err => {
                                  console.error('Clipboard API failed:', err);
                                  fallbackCopyText(text);
                                });
                              } else {
                                // Fallback for browsers without Clipboard API
                                fallbackCopyText(text);
                                setCopiedIndex(index);
                                setTimeout(() => setCopiedIndex(null), 2000);
                              }
                            } catch (error) {
                              console.error('Failed to copy SQL:', error);
                            }
                          }}
                          className={`inline-flex items-center px-2 py-1 text-xs border rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${copiedIndex === index ? 'border-green-500 text-green-700 bg-green-50 hover:bg-green-100' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}
                        >
                          {copiedIndex === index ? (
                            <>
                              <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Copied!
                            </>
                          ) : (
                            <>
                              <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                      <button
                        onClick={async () => {
                          setLoading(true);
                          const startTime = new Date();
                          try {
                            const response = await fetch('/api/query/execute', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                query: item.sqlQuery,
                                dbConfig: config.dbConfig,
                                page: 1,
                              }),
                            });

                            const data = await response.json();
                            const endTime = new Date();
                            const duration = endTime.getTime() - startTime.getTime();

                            if (!data.success) {
                              throw new Error(data.error);
                            }

                            // Add the rerun result to history
                            const newHistory = [...history, {
                              type: 'query',
                              naturalQuery: `Rerun: ${item.naturalQuery}`,
                              sqlQuery: item.sqlQuery,
                              result: data.data,
                              validation: 'SUCCESS',
                              pagination: data.pagination,
                              timing: {
                                startTime: startTime.toISOString(),
                                duration: duration
                              }
                            }];
                            setHistory(newHistory);
                            // Scroll to bottom after state update
                            setTimeout(() => {
                              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                            }, 100);
                            setPagination(data.pagination);
                          } catch (error: any) {
                            const endTime = new Date();
                            const duration = endTime.getTime() - startTime.getTime();
                            const newHistory = [...history, {
                              type: 'query',
                              naturalQuery: `Rerun: ${item.naturalQuery}`,
                              sqlQuery: item.sqlQuery,
                              result: [],
                              validation: 'ERROR',
                              error: {
                                message: error.message,
                              },
                              timing: {
                                startTime: startTime.toISOString(),
                                duration: duration
                              }
                            }];
                            setHistory(newHistory);
                            // Scroll to bottom after state update
                            setTimeout(() => {
                              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                            }, 100);
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className="inline-flex items-center px-2 py-1 text-xs border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        disabled={loading}
                      >
                        <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Rerun
                      </button>
                      </>
                    )}
                    </div>
                  </div>
                  <pre className="mt-2 p-2 bg-gray-800 text-white rounded overflow-x-auto">
                    {item.sqlQuery}
                  </pre>
                </div>

                <div className="bg-white p-4 rounded-lg shadow">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-medium text-gray-900">Result:</h3>
                    {item.result && item.result.length > 0 && (
                      <button
                        onClick={() => item.result && downloadCSV(item.result)}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Download CSV
                      </button>
                    )}
                  </div>
                  {item.validation === 'ERROR' ? (
                    <div className="mt-2 p-4 bg-red-50 border border-red-200 rounded-md">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-red-800">Error executing query</h3>
                          <div className="mt-2 text-sm text-red-700">
                            <p>{item.error?.message}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : item.result && item.result.length > 0 ? (
                    <div className="mt-2 overflow-x-auto max-h-[300px]">
                      {// Check if it's an aggregate result
                      item.result.length === 1 && Object.keys(item.result[0]).length === 1 ? (
                        <div className="text-lg font-medium text-gray-900">
                          {Object.entries(item.result[0]).map(([key, value]) => (
                            <div key={key} className="flex items-center space-x-2">
                              <span className="text-gray-600">{key}:</span>
                              <TruncatedText 
                                text={
                                  value === null ? 'null' :
                                  typeof value === 'object' ? JSON.stringify(value) :
                                  typeof value === 'number' ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") :
                                  String(value)
                                } 
                                preserveNumbers={typeof value === 'number'}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              {Object.keys(item.result[0]).map((key) => (
                                <th
                                  key={key}
                                  className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider bg-gray-50"
                                >
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {item.result.map((row, rowIndex) => (
                              <tr key={rowIndex}>
                                {Object.values(row).map((value: any, cellIndex) => (
                                  <td
                                    key={cellIndex}
                                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                                  >
                                    <TruncatedText 
                                      text={
                                        value === null ? 'null' :
                                        typeof value === 'object' ? JSON.stringify(value) :
                                        typeof value === 'boolean' ? value.toString() :
                                        String(value)
                                      } 
                                      preserveNumbers={typeof value === 'number'}
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-gray-900">No results found</p>
                  )}
                </div>


              </>
            )}
          </div>
        ))}
        
        {// Add pagination controls
        pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-4 py-3 sm:px-6">
            <div className="flex items-center">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Showing{' '}
                <span className="font-medium">
                  {(pagination.page - 1) * pagination.pageSize + 1}
                </span>
                {' '}to{' '}
                <span className="font-medium">
                  {Math.min(pagination.page * pagination.pageSize, pagination.total)}
                </span>
                {' '}of{' '}
                <span className="font-medium">{pagination.total}</span>
                {' '}results
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={!pagination.hasMore}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {pendingQuery && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-4">
            <h3 className="font-medium text-blue-900 mb-2">Additional Information Needed</h3>
            <p className="text-sm text-blue-700 mb-4">
              To answer your question: "{pendingQuery.query}"
            </p>
            <form onSubmit={handleInputSubmit} className="space-y-4">
              {pendingQuery.inputs.map((input) => (
                <div key={input.name} className="bg-white p-4 rounded-lg shadow-sm">
                  <label className="block text-sm font-medium text-gray-900">
                    {input.description}
                  </label>
                  <div className="mt-1">
                    <input
                      type={input.type === 'number' ? 'number' : input.type === 'date' ? 'date' : 'text'}
                      value={inputValues[input.name] || ''}
                      onChange={(e) => handleInputChange(input.name, e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                      placeholder={input.example}
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Example: {input.example}
                    </p>
                  </div>
                </div>
              ))}
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing...
                    </>
                  ) : (
                    'Submit'
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancelInput}
                  disabled={loading}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="useContext"
                    checked={useContext}
                    onChange={(e) => setUseContext(e.target.checked)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="useContext" className="text-sm text-gray-700 dark:text-gray-300">
                    Use previous query as context
                  </label>
                </div>
              </div>
              
              {history.length > 0 && (
                <div className="flex items-center space-x-3 justify-end text-sm">
                  <button
                    type="button"
                    onClick={() => exportHistory(config.dbConfig.database, history)}
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Export History
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to clear the chat history?')) {
                        clearHistory(config.dbConfig.database);
                        setHistory([]);
                      }
                    }}
                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Clear History
                  </button>
                </div>
              )}
              
              <div className="flex items-center space-x-2">
                <input
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const importedData = await importHistory(file);
                      if (importedData) {
                        if (importedData.database === config.dbConfig.database) {
                          if (window.confirm('Do you want to restore this chat history? This will replace your current history.')) {
                            setHistory(importedData.history);
                          }
                        } else {
                          alert('This history file is for a different database.');
                        }
                      } else {
                        alert('Failed to import chat history. Please check the file format.');
                      }
                      // Clear the input
                      e.target.value = '';
                    }
                  }}
                  className="hidden"
                  id="historyFileInput"
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('historyFileInput')?.click()}
                  className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                >
                  Import History
                </button>
              </div>
            </div>

            {contextSummary && (
              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Context being used:
                </h4>
                <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {contextSummary}
                </pre>
              </div>
            )}

        <div className="space-y-3">
          <textarea
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Auto-adjust height
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!loading && !pendingQuery && query.trim()) {
                  handleSubmit(e);
                }
              }
            }}
            placeholder="Ask a question about your database or write SQL directly..."
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900 min-h-[80px] overflow-y-hidden"
            style={{ resize: 'none' }}
            disabled={loading || !!pendingQuery}
          />
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading || !!pendingQuery}
              className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </>
              ) : 'Ask AI'}
            </button>
            <button
              type="button"
              onClick={async (e) => {
                e.preventDefault();
                if (!query.trim()) return;

                setLoading(true);
                const startTime = new Date();
                try {
                  const response = await fetch('/api/execute-sql', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      query: query.trim(),
                      dbConfig: config.dbConfig,
                    }),
                  });

                  const data = await response.json();
                  const endTime = new Date();
                  const duration = endTime.getTime() - startTime.getTime();

                  if (!data.success) {
                    throw new Error(data.error);
                  }

                  const newHistory = [...history, {
                    type: 'query',
                    naturalQuery: 'Direct SQL: ' + query.trim(),
                    sqlQuery: query.trim(),
                    result: data.data,
                    validation: 'SUCCESS',
                    timing: {
                      startTime: startTime.toISOString(),
                      duration: duration
                    }
                  }];
                  setHistory(newHistory);
                  // Scroll to bottom after state update
                  setTimeout(() => {
                    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                } catch (error: any) {
                  const endTime = new Date();
                  const duration = endTime.getTime() - startTime.getTime();
                  const newHistory = [...history, {
                    type: 'query',
                    naturalQuery: 'Direct SQL: ' + query.trim(),
                    sqlQuery: query.trim(),
                    result: [],
                    validation: 'ERROR',
                    error: {
                      message: error.message,
                    },
                    timing: {
                      startTime: startTime.toISOString(),
                      duration: duration
                    }
                  }];
                  setHistory(newHistory);
                  // Scroll to bottom after state update
                  setTimeout(() => {
                    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading || !!pendingQuery}
              className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              Execute SQL
            </button>
          </div>
            </div>
        </div>
      </form>
        <div ref={bottomRef} />
      </div>

      {// Add schema viewer only if dbSchema exists
      dbSchema && (
        <SchemaViewer
          schema={dbSchema}
          isOpen={showSchemaViewer}
          onClose={() => setShowSchemaViewer(false)}
        />
      )}
    </div>
  );
} 