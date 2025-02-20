'use client';

import { useSearchParams } from 'next/navigation';
import DatabaseAnalysis from '@/components/DatabaseAnalysis';

export default function AnalyzePage() {
  const searchParams = useSearchParams();
  const dbConfigStr = searchParams.get('dbConfig');
  const dbConfig = dbConfigStr ? JSON.parse(dbConfigStr) : null;

  if (!dbConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">No Database Configuration</h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Please connect to a database first.</p>
        </div>
      </div>
    );
  }

  return <DatabaseAnalysis dbConfig={dbConfig} />;
}
