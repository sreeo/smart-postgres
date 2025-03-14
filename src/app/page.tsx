'use client';

import { useState } from 'react';
import ConfigForm from '@/components/ConfigForm';
import QueryInterface from '@/components/QueryInterface';

export default function Home() {
  const [config, setConfig] = useState<any>(null);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Smart Postgres Client
          </h1>

          {!config ? (
            <div className="max-w-md mx-auto">
              <ConfigForm onConnect={setConfig} />
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow min-h-[600px] flex flex-col">
              <QueryInterface config={config} onDisconnect={() => setConfig(null)} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
