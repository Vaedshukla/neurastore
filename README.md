# NeuraStore+ — Intelligent Multi-Modal Storage System

NeuraStore+ is an advanced file analysis and storage platform that intelligently organizes and processes multi-modal content. It automatically categorizes files, processes JSON data with SQL/NoSQL determination, and provides real-time visualization and querying capabilities.

## Key Features

- **NeuraNotebook Workspace**: AI-powered document intelligence workspace for PDF, TXT, MD, and DOCX files with summaries, key takeaways, topic breakdowns, and grounded Q&A with source citations
- **Unified File Upload**: Single interface for all file types (images, videos, audio, documents, code, archives)
- **Intelligent Organization**: Automatic categorization and directory structure based on content analysis
- **Local Processing**: No external API dependencies - all classification done client-side
- **Full JSON Processing**: Automatic SQL/NoSQL determination, table creation, and data insertion
- **Data Querying**: Built-in SQL query interface for processed JSON data
- **Schema Management**: Version history and conflict detection for evolving data structures
- **Real-time Dashboard**: Charts and analytics for uploaded files and data tables
- **File Preview**: Built-in preview for images, videos, PDFs, and text files
- **Schema Visualization**: Interactive graphs for JSON data structures
- **Search & History**: Full-text search and file management
- **Batch Processing**: Efficient handling of large JSON files (up to 50MB)

## Tech Stack

### Frontend
- **Next.js 14+**: App Router, Server Components
- **React 19**: Latest React features
- **TypeScript**: Type safety
- **Tailwind CSS**: Utility-first styling
- **Radix UI**: Accessible component primitives
- **Framer Motion**: Animations
- **React Dropzone**: File upload handling
- **Recharts**: Data visualization
- **React Flow**: Schema visualization

### Backend
- **Next.js API Routes**: Serverless functions
- **Supabase**: Database and file storage
- **PostgreSQL**: Primary database
- **SQL Generation**: Dynamic table creation

### Utilities
- **file-type**: MIME type detection
- **pdf-parse**: PDF text extraction
- **fluent-ffmpeg**: Media processing
- **crypto**: File checksums

## System Architecture Summary

NeuraStore+ follows a modern full-stack architecture with Next.js providing both frontend and backend capabilities. The system uses Supabase for database operations and file storage, with intelligent processing pipelines that automatically determine optimal storage strategies for different data types.

### High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Database      │
│   (Next.js)     │◄──►│   (Next.js)     │◄──►│   (Supabase)    │
│                 │    │                 │    │                 │
│ • File Upload   │    │ • /api/upload   │    │ • files_metadata│
│ • Dashboard     │    │ • /api/analyze  │    │ • json_schemas  │
│ • Search        │    │ • /api/search   │    │ • Dynamic SQL   │
│ • Visualization │    │ • /api/create   │    │ • Storage       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Folder Structure

```
.
├── public/                          # Static assets
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── api/                    # API routes
│   │   │   ├── analyze/            # File analysis endpoint
│   │   │   ├── analyze-json/       # JSON schema analysis
│   │   │   ├── create-sql-table/   # SQL table creation
│   │   │   ├── handle-schema-conflict/ # Schema conflict resolution
│   │   │   ├── infer-schema/       # Schema inference
│   │   │   ├── insert-sql-rows/    # Data insertion
│   │   │   ├── process-json/       # JSON processing
│   │   │   ├── query-table/        # Data querying
│   │   │   ├── search/             # Search functionality
│   │   │   └── upload/             # File upload
│   │   ├── dashboard/              # Dashboard page
│   │   ├── history/                # History page
│   │   ├── search/                 # Search page
│   │   ├── settings/               # Settings page
│   │   ├── upload/                 # Upload page
│   │   ├── favicon.ico
│   │   ├── globals.css
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Home page
│   ├── components/                 # React components
│   │   ├── ui/                     # Reusable UI components
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── select.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── table.tsx
│   │   │   ├── textarea.tsx
│   │   │   └── toast.tsx
│   │   ├── ChartVisualizer.tsx     # Chart visualization
│   │   ├── ClientProviders.tsx     # Client-side providers
│   │   ├── ClientToastProvider.tsx # Toast notifications
│   │   ├── ConfirmUploadDialog.tsx # Upload confirmation
│   │   ├── DashboardCharts.tsx     # Dashboard charts
│   │   ├── DataQueryModal.tsx      # Data querying interface
│   │   ├── FileCard.tsx            # File display card
│   │   ├── FilePreview.tsx         # File preview component
│   │   ├── FileTreeView.tsx        # File tree visualization
│   │   ├── FileUpload.tsx          # File upload component
│   │   ├── IntelligenceSidebar.tsx # Intelligence sidebar
│   │   ├── JSONVisualizer.tsx      # JSON visualization
│   │   ├── MainLayout.tsx          # Main application layout
│   │   ├── ObjectView.tsx          # Object display
│   │   ├── SchemaGraph.tsx         # Schema graph visualization
│   │   ├── SchemaView.tsx          # Schema view
│   │   ├── SearchBar.tsx           # Search bar component
│   │   ├── Sidebar.tsx             # Application sidebar
│   │   ├── StatsCard.tsx           # Statistics cards
│   │   ├── Topbar.tsx              # Top navigation bar
│   │   └── UploadAnalysisModal.tsx # Upload analysis modal
│   ├── lib/                        # Utility libraries
│   │   ├── utils/                  # Utility functions
│   │   │   ├── buildFileTree.ts    # File tree building
│   │   │   ├── fileHandler.ts      # File handling utilities
│   │   │   ├── jsonProcessor.ts    # JSON processing
│   │   │   └── schemaGenerator.ts  # Schema generation
│   │   ├── classifyJsonServer.ts   # JSON classification
│   │   ├── fileClassifier.ts       # File classification
│   │   ├── i18n.ts                 # Internationalization
│   │   ├── schemaUtils.ts          # Schema utilities
│   │   ├── supabaseClient.ts       # Supabase client
│   │   └── utils.ts                # General utilities
│   └── utils/                      # Additional utilities
│       └── jsonAnalyzer.ts         # JSON analysis
├── supabase/                       # Supabase Edge Functions
│   └── functions/
│       └── process-json/           # JSON processing function
│           └── index.ts
├── ARCHITECTURE.md                 # Detailed architecture docs
├── components.json                 # Component configuration
├── eslint.config.mjs               # ESLint configuration
├── next.config.ts                  # Next.js configuration
├── package.json                    # Project dependencies
├── postcss.config.mjs              # PostCSS configuration
├── sample_data.json                # Sample data for testing
├── supabase_setup.sql              # Database setup script
├── test_json_pipeline.js           # Test pipeline script
├── tsconfig.json                   # TypeScript configuration
└── .env.example                    # Environment variables template
```

