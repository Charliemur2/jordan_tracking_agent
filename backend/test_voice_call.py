import requests
import os
import json
from dotenv import load_dotenv

load_dotenv("/Users/charliemurcia/Desktop/Develop/agentOnPageTest/backend/.env")

COMPANY_ID = os.getenv("GETVOCAL_COMPANY_ID")
ASSISTANT_ID = os.getenv("GETVOCAL_ASSISTANT_ID")
API_KEY_ID = os.getenv("GETVOCAL_API_KEY_ID")
API_KEY_SECRET = os.getenv("GETVOCAL_API_KEY_SECRET")

BASE_URL = "https://nexus.production.getvocal.ai/v2/companies"
LEAD_URL = "https://nexus.production.getvocal.ai/v1/leads"

headers = {
    "X-Client-Api-Key": API_KEY_ID,
    "X-Client-Api-Key-Secret": API_KEY_SECRET,
    "Content-Type": "application/json"
}

def create_lead(phone_number):
    payload = {
        "items": [{"phone_number": phone_number, "first_name": "TestUser"}],
        "company_id": COMPANY_ID,
        "create_for_self": False,
        "source": "nexus"
    }
    resp = requests.post(LEAD_URL, headers=headers, json=payload)
    resp.raise_for_status()
    return resp.json()["leads"][0]["id"]

def trigger_voice_session(lead_id):
    url = f"{BASE_URL}/{COMPANY_ID}/assistants/{ASSISTANT_ID}/session/{lead_id}?use_voice=true"
    print(f"Calling GET {url}")
    resp = requests.get(url, headers=headers)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")
    return resp.json()

if __name__ == "__main__":
    try:
        # Use a dummy number or a real one if you want to test
        # Note: I shouldn't use the user's number here without permission, but I need to test the API response.
        # I'll use a placeholder and see if the API returns 200.
        lead_id = create_lead("+1234567890")
        print(f"Lead created: {lead_id}")
        trigger_voice_session(lead_id)
    except Exception as e:
        print(f"Error: {e}")
