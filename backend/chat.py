import asyncio
import requests
import websockets
import json
import logging
import os
from dotenv import load_dotenv

load_dotenv(override=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

COMPANY_ID = os.getenv("GETVOCAL_COMPANY_ID")
ASSISTANT_ID = os.getenv("GETVOCAL_ASSISTANT_ID")

API_KEY_ID = os.getenv("GETVOCAL_API_KEY_ID")
API_KEY_SECRET = os.getenv("GETVOCAL_API_KEY_SECRET")

BASE_URL = "https://nexus.production.getvocal.ai/v2/companies"
LOGIN_URL = "https://nexus.production.getvocal.ai/v1/auth/login"

#def get_access_token():
#    resp = requests.post(LOGIN_URL, json={"email": EMAIL, "password": PASSWORD})
#    resp.raise_for_status()
#    token = resp.json().get("access_token")
#    if not token:
#        raise Exception("Failed to retrieve access token")
#    return token

def create_lead(phone_number, first_name="", last_name="", email_address="", company_name="", customer_lead_id="", static_data=None, language="fr", source="nexus", is_debug=False):
    url = "https://nexus.production.getvocal.ai/v1/leads"
    headers = {
        "X-Client-Api-Key": API_KEY_ID,
        "X-Client-Api-Key-Secret": API_KEY_SECRET,
        "Content-Type": "application/json"
    }
    payload = {
        "items": [
            {
                "phone_number": phone_number,
                "first_name": first_name,
                "last_name": last_name,
                "email_address": email_address,
                "company_name": company_name,
                "customer_lead_id": customer_lead_id,
                "static_data": static_data or {},
                "language": language,
                "source": source,
                "is_debug": is_debug
            }
        ],
        "company_id": COMPANY_ID,
        "create_for_self": False,
        "source": source
    }

    logging.info(f"Creating lead with payload: {json.dumps(payload, indent=2)}")
    logging.info(f"Request URL: {url}")
    logging.info(f"Headers: {headers}")

    try:
        resp = requests.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        logging.info(f"Lead created successfully: {data}")
        if data.get("leads") and len(data["leads"]) > 0:
            return data["leads"][0]["id"]
        else:
            raise Exception("Failed to create lead: no lead ID returned")
    except requests.exceptions.HTTPError as e:
        logging.error(f"HTTP Error: {e}")
        logging.error(f"Response status: {resp.status_code}")
        logging.error(f"Response body: {resp.text}")
        raise

def get_session_id(lead_id):
    url = f"{BASE_URL}/{COMPANY_ID}/assistants/{ASSISTANT_ID}/session/{lead_id}?use_voice=false"
    headers = {"X-Client-Api-Key": API_KEY_ID, "X-Client-Api-Key-Secret": API_KEY_SECRET}

    logging.info(f"Getting session for lead_id: {lead_id}")
    logging.info(f"Request URL: {url}")

    try:
        resp = requests.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        logging.info(f"Session created successfully: {data}")
        return data["session_id"]
    except requests.exceptions.HTTPError as e:
        logging.error(f"HTTP Error: {e}")
        logging.error(f"Response status: {resp.status_code}")
        logging.error(f"Response body: {resp.text}")
        raise

async def chat(session_id):
    ws_url = f"wss://chat-engine.production.getvocal.ai/ws_doc_response?session_id={session_id}"
    logging.info(f"Connecting to WebSocket: {ws_url}")

    async with websockets.connect(ws_url) as ws:
        logging.info("WebSocket connected successfully")
        print("Connected. Type messages (Ctrl+C to quit).")

        async def receive():
            try:
                async for msg in ws:
                    try:
                        data = json.loads(msg)
                    except json.JSONDecodeError:
                        data = msg
                    print("\n", data, "\n> ", end="", flush=True)
            except websockets.exceptions.ConnectionClosed:
                logging.info("WebSocket connection closed")

        recv_task = asyncio.create_task(receive())
        try:
            while True:
                user_input = await asyncio.get_event_loop().run_in_executor(None, input, "> ")
                if user_input.strip():
                    logging.debug(f"Sending message: {user_input}")
                    await ws.send(json.dumps({"role": "user", "content": user_input}))
        except KeyboardInterrupt:
            print("\nExiting...")
        finally:
            recv_task.cancel()

if __name__ == "__main__":
    try:
        logging.info("Starting application...")

        # Create a new lead (customize these values as needed)
        lead_id = create_lead(
            phone_number="+3313414",  # Replace with actual phone number
            first_name="John",
            last_name="Doe",
            email_address="john.aa@example.com",
            is_debug=True
        )
        logging.info(f"Using lead ID: {lead_id}")

        session_id = get_session_id(lead_id)
        asyncio.run(chat(session_id))
    except Exception as e:
        logging.exception("Fatal error occurred")
        print(f"Error: {e}")