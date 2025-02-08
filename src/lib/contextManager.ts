import { DatabaseSchema } from '@/types/schema';
import { generateLLMResponse } from '@/lib/llm';

interface QueryContext {
  query: string;
  sqlQuery: string;
  timestamp: number;
  tables: string[];
  success: boolean;
  result?: any[];
  error?: {
    message: string;
    suggestion?: string;
  };
  intent?: string;
  entities?: string[];
}

interface ConversationContext {
  recentQueries: QueryContext[];
  relatedTables: Set<string>;
  lastMentionedColumns: Set<string>;
  impliedFilters: Map<string, any>;
  temporalContext?: {
    startDate?: string;
    endDate?: string;
    timeRange?: string;
  };
}

interface DatabaseContext {
  schema: DatabaseSchema;
  conversation: ConversationContext;
  commonPatterns: {
    [table: string]: {
      frequentJoins: string[];
      commonFilters: string[];
      lastAccessed: number;
      commonAggregations: string[];
      relatedColumns: Set<string>;
    };
  };
}

export class ContextManager {
  private static MAX_RECENT_QUERIES = 10;
  private context: DatabaseContext | null = null;
  private contextKeywords = new Set([
    'previous', 'last', 'before', 'again', 'same', 'that', 'those', 'these',
    'it', 'they', 'them', 'similar', 'like', 'also', 'too', 'as well',
    'instead', 'rather', 'but', 'however', 'additionally', 'moreover'
  ]);

  initialize(schema: DatabaseSchema) {
    this.context = {
      schema,
      conversation: {
        recentQueries: [],
        relatedTables: new Set(),
        lastMentionedColumns: new Set(),
        impliedFilters: new Map(),
      },
      commonPatterns: {},
    };
  }

  private extractTableNames(query: string): string[] {
    const tableMatches = query.match(/FROM\s+(\w+)|JOIN\s+(\w+)/gi) || [];
    return tableMatches.map(match => match.replace(/FROM\s+|JOIN\s+/i, '').trim());
  }

  private extractColumnNames(query: string): string[] {
    const columnMatches = query.match(/SELECT\s+(.+?)\s+FROM|WHERE\s+(\w+)|GROUP BY\s+(\w+)|ORDER BY\s+(\w+)/gi) || [];
    return columnMatches
      .flatMap(match => match.split(/[\s,]+/))
      .filter(col => col && !['SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER'].includes(col.toUpperCase()));
  }

