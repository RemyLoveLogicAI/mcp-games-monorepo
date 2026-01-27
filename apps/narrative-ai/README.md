# Narrative AI 🤖

FastAPI service for AI-powered narrative generation using MCP context.

## Features

- Dynamic story generation with LLM integration
- Context-aware narrative personalization
- Character personality modeling
- Plot branching and consequence tracking
- Narrative consistency validation
- Multi-provider support (OpenAI, Anthropic)

## Development

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload
```

Runs on `http://localhost:8000`

## API Endpoints

### Narrative Generation
- `POST /api/generate/scene` - Generate next story scene
- `POST /api/generate/choices` - Generate choice options
- `POST /api/generate/consequence` - Generate consequence text

### Story Management
- `GET /api/story/:storyId` - Get story state
- `POST /api/story/validate` - Validate narrative consistency

## Environment Variables

Create a `.env` file:

```env
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
DEFAULT_MODEL=gpt-4-turbo-preview
```
