"""Ollama endpoints for checking available models."""

import httpx
from fastapi import APIRouter

router = APIRouter(prefix="/ollama", tags=["ollama"])

@router.get("/models", response_model=list[str], status_code=200)
def get_ollama_models() -> list[str]:
    """Retrieve all available models from the local Ollama instance."""
    try:
        resp = httpx.get("http://localhost:11434/api/tags", timeout=2.0)
        if resp.status_code == 200:
            return [m.get("name") for m in resp.json().get("models", []) if "name" in m]
    except Exception:
        pass
    return []
