🚀 Smart Postgres Client

A powerful, AI-driven PostgreSQL client that transforms natural language into SQL queries. This modern application allows you to interact with your PostgreSQL database using plain English, making database operations more accessible and efficient than ever before.

Built with Next.js, TypeScript, and Tailwind CSS, this client combines the power of AI language models with a sleek, user-friendly interface to provide an intuitive database management experience.

> **Note**: This entire application was generated through AI pair programming, with human oversight for QA and feature direction.

![Smart Postgres Client]

## ✨ Features

### 🤖 Natural Language Query Interface
- Write queries in plain English
- AI translates natural language to SQL
- Contextual understanding of your database schema
- Support for complex queries and joins
- Validation and error suggestions

### 📊 Schema Management
- Interactive schema viewer
- Table relationships visualization
- Column details and constraints
- Foreign key mapping
- Index information
- Table statistics

### 🎨 Modern UI/UX
- Clean, responsive design
- Dark mode support
- Syntax highlighting for SQL
- Smart text truncation with copy functionality
- Intelligent number formatting
- Paginated results
- CSV export functionality
- Error handling with suggestions

### 🔌 Flexible LLM Integration
- Support for multiple LLM providers:
  - OpenRouter (Claude, GPT-4, etc.)
  - Ollama (Local models)

### 📈 Advanced Features
- Query history tracking
- Schema caching for improved performance
- Pagination for large datasets
- Real-time schema updates
- Table statistics and metrics
- Query validation and optimization suggestions
- Support for system catalog queries (pg_stat_activity, pg_locks, etc.)

### 🔒 Security
- Secure credential management
- Connection testing
- Error handling with detailed feedback
- Safe query execution

## 🛠️ Technical Stack

- **Frontend**: Next.js, React, TypeScript
- **Styling**: Tailwind CSS, HeadlessUI
- **Database**: PostgreSQL
- **AI Integration**: OpenRouter API, Ollama
- **State Management**: React Hooks
- **Type Safety**: TypeScript

## 🚀 Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/sreeo/smart-postgres.git
   cd smart-postgres
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000` and enter your database credentials and LLM configuration to get started.

## 🔧 Configuration

### Database Connection
Configure your database connection directly in the UI:
- Host
- Port
- Database name
- Username
- Password

### LLM Provider Settings
Configure your LLM provider in the UI:

#### OpenRouter
- API Key (required)
- Model selection from available models
- Custom base URL (optional)

#### Custom OpenAI-Compatible Endpoints
The application supports any API endpoint that follows the OpenAI API specification:
- Custom API endpoint URL
- API Key
- Available models list
- Custom parameters (temperature, max tokens, etc.)

> **Note**: When using custom endpoints, ensure they follow the OpenAI API specification for chat completions. The endpoint should accept requests in the OpenAI format and return responses in the same structure.
  - Model selection (Claude, GPT-4, etc.)
- **Ollama**:
  - Base URL
  - Model name

## 🤝 Contributing

While this project was AI-generated, contributions are welcome! Please feel free to submit issues and pull requests.

## 🌟 Acknowledgments

This project is a demonstration of AI-human collaboration in software development. All code, features, and documentation were generated through AI pair programming, with human oversight for quality assurance and feature direction.

Special thanks to:
- Claude AI for code generation and problem-solving
- The open-source community for the amazing tools and libraries
- Human QA for ensuring quality and directing feature development

## 📄 License

MIT License - feel free to use this project for learning, development, or production use.

---

<p align="center">Made with 🤖 and ❤️</p>
