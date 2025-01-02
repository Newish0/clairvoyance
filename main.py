import uvicorn
from fastapi import FastAPI

from app.core.config import settings
from app.api.routes import router
from fastapi.middleware.cors import CORSMiddleware



app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.PROJECT_DESCRIPTION,
    version=settings.PROJECT_VERSION,
)

origins = ["*"] # HACK: Allow all CORS for now

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000) 