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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Connect to Database</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-900">Host</label>
          <input
            type="text"
            name="host"
            value={config.host}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">Port</label>
          <input
            type="number"
            name="port"
            value={config.port}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">Database</label>
          <input
            type="text"
            name="database"
            value={config.database}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">Username</label>
          <input
            type="text"
            name="user"
            value={config.user}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">Password</label>
          <input
            type="password"
            name="password"
            value={config.password}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
            required
          />
        </div>

        <div className="border-t pt-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">LLM Configuration</h3>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-900">LLM Provider</label>
            <select
              name="llmProvider"
              value={config.llmProvider}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
            >
              <option value="openrouter">OpenRouter (Claude)</option>
              <option value="ollama">Local Ollama</option>
            </select>
          </div>

          {config.llmProvider === 'openrouter' ? (
            <div>
              <label className="block text-sm font-medium text-gray-900">
                OpenRouter API Key
                <span className="text-xs text-gray-500 ml-2">(Using Claude via OpenRouter)</span>
              </label>
              <input
                type="password"
                name="openRouterKey"
                value={config.openRouterKey}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                required
              />
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900">
                  Ollama URL
                  <span className="text-xs text-gray-500 ml-2">(Default: http://localhost:11434)</span>
                </label>
                <input
                  type="text"
                  name="ollamaUrl"
                  value={config.ollamaUrl}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900">
                  Ollama Model
                  <span className="text-xs text-gray-500 ml-2">(e.g., codellama:7b-instruct)</span>
                </label>
                <input
                  type="text"
                  name="ollamaModel"
                  value={config.ollamaModel}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                  required
                />
              </div>
            </>
          )}
        </div>
      </div>

      <button
        type="submit"
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        Connect
      </button>
    </form>
  );
} 