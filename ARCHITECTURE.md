# Smart Postgres Application Architecture

## Application Flow Diagram

```mermaid
graph TB
    subgraph "Frontend Layer"
        UI[User Interface]
        QI[Query Interface Component]
        DA[Database Analysis Component]
        SV[Schema Viewer Component]
        TT[Truncated Text Component]
        Theme[Theme Provider]
        
        UI --> QI
        UI --> DA
        QI --> SV
        QI --> TT
        UI --> Theme
    end

    subgraph "State Management"
        RS[React State]
        CTX[React Context]
        
        QI --> RS
        DA --> RS
        UI --> CTX
    end

    subgraph "API Layer"
        subgraph "Query Endpoints"
            GEN["API: /query/generate"]
            EXEC["API: /query/execute"]
            SCHEMA["API: /query/schema"]
            TEST["API: /query/test-connection"]
        end
        
        QI --> GEN
        QI --> EXEC
        QI --> SCHEMA
        QI --> TEST
    end

    subgraph "Service Layer"
        subgraph "Database Services"
            DBC[Database Client]
            DBInit[Database Initializer]
            SchemaService[Schema Service]
            QueryExecutor[Query Executor]
        end
        
        subgraph "LLM Services"
            LLMClient[LLM Client]
            LLMInit[LLM Initializer]
            QueryGen[Query Generator]
            ErrorHandler[Error Handler]
        end
        
        SCHEMA --> SchemaService
        GEN --> QueryGen
        EXEC --> QueryExecutor
        TEST --> DBC
    end

    subgraph "External Services"
        PG[(PostgreSQL Database)]
        subgraph "LLM Providers"
            OR[OpenRouter API]
            OL[Ollama API]
            Custom[Custom OpenAI Compatible API]
        end
        
        DBC --> PG
        SchemaService --> PG
        QueryExecutor --> PG
        
        LLMClient --> OR
        LLMClient --> OL
        LLMClient --> Custom
    end

    subgraph "Configuration Layer"
        Config[Configuration Manager]
        
        subgraph "Database Config"
            DBCreds[Database Credentials]
            ConnPool[Connection Pool Settings]
        end
        
        subgraph "LLM Config"
            LLMCreds[LLM API Credentials]
            Models[Available Models]
            Params[Model Parameters]
        end
        
        Config --> DBCreds
        Config --> ConnPool
        Config --> LLMCreds
        Config --> Models
        Config --> Params
    end

    subgraph "Data Flow"
        direction LR
        Input[User Input] --> |Natural Language| QueryGen
        QueryGen --> |SQL Query| QueryExecutor
        QueryExecutor --> |Results| QI
        SchemaService --> |Schema Info| QueryGen
    end

    subgraph "Error Handling"
        EH[Error Handler]
        Validation[Input Validation]
        ErrorLogs[Error Logging]
        
        EH --> ErrorLogs
        Validation --> EH
        QueryGen --> EH
        QueryExecutor --> EH
    end

    subgraph "Security Layer"
        Auth[Authentication]
        San[Input Sanitization]
        Rate[Rate Limiting]
        
        QI --> Auth
        QI --> San
        API --> Rate
    end

    subgraph "Development Tools"
        Dev[Development Server]
        Build[Build Process]
        Lint[Linter & Formatter]
        Test[Testing Framework]
    end
```

## Component Descriptions

### Frontend Layer
- **User Interface**: Main application container
- **Query Interface**: Handles natural language input and query results
- **Database Analysis**: Provides database metrics and analysis
- **Schema Viewer**: Displays database schema and relationships
- **Theme Provider**: Manages application theming

### API Layer
- **/api/query/generate**: Converts natural language to SQL
- **/api/query/execute**: Executes SQL queries
- **/api/query/schema**: Retrieves database schema
- **/api/query/test-connection**: Tests database connectivity

### Service Layer
- **Database Services**: Manages database connections and operations
- **LLM Services**: Handles AI model interactions and query generation
- **Schema Service**: Manages database schema information
- **Query Executor**: Handles query execution and result pagination

### External Services
- **PostgreSQL**: Target database system
- **LLM Providers**: 
  - OpenRouter (Claude, GPT-4)
  - Ollama (Local models)
  - Custom OpenAI-compatible endpoints

### Configuration Layer
- **Database Config**: Connection and pool settings
- **LLM Config**: API credentials and model parameters
- **Application Config**: General application settings

### Security Layer
- **Authentication**: User authentication
- **Input Sanitization**: Query and input validation
- **Rate Limiting**: API request limiting

