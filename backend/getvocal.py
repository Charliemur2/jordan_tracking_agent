import asyncio
import logging
import json
import httpx
import os
from dotenv import load_dotenv

load_dotenv(override=True)

# Configuration
COMPANY_ID = os.getenv("GETVOCAL_COMPANY_ID")
ASSISTANT_ID = os.getenv("GETVOCAL_ASSISTANT_ID")
API_KEY_ID = os.getenv("GETVOCAL_API_KEY_ID")
API_KEY_SECRET = os.getenv("GETVOCAL_API_KEY_SECRET")

BASE_URL = "https://nexus.production.getvocal.ai/v2/companies"
LEAD_URL = "https://nexus.production.getvocal.ai/v1/leads"

logger = logging.getLogger(__name__)

class GetVocalClient:
    def __init__(self):
        self.company_id = COMPANY_ID
        self.assistant_id = ASSISTANT_ID
        self.headers = {
            "X-Client-Api-Key": API_KEY_ID,
            "X-Client-Api-Key-Secret": API_KEY_SECRET,
            "Content-Type": "application/json"
        }

    async def create_lead(self, phone_number, first_name="", last_name="", email_address="", company_name="", customer_lead_id="", static_data=None, language="es", source="nexus", is_debug=False):
        lead_item = {
            "phone_number": phone_number,
            "static_data": static_data or {},
            "language": language,
            "source": source,
            "is_debug": is_debug
        }
        
        # Add optional fields only if they are not empty
        if first_name: lead_item["first_name"] = first_name
        if last_name: lead_item["last_name"] = last_name
        if email_address: lead_item["email_address"] = email_address
        if company_name: lead_item["company_name"] = company_name
        if customer_lead_id: lead_item["customer_lead_id"] = customer_lead_id

        payload = {
            "items": [lead_item],
            "company_id": COMPANY_ID,
            "create_for_self": False,
            "source": source
        }

        logger.info(f"Creating lead with payload: {json.dumps(payload, indent=2)}")
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(LEAD_URL, headers=self.headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                logger.info(f"Lead created successfully: {data}")
                if data.get("leads") and len(data["leads"]) > 0:
                    return data["leads"][0]["id"]
                else:
                    raise Exception("Failed to create lead: no lead ID returned")
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP Error: {e}")
                logger.error(f"Response status: {e.response.status_code}")
                logger.error(f"Response body: {e.response.text}")
                raise

    async def get_session_id(self, lead_id, use_voice=False):
        url = f"{BASE_URL}/{COMPANY_ID}/assistants/{ASSISTANT_ID}/session/{lead_id}?use_voice={str(use_voice).lower()}"
        
        logger.info(f"Getting session for lead_id: {lead_id}")
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=self.headers)
                resp.raise_for_status()
                data = resp.json()
                logger.info(f"Session created successfully: {data}")
                # Return tuple based on what's available
                return data.get("session_id"), data.get("conversation_id")
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP Error: {e}")
                logger.error(f"Response status: {e.response.status_code}")
                logger.error(f"Response body: {e.response.text}")
                raise

    async def get_lead_calls(self, lead_id: str, count: int = 5):
        """
        Retrieves call history/recordings for a specific lead.
        """
        url = f"https://nexus.production.getvocal.ai/v2/companies/{self.company_id}/leads/{lead_id}/calls/recording?count={count}"
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, headers=self.headers)
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                logger.error(f"Failed to fetch lead calls: {e}")
                return []


    async def trigger_outbound_call(self, lead_id):
        """
        Officially trigger a PSTN outbound call using the /v1/calls/trigger endpoint.
        """
        url = "https://nexus.production.getvocal.ai/v1/calls/trigger"
        payload = {
            "lead_id": lead_id,
            "assistant_id": self.assistant_id,
            "is_debug": False
        }
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, headers=self.headers, json=payload)
                
                if resp.status_code == 400:
                    logger.warning(f"PSTN trigger 400 Error: {resp.text}")
                    if "already call in queue" in resp.text:
                        logger.warning("Attempting to recover existing call_id.")
                        calls = await self.get_lead_calls(lead_id)
                        if calls and isinstance(calls, list) and len(calls) > 0:
                            return calls[0]
                    return resp.json()
                
                resp.raise_for_status()
                return resp.json()
                
            except httpx.HTTPStatusError as e:
                logger.error(f"Failed to trigger PSTN call. Status: {e.response.status_code}, Body: {e.response.text}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error triggering PSTN call: {e}")
                raise

    def get_ws_url(self, session_id, conversation_id=None, use_voice=False):
        if use_voice and conversation_id:
             return f"wss://transcribe-audio.production.getvocal.ai/listen/internal/{conversation_id}?session_id={session_id}"
        else:
             return f"wss://chat-engine.production.getvocal.ai/ws_doc_response?session_id={session_id}"