## Documentation

For detailed technical documentation, see:

- **[System Architecture](docs/architecture.md)** - Complete system overview, data flow diagrams, database schema, and component breakdown
- **[Developer Guide](docs/developer-guide.md)** - How to extend schema logic, add media categories, Supabase integration, and error handling

## Installation & Local Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account and project

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd neurastore
npm ci
```

### 2. Environment Setup

Copy the environment file:
```bash
cp .env.example .env.local
```

Update the `.env.local` file with your actual values:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key

### 3. Database Setup

Run the database migration script in your Supabase SQL Editor:

```bash
# Copy and paste the contents of supabase_setup.sql into your Supabase SQL Editor
# This will create all necessary tables, indexes, and functions
```

### 4. Deploy Edge Function

Deploy the JSON processing Edge Function:

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the Edge Function
supabase functions deploy process-json
```

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## How to Upload Files

1. **Navigate to Upload Page**: Go to `/upload` in your browser
2. **Select Files**: Click or drag files into the upload area
3. **Automatic Processing**: Files are automatically categorized and stored
4. **JSON Processing**: JSON files are analyzed for SQL/NoSQL determination
5. **View Results**: Check the dashboard for processing results and analytics

### Supported File Types
- Images (JPEG, PNG, GIF, WebP, SVG)
- Videos (MP4, AVI, MOV, WMV)
- Audio (MP3, WAV, FLAC, AAC)
- Documents (PDF, DOC, DOCX, TXT)
- Code files (JS, TS, PY, HTML, CSS, etc.)
- Archives (ZIP, RAR, 7Z)
- JSON files (automatic processing)

## How Intelligent JSON Storage Works

When you upload a JSON file, NeuraStore+ automatically:

### 1. Structure Detection
- Determines if the JSON is a single object or array of objects
- Analyzes nesting depth, data types, and consistency

### 2. Storage Strategy Determination
- **SQL Storage**: For tabular data with consistent structure (≤3 nesting levels, ≤50 fields)
- **NoSQL Storage**: For complex nested structures or irregular data

### 3. SQL Table Generation (for SQL-compatible JSON)
- **Automatic Schema Inference**: Analyzes data types and relationships
- **Normalization**: Splits nested objects into separate related tables
- **Foreign Key Relationships**: Maintains data integrity with proper constraints
- **Batch Insertion**: Handles large datasets efficiently (1000+ records)
- **Naming Convention**: Tables named as `data_{filename}` (sanitized)

### Example Processing Flow

Upload `employees.json`:
```json
[
  {
    "id": 1,
    "name": "Alice Johnson",
    "department": "Engineering",
    "address": {
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA"
    }
  }
]
```

**Result**: Creates tables:
- `data_employees` (main table with employee data)
- `data_employees_address` (normalized address data)

## NeuraNotebook

NeuraNotebook transforms uploaded documents into interactive AI-powered workspaces. Users can generate summaries, extract key takeaways, view topic breakdowns and document statistics, and ask contextual questions about their documents.

### Architecture

```
Document (PDF / TXT / MD / DOCX)
  ↓
Text Extraction & Normalization
  ↓
Document Context & Stats
  ↓
Summary / Chunking Engine
  ↓
LLM Grounded Q&A
  ↓
Grounded Answer & Citations
```

### Features:
- **Multi-Format Extraction**: Parses PDF, TXT, MD, and DOCX files.
- **Structured Summaries**: Generates executive summary, bullet points, topic breakdown, and entity tags.
- **Grounded Q&A**: Answers questions using only document context and cites source chunks (`[Chunk 1]`, `[Chunk 3]`).
- **No Hallucination**: Responds explicitly with *"I couldn't find the answer in this document."* when information is absent.

## API Endpoints Documentation

### File Management
- `POST /api/upload` - Upload files with automatic categorization
- `GET /api/search` - Search files with filtering and pagination

### JSON Processing
- `POST /api/analyze-json` - Analyze JSON structure and determine storage type
- `POST /api/create-sql-table` - Create SQL tables from JSON schemas
- `POST /api/insert-sql-rows` - Insert JSON data into SQL tables
- `POST /api/process-json` - Complete JSON processing pipeline

### Data Querying
- `POST /api/query-table` - Query data from processed JSON tables
- `POST /api/infer-schema` - Infer schema from existing data

### Schema Management
- `POST /api/handle-schema-conflict` - Handle schema conflicts and versioning

### Analysis
- `POST /api/analyze` - General file analysis

## Screenshots

<!-- Screenshots will be added here -->

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