### Development Tools
- **Development Server**: Next.js development environment
- **Build Process**: Production build pipeline
- **Testing**: Unit and integration tests
- **Linting**: Code quality tools

## Data Flow

1. User enters natural language query
2. Query is validated and sanitized
3. LLM service generates SQL query
4. SQL query is executed against database
5. Results are paginated and formatted
6. UI displays results to user

## Error Handling

1. Input validation errors
2. LLM generation errors
3. Database execution errors
4. Network and connection errors
5. Rate limiting errors

## User Workflow Diagrams

### Database Connection and Query Workflow

```mermaid
sequenceDiagram
    actor User
    participant UI as User Interface
    participant DB as Database Service
    participant LLM as LLM Service
    participant PG as PostgreSQL

    %% Initial Setup
    User->>UI: Enter Database Credentials
    UI->>DB: Test Connection
    alt Connection Success
        DB->>PG: Verify Credentials
        PG-->>DB: Connection OK
        DB-->>UI: Connection Successful
        UI-->>User: Show Success & Continue
    else Connection Failed
        DB-->>UI: Connection Error
        UI-->>User: Show Error Details
    end

    %% LLM Setup
    User->>UI: Enter LLM Configuration
    UI->>LLM: Initialize LLM Client
    alt LLM Setup Success
        LLM-->>UI: Ready for Queries
        UI-->>User: Show Query Interface
    else LLM Setup Failed
        LLM-->>UI: Configuration Error
        UI-->>User: Show Error & Retry Options
    end

    %% Schema Loading
    UI->>DB: Request Schema
    DB->>PG: Fetch Schema Details
    PG-->>DB: Return Schema
    DB-->>UI: Display Schema

    %% Query Process
    User->>UI: Enter Natural Language Query
    UI->>LLM: Generate SQL Query
    
    alt Query Generation Success
        LLM-->>UI: Return SQL Query
        UI-->>User: Show Generated SQL
        
        alt User Accepts Query
            User->>UI: Confirm Execute
            UI->>DB: Execute SQL
            DB->>PG: Run Query
            
            alt Query Execution Success
                PG-->>DB: Return Results
                DB-->>UI: Format Results
                UI-->>User: Display Results
                
                opt Export Results
                    User->>UI: Request Export
                    UI-->>User: Download CSV/JSON
                end
                
            else Query Execution Failed
                PG-->>DB: Error Details
                DB-->>UI: Format Error
                UI-->>User: Show Error & Suggestions
            end
            
        else User Modifies Query
            User->>UI: Edit Query
            UI->>LLM: Regenerate SQL
        end
        
    else Query Generation Failed
        LLM-->>UI: Error Details
        UI-->>User: Show Error & Examples
    end

    %% Analysis Features
    opt View Database Analysis
        User->>UI: Open Analysis View
        UI->>DB: Fetch Statistics
        DB->>PG: Get System Stats
        PG-->>DB: Return Stats
        DB-->>UI: Format Dashboard
        UI-->>User: Show Analysis
    end

    %% Schema Exploration
    opt Explore Schema
        User->>UI: Open Schema View
        UI->>DB: Get Detailed Schema
        DB->>PG: Fetch Relations
        PG-->>DB: Return Details
        DB-->>UI: Format Schema View
        UI-->>User: Display Schema Browser
    end
```

### Error Handling Workflow

```mermaid
sequenceDiagram
    actor User
    participant UI as User Interface
    participant Val as Validator
    participant LLM as LLM Service
    participant DB as Database Service

    %% Input Validation
    User->>UI: Submit Input
    UI->>Val: Validate Input
    alt Input Valid
        Val-->>UI: Validation OK
        UI->>LLM: Process Input
    else Input Invalid
        Val-->>UI: Validation Errors
        UI-->>User: Show Input Errors
    end

    %% Rate Limiting
    alt Rate Limit Exceeded
        LLM-->>UI: Rate Limit Error
        UI-->>User: Show Cooldown Period
    end

    %% Connection Errors
    alt Database Connection Lost
        DB-->>UI: Connection Error
        UI->>DB: Attempt Reconnect
        alt Reconnect Success
            DB-->>UI: Connection Restored
            UI-->>User: Resume Operation
        else Reconnect Failed
            UI-->>User: Show Connection Error
        end
    end

    %% LLM Errors
    alt LLM Service Error
        LLM-->>UI: Service Error
        UI->>LLM: Retry Request
        alt Retry Success
            LLM-->>UI: Request Complete
            UI-->>User: Show Results
        else Retry Failed
            UI-->>User: Show Error & Alternatives
        end
    end
```
