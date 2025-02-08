import { useState } from 'react';

interface QueryInterfaceProps {
  config: {
    dbConfig: any;
    llmConfig: {
      provider: 'openrouter' | 'ollama';
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };
  };
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

export default function QueryInterface({ config }: QueryInterfaceProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QueryResult[]>([]);
  const [pendingQuery, setPendingQuery] = useState<PendingQuery | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          dbConfig: config.dbConfig,
          llmConfig: config.llmConfig,
        }),
      });

      const data = await response.json();
      
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
          } : {
            explanation: data.explanation,
          }),
        }]);
        setQuery('');
      }
    } catch (error: any) {
      setHistory(prev => [...prev, {
        type: 'query',
        naturalQuery: query,
        result: [],
        validation: 'ERROR',
        error: {
          message: error.message,
        },
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
          llmConfig: config.llmConfig,
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

  return (
    <div className="flex flex-col h-full">
      <div className="h-[600px] overflow-y-auto p-4 space-y-4 border-b">
        {pendingQuery && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
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

        {history.map((item, index) => (
          <div key={index} className="space-y-2">
            <div className="bg-gray-100 p-4 rounded-lg">
              <h3 className="font-mono text-sm text-gray-900">Your Question:</h3>
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
                  <h3 className="font-mono text-sm text-gray-900">Generated SQL:</h3>
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
                  {item.result && item.result.length > 0 ? (
                    <div className="mt-2 overflow-x-auto max-h-[300px]">
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
                                  {JSON.stringify(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-2 text-gray-900">No results found</p>
                  )}
                </div>

                {item.validation !== 'SUCCESS' && (
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <p className="text-gray-900">{item.validation}</p>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex space-x-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question about your database..."
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
            disabled={loading || !!pendingQuery}
          />
          <button
            type="submit"
            disabled={loading || !!pendingQuery}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Ask'}
          </button>
        </div>
      </form>
    </div>
  );
} 