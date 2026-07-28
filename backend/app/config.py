from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Server side configuration. Secrets are read from the environment and never
    serialised back to a client; the browser only ever sees the results of the
    calls this service makes on its behalf.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    spotify_client_id: str = ""
    spotify_client_secret: str = ""

    allowed_origins: str = "http://localhost:5173"

    work_dir: Path = Path("./.work")
    file_ttl_seconds: int = 3600
    max_upload_mb: int = 60

    max_concurrent_jobs: int = 1
    demucs_model: str = "htdemucs"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def spotify_configured(self) -> bool:
        return bool(self.spotify_client_id and self.spotify_client_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