  private hasContextualReference(query: string): boolean {
    return Array.from(this.contextKeywords).some(keyword => 
      query.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private findRelevantPreviousContext(naturalQuery: string): QueryContext | null {
    if (!this.context || this.context.conversation.recentQueries.length === 0) return null;

    const currentWords = new Set(naturalQuery.toLowerCase().split(/\s+/));
    let bestMatch: { score: number; query: QueryContext } | null = null;

    for (const prevQuery of this.context.conversation.recentQueries) {
      let score = 0;
      const prevWords = new Set(prevQuery.query.toLowerCase().split(/\s+/));

      // Check for word overlap
      for (const word of currentWords) {
        if (prevWords.has(word)) score += 1;
      }

      // Check for table overlap
      const prevTables = new Set(prevQuery.tables);
      const currentTables = new Set(this.extractTableNames(naturalQuery));
      for (const table of currentTables) {
        if (prevTables.has(table)) score += 2;
      }

      // Boost score if the previous query was successful
      if (prevQuery.success) score *= 1.5;

      // Consider recency (more recent queries get a boost)
      const recencyBoost = 1 - (Date.now() - prevQuery.timestamp) / (1000 * 60 * 60); // Hour-based decay
      score *= (1 + Math.max(0, recencyBoost));

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { score, query: prevQuery };
      }
    }

    return bestMatch && bestMatch.score > 1 ? bestMatch.query : null;
  }

  private async analyzeLLMContext(naturalQuery: string, llmConfig: any): Promise<{
    needsContext: boolean;
    relevantQueries: string[];
    intent: string;
    entities: string[];
  }> {
    const prompt = `Analyze this database query request and determine if it needs previous context:

Query: "${naturalQuery}"

Consider:
1. Does this query reference previous results or context?
2. What is the main intent of this query?
3. What entities (tables, columns, values) are mentioned?
4. Is this a follow-up question?

Respond in JSON format:
{
  "needsContext": boolean,
  "reasoning": "brief explanation",
  "intent": "main purpose of the query",
  "entities": ["list", "of", "identified", "entities"],
  "isFollowUp": boolean,
  "contextKeywords": ["list", "of", "context", "indicating", "words"]
}`;

    try {
      const response = await generateLLMResponse(prompt, llmConfig);
      const analysis = JSON.parse(response);
      
      return {
        needsContext: analysis.needsContext || analysis.isFollowUp,
        relevantQueries: analysis.contextKeywords || [],
        intent: analysis.intent,
        entities: analysis.entities
      };
    } catch (error) {
      console.error('Error in LLM context analysis:', error);
      // Fall back to keyword-based detection
      return {
        needsContext: this.hasContextualReference(naturalQuery),
        relevantQueries: [],
        intent: '',
        entities: []
      };
    }
  }

  async getQueryContext(naturalQuery: string, llmConfig: any): Promise<string> {
    if (!this.context) return '';

    const contextParts: string[] = [];
    
    // Use both LLM and keyword-based analysis
    const llmAnalysis = await this.analyzeLLMContext(naturalQuery, llmConfig);
    const hasContextRef = llmAnalysis.needsContext || this.hasContextualReference(naturalQuery);
    
    if (hasContextRef) {
      const relevantPrevQuery = this.findRelevantPreviousContext(naturalQuery);
      
      if (relevantPrevQuery) {
        contextParts.push('Previous relevant query context:');
        contextParts.push(`User asked: ${relevantPrevQuery.query}`);
        contextParts.push(`SQL generated: ${relevantPrevQuery.sqlQuery}`);
        if (relevantPrevQuery.result && relevantPrevQuery.result.length > 0) {
          contextParts.push(`Previous result summary: ${this.summarizeResults(relevantPrevQuery.result)}`);
        }
        if (relevantPrevQuery.error) {
          contextParts.push(`Note: This query had an error: ${relevantPrevQuery.error.message}`);
        }
      }
    }

    // Add intent and entities if available
    if (llmAnalysis.intent) {
      contextParts.push(`\nQuery intent: ${llmAnalysis.intent}`);
    }

    // Filter tables based on both keyword matching and LLM-identified entities
    const potentialTables = this.context.schema.tables
      .filter(table => {
        const isRecentlyUsed = this.context!.conversation.relatedTables.has(table.name);
        const isExplicitlyMentioned = naturalQuery.toLowerCase().includes(table.name.toLowerCase());
        const isLLMIdentified = llmAnalysis.entities.some(entity => 
          table.name.toLowerCase().includes(entity.toLowerCase()) ||
          table.columns.some(col => col.name.toLowerCase().includes(entity.toLowerCase()))
        );
        const hasRelevantColumns = table.columns.some(col => 
          this.context!.conversation.lastMentionedColumns.has(col.name) ||
          naturalQuery.toLowerCase().includes(col.name.toLowerCase()) ||
          llmAnalysis.entities.includes(col.name.toLowerCase())
        );
        return isRecentlyUsed || isExplicitlyMentioned || isLLMIdentified || hasRelevantColumns;
      });

    if (potentialTables.length > 0) {
      contextParts.push('\nRelevant tables and their patterns:');
      potentialTables.forEach(table => {
        const patterns = this.context!.commonPatterns[table.name];
        contextParts.push(`Table ${table.name}:`);
        
        // Add relevant columns with types
        const relevantColumns = table.columns.filter(col =>
          patterns?.relatedColumns.has(col.name) ||
          naturalQuery.toLowerCase().includes(col.name.toLowerCase())
        );
        if (relevantColumns.length > 0) {
          contextParts.push(`- Relevant columns: ${relevantColumns.map(c => 
            `${c.name} (${c.type}${c.isPrimary ? ', PRIMARY KEY' : ''})`
          ).join(', ')}`);
        }

        if (patterns) {
          if (patterns.frequentJoins.length > 0) {
            contextParts.push(`- Common joins: ${patterns.frequentJoins.join(', ')}`);
          }
          if (patterns.commonFilters.length > 0) {
            contextParts.push(`- Common filters: ${patterns.commonFilters.join(', ')}`);
          }
          if (patterns.commonAggregations.length > 0) {
            contextParts.push(`- Common aggregations: ${patterns.commonAggregations.join(', ')}`);
          }
        }
      });
    }

    return contextParts.join('\n');
  }

  private summarizeResults(results: any[]): string {
    if (results.length === 0) return 'No results';
    
    const summary = [];
    const sampleSize = Math.min(3, results.length);
    summary.push(`Found ${results.length} rows`);
    summary.push(`Sample: ${JSON.stringify(results.slice(0, sampleSize))}`);
    
    return summary.join('. ');
  }

  addQueryToContext(
    naturalQuery: string,
    sqlQuery: string,
    success: boolean,
    result?: any[],
    error?: { message: string; suggestion?: string },
    intent?: string,
    entities?: string[]
  ) {
    if (!this.context) return;

    const tables = this.extractTableNames(sqlQuery);
    const columns = this.extractColumnNames(sqlQuery);

    // Update conversation context
    const queryContext: QueryContext = {
      query: naturalQuery,
      sqlQuery,
      timestamp: Date.now(),
      tables,
      success,
      result,
      error,
      intent,
      entities
    };

    this.context.conversation.recentQueries.unshift(queryContext);
    if (this.context.conversation.recentQueries.length > ContextManager.MAX_RECENT_QUERIES) {
      this.context.conversation.recentQueries.pop();
    }

    // Update related tables and columns
    tables.forEach(table => {
      this.context!.conversation.relatedTables.add(table);
      columns.forEach(col => this.context!.conversation.lastMentionedColumns.add(col));

      if (!this.context!.commonPatterns[table]) {
        this.context!.commonPatterns[table] = {
          frequentJoins: [],
          commonFilters: [],
          lastAccessed: Date.now(),
          commonAggregations: [],
          relatedColumns: new Set(columns),
        };
      }

      // Update patterns
      if (success) {
        const joins = tables.filter(t => t !== table);
        this.context!.commonPatterns[table].frequentJoins = [
          ...new Set([...this.context!.commonPatterns[table].frequentJoins, ...joins])
        ];

        // Extract and store filters
        const whereMatch = sqlQuery.match(/WHERE\s+([^;]+)/i);
        if (whereMatch) {
          const filters = whereMatch[1].split(/AND|OR/i).map(f => f.trim());
          this.context!.commonPatterns[table].commonFilters = [
            ...new Set([...this.context!.commonPatterns[table].commonFilters, ...filters])
          ];
        }

        // Extract and store aggregations
        const aggMatch = sqlQuery.match(/(?:SUM|COUNT|AVG|MIN|MAX)\s*\([^)]+\)/gi);
        if (aggMatch) {
          this.context!.commonPatterns[table].commonAggregations = [
            ...new Set([...this.context!.commonPatterns[table].commonAggregations, ...aggMatch])
          ];
        }

        this.context!.commonPatterns[table].lastAccessed = Date.now();
        columns.forEach(col => this.context!.commonPatterns[table].relatedColumns.add(col));
      }
    });
  }

  clear() {
    this.context = null;
  }
}

export const contextManager = new ContextManager(); 