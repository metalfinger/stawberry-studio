# Strawberry Studio

A visual workflow builder for creating AI agent pipelines using Google ADK (Agent Development Kit).

## Features

- Visual node-based workflow editor using React Flow
- Create and manage AI agent projects
- Design element trees with parent-child relationships
- AI-powered content generation for workflow elements
- Real-time WebSocket communication
- SQLite database for persistent storage

## Tech Stack

### Frontend
- React 19 with TypeScript
- Vite for build tooling
- React Flow (@xyflow/react) for node-based UI
- React Router for navigation
- Lucide React for icons

### Backend
- Python with FastAPI
- Google ADK (Agent Development Kit)
- SQLite with aiosqlite for async database operations
- WebSockets for real-time communication

## Prerequisites

- Python 3.10+
- Node.js 18+
- npm or yarn

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/strawberry-studio.git
cd strawberry-studio
```

### 2. Set up the backend

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Set up the frontend

```bash
cd frontend
npm install
```

### 4. Configure environment variables

Create a `.env` file in the root directory:

```env
GOOGLE_API_KEY=your_google_api_key_here
```

## Running the Application

### Option 1: Use the start script

```bash
chmod +x start.sh
./start.sh
```

### Option 2: Run manually

**Terminal 1 - Backend:**
```bash
source venv/bin/activate
cd backend
python -m uvicorn main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

## Project Structure

```
strawberry-studio/
├── backend/
│   ├── agents/          # AI agent definitions
│   ├── database/        # Database models and operations
│   ├── intelligence/    # AI intelligence services
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic services
│   ├── storage/         # File storage
│   ├── tools/           # ADK tool definitions
│   └── main.py          # FastAPI application entry
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   └── ...
│   └── package.json
├── requirements.txt     # Python dependencies
├── start.sh            # Startup script
└── README.md
```

## API Endpoints

- `GET /api/projects` - List all projects
- `POST /api/projects` - Create a new project
- `GET /api/projects/{id}` - Get project details
- `DELETE /api/projects/{id}` - Delete a project
- `GET /api/projects/{id}/elements` - Get project elements
- `POST /api/projects/{id}/elements` - Create an element
- `PUT /api/elements/{id}` - Update an element
- `DELETE /api/elements/{id}` - Delete an element

## License

MIT License
