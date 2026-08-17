from __future__ import annotations

import asyncio
import os
import re
import uuid
from contextlib import asynccontextmanager
from typing import Annotated, AsyncIterator

import firebase_admin
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel, Field

from atomic_habits_agent.agent import mcp_toolset, root_agent


APP_NAME = "atomic_habits_agent"
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "bigquery-semantic-search")
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
SESSION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

if not firebase_admin._apps:
    firebase_admin.initialize_app(options={"projectId": PROJECT_ID})

session_service = InMemorySessionService()
runner = Runner(
    agent=root_agent,
    app_name=APP_NAME,
    session_service=session_service,
)
security = HTTPBearer(auto_error=False)


class ChatRequest(BaseModel):
    message: str = Field(min_length=2, max_length=2_000)
    session_id: str | None = Field(default=None, max_length=128)


class ChatResponse(BaseModel):
    answer: str
    session_id: str


async def authenticated_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(security),
    ],
) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google sign-in is required.",
        )

    try:
        decoded = await asyncio.to_thread(
            firebase_auth.verify_id_token,
            credentials.credentials,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired sign-in token.",
        ) from exc

    if not decoded.get("uid"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The sign-in token does not contain a user ID.",
        )

    return decoded


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await mcp_toolset.close()


app = FastAPI(
    title="Atomic Habits ADK Chat API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "healthy"}


@app.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    user: Annotated[dict, Depends(authenticated_user)],
) -> ChatResponse:
    user_id = str(user["uid"])
    session_id = request.session_id or uuid.uuid4().hex

    if not SESSION_ID_PATTERN.fullmatch(session_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session ID.",
        )

    session = await session_service.get_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )

    if session is None:
        await session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )

    message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=request.message.strip())],
    )

    final_answer = ""

    try:
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=message,
        ):
            if not event.is_final_response() or not event.content:
                continue

            for part in event.content.parts or []:
                if part.text:
                    final_answer += part.text
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The agent could not complete the request.",
        ) from exc

    if not final_answer.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The agent returned no final answer.",
        )

    return ChatResponse(
        answer=final_answer.strip(),
        session_id=session_id,
    )
