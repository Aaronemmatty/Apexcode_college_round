"""Application configuration loaded from environment variables with defaults."""

import os
from dataclasses import dataclass


@dataclass
class Settings:
    CORS_ORIGINS: str = os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177"
    )
    APP_NAME: str = os.getenv("APP_NAME", "AgentBreak")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./agentbreak.db")

    @property
    def cors_origins_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.CORS_ORIGINS.split(",")
            if origin.strip()
        ]


settings = Settings()