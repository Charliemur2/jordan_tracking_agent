import asyncio
import requests
import websockets
import json
import logging
import sounddevice as sd
import numpy as np
import base64
import os
from dotenv import load_dotenv

load_dotenv(override=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Audio configuration - Adjusted for better compatibility
SAMPLE_RATE = 24000  # Try 24000 or 16000
CHANNELS = 1
DTYPE = np.float32
CHUNK_SIZE = 2048    # Increased buffer to prevent cuts

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

from getvocal import GetVocalClient

class VoiceClient:
    def __init__(self, sample_rate=SAMPLE_RATE, channels=CHANNELS, dtype=DTYPE, chunk_size=CHUNK_SIZE):
        self.sample_rate = sample_rate
        self.channels = channels
        self.dtype = dtype
        self.chunk_size = chunk_size
        self.audio_queue = asyncio.Queue()
        self.playback_queue = asyncio.Queue()

    def audio_callback(self, indata, frames, time, status):
        """Callback for microphone input."""
        if status:
            logging.warning(f"Audio input status: {status}")
        self.audio_queue.put_nowait(indata.copy())

    def playback_callback(self, outdata, frames, time, status):
        """Callback for speaker output."""
        try:
            chunk = self.playback_queue.get_nowait()
            if len(chunk) < frames:
                padded = np.zeros((frames, self.channels), dtype=self.dtype)
                padded[:len(chunk)] = chunk
                outdata[:] = padded
            else:
                outdata[:] = chunk[:frames]
        except Exception:
            # Output silence if no data in queue
            outdata[:] = np.zeros((frames, self.channels), dtype=self.dtype)

    async def send_audio_loop(self, ws):
        """Continuously sends mic audio to the WebSocket."""
        try:
            while True:
                chunk = await self.audio_queue.get()
                # Clip signal to prevent distortion before conversion
                clipped = np.clip(chunk, -1.0, 1.0)
                # Convert float32 [-1, 1] to int16 [-32768, 32767]
                audio_bytes = (clipped * 32767.0).astype(np.int16).tobytes()
                await ws.send(audio_bytes)
        except websockets.ConnectionClosed:
            logging.info("WebSocket closed during audio send")
        except Exception as e:
            logging.error(f"Error in send_audio_loop: {e}")

    async def receive_loop(self, ws):
        """Continuously receives audio/messages from the WebSocket."""
        try:
            async for msg in ws:
                if isinstance(msg, bytes):
                    # Raw audio data from API (int16) -> float32
                    raw_audio = np.frombuffer(msg, dtype=np.int16).reshape(-1, self.channels)
                    audio_array = raw_audio.astype(self.dtype) / 32767.0
                    await self.playback_queue.put(audio_array)
                else:
                    try:
                        data = json.loads(msg)
                        if "audio" in data:
                            audio_bytes = base64.b64decode(data["audio"])
                            raw_audio = np.frombuffer(audio_bytes, dtype=np.int16).reshape(-1, self.channels)
                            audio_array = raw_audio.astype(self.dtype) / 32767.0
                            await self.playback_queue.put(audio_array)
                        else:
                            text = data.get('text', '')
                            if text:
                                logging.info(f"Received text: {text}")
                                print(f"\nAssistant: {text}")
                    except json.JSONDecodeError:
                        logging.info(f"Received non-JSON: {msg}")
                        print(f"\nAssistant: {msg}")
        except websockets.ConnectionClosed:
            logging.info("WebSocket connection closed")
        except Exception as e:
            logging.error(f"Error in receive_loop: {e}")

    async def start_chat(self, session_id, conversation_id):
        """Main entry point for local voice chat."""
        ws_url = f"wss://transcribe-audio.production.getvocal.ai/listen/internal/{conversation_id}?session_id={session_id}"
        logging.info(f"Connecting to WebSocket: {ws_url}")

        async with websockets.connect(ws_url) as ws:
            logging.info("WebSocket connected successfully")
            print("Voice chat connected. Speak into your microphone (Ctrl+C to quit).")

            # Input stream (microphone)
            input_stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                dtype=self.dtype,
                blocksize=self.chunk_size,
                callback=self.audio_callback
            )
            
            # Output stream for playback (speakers)
            output_stream = sd.OutputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                dtype=self.dtype,
                blocksize=self.chunk_size,
                callback=self.playback_callback
            )

            with input_stream, output_stream:
                logging.info("Audio streams active")
                try:
                    await asyncio.gather(
                        self.send_audio_loop(ws),
                        self.receive_loop(ws)
                    )
                except KeyboardInterrupt:
                    print("\nExiting...")
                except Exception as e:
                    logging.error(f"Chat execution error: {e}")

async def main():
    logging.info("Starting local voice chat client...")
    
    auth_client = GetVocalClient()
    
    try:
        # 1. Create a lead
        lead_id = await auth_client.create_lead(
            phone_number="+3313414",  # Replace with actual
            first_name="Test User",
            is_debug=True
        )
        logging.info(f"Using lead ID: {lead_id}")

        # 2. Get session
        session_id, conversation_id = await auth_client.get_session_id(lead_id, use_voice=True)
        logging.info(f"Session ID: {session_id}, Conversation ID: {conversation_id}")

        # 3. Start voice client
        voice_client = VoiceClient()
        await voice_client.start_chat(session_id, conversation_id)
        
    except Exception as e:
        logging.exception("Fatal error occurred")
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())