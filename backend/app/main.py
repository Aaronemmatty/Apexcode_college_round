"""FastAPI application entry point for AgentBreak."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.health import router as health_router
from app.api.runs import router as runs_router
from app.api.scenarios import router as scenarios_router
from app.api.trials import router as trials_router
from app.api.compare import router as compare_router
from app.api.campaigns import router as campaigns_router
from app.api.custom_attack import router as custom_attack_router
from app.config import settings
from app.db.session import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context: initialize database on startup."""
    init_db()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="AgentBreak: Reproducible security-testing harness for tool-using AI agents.",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Predictable error format handlers
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": str(exc.detail) if exc.detail else "HTTP Error",
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": str(exc),
            }
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Internal server error",
            }
        },
    )


# Include routers under /api
app.include_router(health_router, prefix="/api")
app.include_router(scenarios_router, prefix="/api")
app.include_router(runs_router, prefix="/api")
app.include_router(trials_router, prefix="/api")
app.include_router(compare_router, prefix="/api")
app.include_router(campaigns_router, prefix="/api")
app.include_router(custom_attack_router, prefix="/api")
