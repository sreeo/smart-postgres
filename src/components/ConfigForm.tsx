import { useState } from 'react';

interface ConfigFormProps {
  onConnect: (config: any) => void;
}

export default function ConfigForm({ onConnect }: ConfigFormProps) {
  const [config, setConfig] = useState({
    host: '',
    port: 5432,
    database: '',
    user: '',
    password: '',
    llmProvider: 'openrouter',
    openRouterKey: '',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'codellama:7b-instruct',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);

  const testConnection = async () => {
    setLoading(true);
    setError(null);
    setTestSuccess(false);

    try {
      const response = await fetch('/api/query/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dbConfig: {
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
          },
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to connect to database');
      }

      setTestSuccess(true);
    } catch (error: any) {
      setError(error.message || 'Failed to connect to database');
      setTestSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!testSuccess) {
      // Test connection first if not already validated
      await testConnection();
      
      if (!testSuccess) {
        return; // Don't proceed if connection test failed
      }
    }

    onConnect({
      dbConfig: {
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
      },
      llmConfig: {
        provider: config.llmProvider,
        ...(config.llmProvider === 'openrouter' ? {
          apiKey: config.openRouterKey,
        } : {
          baseUrl: config.ollamaUrl,
          model: config.ollamaModel,
        }),
      },
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: name === 'port' ? parseInt(value) || '' : value,
    }));
    // Reset validation states when config changes
    setTestSuccess(false);
    setError(null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-gray-900">Database Configuration</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="host" className="block text-sm font-medium text-gray-900">
              Host
            </label>
            <input
              type="text"
              name="host"
              id="host"
              value={config.host}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
              required
            />
          </div>
          <div>
            <label htmlFor="port" className="block text-sm font-medium text-gray-900">
              Port
            </label>
            <input
              type="number"
              name="port"
              id="port"
              value={config.port}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="database" className="block text-sm font-medium text-gray-900">
            Database
          </label>
          <input
            type="text"
            name="database"
            id="database"
            value={config.database}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
            required
          />
        </div>

        <div>
          <label htmlFor="user" className="block text-sm font-medium text-gray-900">
            Username
          </label>
          <input
            type="text"
            name="user"
            id="user"
            value={config.user}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-900">
            Password
          </label>
          <input
            type="password"
            name="password"
            id="password"
            value={config.password}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
            required
          />
        </div>

        {/* Test Connection Button */}
        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={testConnection}
            disabled={loading || !config.host || !config.database || !config.user || !config.password}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </button>
          
          {testSuccess && (
            <span className="text-green-600 text-sm flex items-center">
              <svg className="h-5 w-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Connection successful
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Connection Error</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-medium text-gray-900">LLM Configuration</h2>
        
        <div>
          <label htmlFor="llmProvider" className="block text-sm font-medium text-gray-900">
            LLM Provider
          </label>
          <select
            name="llmProvider"
            id="llmProvider"
            value={config.llmProvider}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
          >
            <option value="openrouter">OpenRouter (Claude)</option>
            <option value="ollama">Ollama (Local)</option>
          </select>
        </div>

        {config.llmProvider === 'openrouter' ? (
          <div>
            <label htmlFor="openRouterKey" className="block text-sm font-medium text-gray-900">
              OpenRouter API Key
            </label>
            <input
              type="password"
              name="openRouterKey"
              id="openRouterKey"
              value={config.openRouterKey}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
              required
            />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="ollamaUrl" className="block text-sm font-medium text-gray-900">
                Ollama URL
              </label>
              <input
                type="text"
                name="ollamaUrl"
                id="ollamaUrl"
                value={config.ollamaUrl}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                required
              />
            </div>
            <div>
              <label htmlFor="ollamaModel" className="block text-sm font-medium text-gray-900">
                Ollama Model
              </label>
              <input
                type="text"
                name="ollamaModel"
                id="ollamaModel"
                value={config.ollamaModel}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                required
              />
            </div>
          </>
        )}
      </div>

      <div>
        <button
          type="submit"
          disabled={loading || !testSuccess}
          className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </form>
  );
} 