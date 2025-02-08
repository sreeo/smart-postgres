import { useState } from 'react';
import { DatabaseSchema, Table } from '@/types/schema';

interface SchemaViewerProps {
  schema: DatabaseSchema;
  isOpen: boolean;
  onClose: () => void;
}

interface TableNodeProps {
  table: Table;
  isExpanded: boolean;
  onToggle: () => void;
  onTableClick: (tableName: string) => void;
  selectedTable: string | null;
}

function TableNode({ table, isExpanded, onToggle, onTableClick, selectedTable }: TableNodeProps) {
  const isSelected = selectedTable === table.name;

  return (
    <div className={`border rounded-lg ${isSelected ? 'border-indigo-500 shadow-lg' : 'border-gray-200 dark:border-gray-700'}`}>
      <div
        className={`p-3 cursor-pointer ${
          isSelected ? 'bg-indigo-50 dark:bg-indigo-900' : 'bg-white dark:bg-gray-800'
        }`}
        onClick={() => onTableClick(table.name)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <svg
                className={`h-4 w-4 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span className="font-medium text-gray-900 dark:text-white">{table.name}</span>
          </div>
          {table.statistics && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {table.statistics.totalRows.toLocaleString()} rows
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Columns</h4>
            <div className="space-y-1">
              {table.columns.map((column) => (
                <div
                  key={column.name}
                  className="flex items-center text-sm"
                >
                  <span className="text-gray-900 dark:text-white font-mono">
                    {column.name}
                  </span>
                  <span className="mx-2 text-gray-400">-</span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {column.type}
                    {column.isPrimary && (
                      <span className="ml-1 text-yellow-600 dark:text-yellow-400">PK</span>
                    )}
                    {!column.nullable && (
                      <span className="ml-1 text-red-600 dark:text-red-400">*</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {table.foreignKeys && table.foreignKeys.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Foreign Keys</h4>
              <div className="space-y-1">
                {table.foreignKeys.map((fk, index) => (
                  <div
                    key={index}
                    className="text-sm text-gray-600 dark:text-gray-400"
                  >
                    {fk.column} → {fk.referencedTable}.{fk.referencedColumn}
                  </div>
                ))}
              </div>
            </div>
          )}

          {table.indexes && table.indexes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Indexes</h4>
              <div className="space-y-1">
                {table.indexes.map((index) => (
                  <div
                    key={index.name}
                    className="text-sm text-gray-600 dark:text-gray-400"
                  >
                    {index.name}
                    {index.isUnique && (
                      <span className="ml-1 text-blue-600 dark:text-blue-400">(unique)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SchemaViewer({ schema, isOpen, onClose }: SchemaViewerProps) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleTable = (tableName: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
    } else {
      newExpanded.add(tableName);
    }
    setExpandedTables(newExpanded);
  };

  const handleTableClick = (tableName: string) => {
    setSelectedTable(tableName);
    if (!expandedTables.has(tableName)) {
      toggleTable(tableName);
    }
  };

  const filteredTables = schema.tables.filter(table =>
    table.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    table.columns.some(col => col.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="fixed inset-0 bg-black bg-opacity-25 dark:bg-opacity-50" onClick={onClose} />
        
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Database Schema
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-4">
              <input
                type="text"
                placeholder="Search tables and columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {filteredTables.map((table) => (
              <TableNode
                key={table.name}
                table={table}
                isExpanded={expandedTables.has(table.name)}
                onToggle={() => toggleTable(table.name)}
                onTableClick={handleTableClick}
                selectedTable={selectedTable}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {schema.tables.length} tables, {' '}
                {schema.tables.reduce((acc, table) => acc + table.columns.length, 0)} columns
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 