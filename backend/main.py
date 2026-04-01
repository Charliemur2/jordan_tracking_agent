import os
import httpx
import json
import logging
import time
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import websockets
import asyncio
from typing import Optional

from getvocal import GetVocalClient
from voice import VoiceClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv(override=True)

STATIC_PHONE_KEY = os.getenv("GETVOCAL_STATIC_PHONE_KEY", "LEAD_PHONE_NUMBER")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CreateLeadRequest(BaseModel):
    phone_number: str
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    email_address: Optional[str] = ""

class CreateSessionRequest(BaseModel):
    phone_number: Optional[str] = None
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    email_address: Optional[str] = ""
    use_voice: bool = False
    lead_id: Optional[str] = None

class SessionResponse(BaseModel):
    session_id: Optional[str] = None
    conversation_id: Optional[str] = None
    ws_url: str
    lead_id: Optional[str] = None

client = GetVocalClient()

# Startup verification logs
from getvocal import COMPANY_ID, ASSISTANT_ID
logger.info(f"--- Application Startup Configuration ---")
logger.info(f"Using COMPANY_ID: {COMPANY_ID}")
logger.info(f"Using ASSISTANT_ID: {ASSISTANT_ID}")
logger.info(f"----------------------------------------")

def build_static_data(
    phone_number: Optional[str] = None,
    first_name: Optional[str] = "",
    last_name: Optional[str] = "",
    email_address: Optional[str] = "",
):
    static_data = {}

    if phone_number:
        static_data[STATIC_PHONE_KEY] = phone_number

    return static_data


def upstream_error_detail(error: httpx.HTTPStatusError):
    try:
        return error.response.json()
    except ValueError:
        return error.response.text

@app.get("/")
async def root():
    return {
        "message": "Welcome to the GetVocal Backend API",
        "docs": "/docs",
        "health": "/health"
    }

@app.post("/api/lead")
async def create_lead(request: CreateLeadRequest):
    try:
        lead_id = await client.create_lead(
            phone_number=request.phone_number,
            first_name=request.first_name,
            last_name=request.last_name,
            email_address=request.email_address,
            static_data=build_static_data(
                phone_number=request.phone_number,
                first_name=request.first_name,
                last_name=request.last_name,
                email_address=request.email_address,
            ),
        )
        return {"lead_id": lead_id}
    except httpx.HTTPStatusError as e:
        logger.error(f"Error creating lead: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=upstream_error_detail(e))
    except Exception as e:
        logger.error(f"Error creating lead: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/session", response_model=SessionResponse)
async def create_session(request: CreateSessionRequest):
    try:
        if request.lead_id:
            lead_id = request.lead_id
            logger.info(f"Using provided lead_id: {lead_id}")
        else:
            # 1. Create Lead with static_data for the agent
            start_time = time.time()
            lead_id = await client.create_lead(
                phone_number=request.phone_number,
                first_name=request.first_name,
                last_name=request.last_name,
                email_address=request.email_address,
                static_data=build_static_data(
                    phone_number=request.phone_number,
                    first_name=request.first_name,
                    last_name=request.last_name,
                    email_address=request.email_address,
                ),
            )
            lead_time = time.time() - start_time
            logger.info(f"Created lead: {lead_id} with static_data in {lead_time:.2f}s")

        # 2. Get Session
        start_time = time.time()
        session_data = await client.get_session_id(lead_id, use_voice=request.use_voice)
        session_time = time.time() - start_time
        
        if isinstance(session_data, tuple):
            session_id, conversation_id = session_data
        else:
            session_id = session_data
            conversation_id = None
            
        logger.info(f"Created session: {session_id}, conv: {conversation_id} in {session_time:.2f}s")

        ws_url = client.get_ws_url(session_id, conversation_id, request.use_voice)
        
        return SessionResponse(
            session_id=session_id,
            conversation_id=conversation_id,
            ws_url=ws_url,
            lead_id=lead_id
        )

    except httpx.HTTPStatusError as e:
        logger.error(f"Error creating session: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=upstream_error_detail(e))
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/call")
async def trigger_call(request: CreateSessionRequest):
    try:
        lead_id = request.lead_id
        
        # 1. Create Lead if it doesn't exist
        if not lead_id:
            logger.info("No lead_id provided for call, creating one...")
            lead_id = await client.create_lead(
                phone_number=request.phone_number,
                first_name=request.first_name,
                last_name=request.last_name,
                email_address=request.email_address,
                static_data=build_static_data(
                    phone_number=request.phone_number,
                    first_name=request.first_name,
                    last_name=request.last_name,
                    email_address=request.email_address,
                ),
                is_debug=False
            )
            logger.info(f"Created lead for call: {lead_id}")

        # 2. Trigger Outbound Call
        logger.info(f"Triggering outbound PSTN call for lead: {lead_id}")
        trigger_resp = await client.trigger_outbound_call(lead_id)
        
        # 3. Use standard chat session for Web UI (Version that works)
        # We don't try to sync with the PSTN call_id anymore to avoid "Session ID does not exist"
        logger.info(f"Using standard chat session for Web UI: {lead_id}")
        session_data = await client.get_session_id(lead_id, use_voice=False)
        
        if isinstance(session_data, tuple):
            session_id, conversation_id = session_data
        else:
            session_id = session_data
            conversation_id = None
            
        ws_url = client.get_ws_url(session_id, conversation_id, use_voice=False)
        
        logger.info(f"Returning stable chat session: {session_id}, conv: {conversation_id}")
        
        return {
            "status": "success", 
            "message": "Call triggered. Chat session provided for UI.", 
            "lead_id": lead_id,
            "session_id": session_id,
            "conversation_id": conversation_id,
            "ws_url": ws_url,
            "call_details": trigger_resp
        }

    except httpx.HTTPStatusError as e:
        logger.error(f"Error triggering call: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=upstream_error_detail(e))
    except Exception as e:
        logger.error(f"Error triggering call: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/test-voice")
async def test_voice_endpoint(request: CreateSessionRequest):
    """
    Endpoint for LOCAL testing only. 
    It will open the server's microphone and speakers.
    """
    try:
        lead_id = request.lead_id
        if not lead_id:
            lead_id = await client.create_lead(
                phone_number=request.phone_number or "+000000",
                first_name=request.first_name or "Tester",
                is_debug=False
            )
        
        session_id, conversation_id = await client.get_session_id(lead_id, use_voice=True)
        
        # We start this in the background so the HTTP request can return
        # But for a local test, the logs will appear in the terminal
        voice_client = VoiceClient()
        asyncio.create_task(voice_client.start_chat(session_id, conversation_id))
        
        return {
            "status": "success",
            "message": "Local VoiceClient started in background. Check server logs/hardware.",
            "session_id": session_id,
            "conversation_id": conversation_id
        }
    except httpx.HTTPStatusError as e:
        logger.error(f"Error in test-voice: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=upstream_error_detail(e))
    except Exception as e:
        logger.error(f"Error in test-voice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    return {"status": "ok"}
