from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="MCP Games Narrative AI",
    description="AI-powered narrative generation for CYOA experiences",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class GenerateSceneRequest(BaseModel):
    story_id: str
    user_context: Dict
    previous_choice: Optional[str] = None

class GenerateChoicesRequest(BaseModel):
    story_id: str
    current_scene: str
    user_context: Dict

class NarrativeResponse(BaseModel):
    text: str
    metadata: Dict

# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "narrative-ai"}

# Generate scene
@app.post("/api/generate/scene", response_model=NarrativeResponse)
async def generate_scene(request: GenerateSceneRequest):
    # TODO: Implement LLM-based scene generation
    return NarrativeResponse(
        text="Scene generation endpoint - implementation pending",
        metadata={
            "story_id": request.story_id,
            "model": "gpt-4-turbo-preview",
            "tokens_used": 0
        }
    )

# Generate choices
@app.post("/api/generate/choices")
async def generate_choices(request: GenerateChoicesRequest):
    # TODO: Implement choice generation logic
    return {
        "choices": [
            {"id": "choice_1", "text": "Choice 1 - implementation pending"},
            {"id": "choice_2", "text": "Choice 2 - implementation pending"},
            {"id": "choice_3", "text": "Choice 3 - implementation pending"},
        ],
        "metadata": {"story_id": request.story_id}
    }

# Get story state
@app.get("/api/story/{story_id}")
async def get_story_state(story_id: str):
    # TODO: Implement story state retrieval
    return {
        "story_id": story_id,
        "state": {},
        "message": "Story state endpoint - implementation pending"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
