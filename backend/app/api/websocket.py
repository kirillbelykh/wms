from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.app.core.config import settings
from backend.app.core.database import AsyncSessionLocal
from backend.app.core.logging import get_logger
from backend.app.core.security import decode_access_token
from backend.app.repositories.user import get_user_by_id
from backend.app.services.push import send_push_notifications

router = APIRouter()
logger = get_logger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("WebSocket client connected. Active connections: %s", len(self.active_connections))

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info("WebSocket client disconnected. Active connections: %s", len(self.active_connections))

    async def broadcast(self, event: str, data: dict) -> None:
        if not self.active_connections:
            return

        message = json.dumps({"event": event, "data": data})
        disconnected: list[WebSocket] = []

        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                logger.exception("Failed to send WebSocket message")
                disconnected.append(connection)

        for connection in disconnected:
            self.disconnect(connection)


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    payload = decode_access_token(token) if token else None
    user_id = payload.get("sub") if payload else None
    if user_id is None:
        await websocket.accept()
        await websocket.send_text(json.dumps({"error": "Invalid token"}))
        await websocket.close(code=1008)
        return

    async with AsyncSessionLocal() as session:
        user = await get_user_by_id(session, int(user_id))
        if user is None or not user.is_active:
            await websocket.accept()
            await websocket.send_text(json.dumps({"error": "User not found or inactive"}))
            await websocket.close(code=1008)
            return

        await manager.connect(websocket)
        await websocket.send_text(
            json.dumps(
                {
                    "event": "connected",
                    "data": {"user_id": user_id, "role": user.role},
                }
            )
        )

        try:
            while True:
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_text("pong")
                else:
                    await websocket.send_text(json.dumps({"echo": data}))
        except WebSocketDisconnect:
            manager.disconnect(websocket)
        except Exception:
            logger.exception("Unexpected WebSocket error")
            manager.disconnect(websocket)


async def notify_all(event: str, data: dict) -> None:
    await manager.broadcast(event, data)
    if not settings.web_push_disabled:
        asyncio.create_task(send_push_notifications(event, data))
