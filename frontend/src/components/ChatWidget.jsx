import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Mic, MicOff, Send, X } from 'lucide-react';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:8000' : '')
).replace(/\/$/, '');
const VOICE_SAMPLE_RATE = 16000;
const VOICE_BUFFER_SIZE = 4096;
const INITIAL_FORM_MESSAGE = {
  role: 'assistant',
  content: 'Welcome to Jordan Electronics Support. Please share your details to track your delivery or ask a question.',
};

const createEmptyLead = () => ({
  name: '',
  phone: '',
  email: '',
});

const decodeBase64Audio = (base64Audio) => {
  const binary = window.atob(base64Audio);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

const pcm16ToFloat32 = (buffer) => {
  const pcm16 = new Int16Array(buffer);
  const float32 = new Float32Array(pcm16.length);

  for (let index = 0; index < pcm16.length; index += 1) {
    float32[index] = pcm16[index] / 32768;
  }

  return float32;
};

const downsampleToInt16 = (inputBuffer, inputSampleRate, outputSampleRate) => {
  if (!inputBuffer?.length) {
    return new ArrayBuffer(0);
  }

  if (inputSampleRate === outputSampleRate) {
    const pcm16 = new Int16Array(inputBuffer.length);

    for (let index = 0; index < inputBuffer.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, inputBuffer[index]));
      pcm16[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    return pcm16.buffer;
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(inputBuffer.length / sampleRateRatio);
  const pcm16 = new Int16Array(outputLength);
  let inputOffset = 0;

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const nextInputOffset = Math.round((outputIndex + 1) * sampleRateRatio);
    let accumulator = 0;
    let count = 0;

    for (let index = inputOffset; index < nextInputOffset && index < inputBuffer.length; index += 1) {
      accumulator += inputBuffer[index];
      count += 1;
    }

    const sample = Math.max(-1, Math.min(1, count > 0 ? accumulator / count : 0));
    pcm16[outputIndex] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    inputOffset = nextInputOffset;
  }

  return pcm16.buffer;
};

const extractAssistantText = (payload) => {
  if (typeof payload === 'string') {
    return payload;
  }

  return (
    payload.content ||
    payload.text ||
    payload.message ||
    payload.transcript ||
    payload.response ||
    payload.responses?.[0]?.text ||
    payload.item?.content ||
    payload.data?.content ||
    ''
  );
};

const inferMessageRole = (payload, fallbackRole = 'assistant') => {
  if (!payload || typeof payload === 'string') {
    return fallbackRole;
  }

  const candidates = [
    payload.role,
    payload.speaker,
    payload.sender,
    payload.author,
    payload.participant,
    payload.source,
    payload.event?.speaker,
    payload.event?.role,
    payload.data?.role,
    payload.data?.speaker,
    payload.item?.role,
    payload.item?.speaker,
    payload.message?.role,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  if (candidates.some((value) => ['user', 'human', 'customer', 'client', 'caller'].includes(value))) {
    return 'user';
  }

  if (candidates.some((value) => ['assistant', 'agent', 'ai', 'bot', 'system'].includes(value))) {
    return 'assistant';
  }

  return fallbackRole;
};

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState('form');
  const [leadId, setLeadId] = useState(null);
  const [leadData, setLeadData] = useState(createEmptyLead());
  const [useVoice, setUseVoice] = useState(false);
  const [messages, setMessages] = useState([INITIAL_FORM_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [statusText, setStatusText] = useState('');
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const micSourceRef = useRef(null);
  const processorRef = useRef(null);
  const silentGainRef = useRef(null);
  const nextPlaybackTimeRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (step === 'chat') {
      scrollToBottom();
    }
  }, [messages, isOpen, step]);

  const appendMessage = (role, content, dedupe = true) => {
    if (!content) {
      return;
    }

    setMessages((previous) => {
      const lastMessage = previous[previous.length - 1];
      if (dedupe && lastMessage && lastMessage.role === role && lastMessage.content === content) {
        return previous;
      }

      return [...previous, { role, content }];
    });
  };

  const closeSocket = () => {
    const socket = socketRef.current;

    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close();
    }

    socketRef.current = null;
  };

  const stopVoiceResources = async () => {
    const processor = processorRef.current;
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
      processorRef.current = null;
    }

    const micSource = micSourceRef.current;
    if (micSource) {
      micSource.disconnect();
      micSourceRef.current = null;
    }

    const silentGain = silentGainRef.current;
    if (silentGain) {
      silentGain.disconnect();
      silentGainRef.current = null;
    }

    const mediaStream = mediaStreamRef.current;
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    const audioContext = audioContextRef.current;
    if (audioContext && audioContext.state !== 'closed') {
      await audioContext.close();
    }

    audioContextRef.current = null;
    nextPlaybackTimeRef.current = 0;
  };

  const teardownRealtimeSession = async () => {
    closeSocket();
    await stopVoiceResources();
    setIsVoiceRecording(false);
    setStatusText('');
  };

  useEffect(() => {
    return () => {
      void teardownRealtimeSession();
    };
  }, []);

  const resetWidget = async () => {
    await teardownRealtimeSession();
    setIsOpen(false);
    setStep('form');
    setLeadId(null);
    setLeadData(createEmptyLead());
    setUseVoice(false);
    setMessages([INITIAL_FORM_MESSAGE]);
    setInput('');
    setIsLoading(false);
    setSession(null);
  };

  const schedulePlayback = (buffer) => {
    const audioContext = audioContextRef.current;
    if (!audioContext || buffer.byteLength === 0) {
      return;
    }

    const float32 = pcm16ToFloat32(buffer);
    const audioBuffer = audioContext.createBuffer(1, float32.length, VOICE_SAMPLE_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    const startTime = Math.max(audioContext.currentTime, nextPlaybackTimeRef.current || audioContext.currentTime);
    source.start(startTime);
    nextPlaybackTimeRef.current = startTime + audioBuffer.duration;
    source.onended = () => source.disconnect();
  };

  const createSocket = (sessionData) => {
    const socket = new WebSocket(sessionData.ws_url);
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;
    return socket;
  };

  const attachChatHandlers = (socket) => {
    return new Promise((resolve, reject) => {
      socket.onopen = () => {
        setStatusText('Chat session connected');
        resolve();
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') {
          return;
        }

        try {
          const payload = JSON.parse(event.data);
          if (payload.status === 'connected' || payload.node_settings) {
            return;
          }

          const content = extractAssistantText(payload);
          appendMessage(inferMessageRole(payload), content);
        } catch {
          appendMessage('assistant', event.data);
        } finally {
          setIsLoading(false);
        }
      };

      socket.onerror = () => {
        setStatusText('Chat connection failed');
        setIsLoading(false);
        reject(new Error('Failed to connect chat WebSocket'));
      };

      socket.onclose = () => {
        setStatusText('Chat session closed');
        setIsLoading(false);
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
      };
    });
  };

  const startVoiceCapture = async (socket) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone access.');
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const BrowserAudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new BrowserAudioContext();
    await audioContext.resume();

    const micSource = audioContext.createMediaStreamSource(mediaStream);
    const processor = audioContext.createScriptProcessor(VOICE_BUFFER_SIZE, 1, 1);
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }

      const inputChannel = event.inputBuffer.getChannelData(0);
      const pcmBuffer = downsampleToInt16(inputChannel, audioContext.sampleRate, VOICE_SAMPLE_RATE);

      if (pcmBuffer.byteLength > 0) {
        socket.send(pcmBuffer);
      }
    };

    micSource.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    mediaStreamRef.current = mediaStream;
    audioContextRef.current = audioContext;
    micSourceRef.current = micSource;
    processorRef.current = processor;
    silentGainRef.current = silentGain;
    nextPlaybackTimeRef.current = audioContext.currentTime;
    setIsVoiceRecording(true);
  };

  const attachVoiceHandlers = (socket) => {
    return new Promise((resolve, reject) => {
      socket.onopen = async () => {
        try {
          await startVoiceCapture(socket);
          appendMessage('assistant', 'Voice agent connected. Start speaking when you are ready.');
          setStatusText('Voice agent live');
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      socket.onmessage = (event) => {
        try {
          if (event.data instanceof ArrayBuffer) {
            schedulePlayback(event.data);
            return;
          }

          if (event.data instanceof Blob) {
            void event.data.arrayBuffer().then(schedulePlayback);
            return;
          }

          const payload = JSON.parse(event.data);
          if (payload.audio) {
            schedulePlayback(decodeBase64Audio(payload.audio));
          }

          const content = extractAssistantText(payload);
          appendMessage(inferMessageRole(payload), content);
        } catch {
          if (typeof event.data === 'string') {
            appendMessage('assistant', event.data);
          }
        } finally {
          setIsLoading(false);
        }
      };

      socket.onerror = () => {
        setStatusText('Voice connection failed');
        setIsLoading(false);
        reject(new Error('Failed to connect voice WebSocket'));
      };

      socket.onclose = () => {
        setStatusText('Voice session closed');
        setIsLoading(false);
        setIsVoiceRecording(false);
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        void stopVoiceResources();
      };
    });
  };

  const startSession = async (mode) => {
    setIsLoading(true);
    setUseVoice(mode === 'voice');
    setStatusText(mode === 'voice' ? 'Preparing voice agent...' : 'Preparing chat...');

    try {
      await teardownRealtimeSession();

      const response = await fetch(`${API_BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          phone_number: leadData.phone,
          first_name: leadData.name,
          email_address: leadData.email,
          use_voice: mode === 'voice',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const sessionData = await response.json();
      setSession(sessionData);
      if (sessionData.lead_id) {
        setLeadId(sessionData.lead_id);
      }

      setStep('chat');
      setMessages([
        {
          role: 'assistant',
          content:
            mode === 'voice'
              ? 'Connecting your voice support agent...'
              : 'Support session ready. Ask about order status, deliveries, or tech specs.',
        },
      ]);

      const socket = createSocket(sessionData);
      if (mode === 'voice') {
        await attachVoiceHandlers(socket);
      } else {
        await attachChatHandlers(socket);
      }
    } catch (error) {
      console.error('Error starting session:', error);
      appendMessage('assistant', error.message || 'Unable to start the assistant right now.');
      setStatusText('Connection error');
      await teardownRealtimeSession();
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormContinue = () => {
    setStep('choice');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!input.trim() || isLoading) {
      return;
    }

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendMessage('assistant', 'The chat session is not connected anymore. Start a new session to continue.');
      return;
    }

    const userMessage = input.trim();
    setInput('');
    appendMessage('user', userMessage, false);
    setIsLoading(true);
    socket.send(JSON.stringify({ role: 'user', content: userMessage }));
  };

  const handleStopVoiceSession = async () => {
    await teardownRealtimeSession();
    setUseVoice(false);
    setSession(null);
    setStep('choice');
    setIsLoading(false);
    setStatusText('Voice session stopped');
  };

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    void resetWidget();
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-black text-white shadow-2xl transition-all duration-300 hover:scale-110 ${isOpen ? 'pointer-events-none scale-0 opacity-0' : 'scale-100 opacity-100'}`}
      >
        <MessageSquare className="h-6 w-6" />
      </button>

      <div className={`fixed bottom-6 right-6 z-50 flex h-[600px] max-h-[80vh] w-[90vw] flex-col rounded-2xl border border-gray-100 bg-white shadow-2xl transition-all duration-300 md:w-[400px] ${isOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-10 opacity-0'}`}>
        <div className="flex items-center justify-between rounded-t-2xl border-b border-gray-100 bg-white p-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-purple-500 text-white">
              <span className="text-xs font-bold">AI</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Jordan Support</h3>
              <p className="flex items-center text-xs font-medium text-green-500">
                <span className="mr-1 h-1.5 w-1.5 rounded-full bg-green-500"></span>
                {statusText || 'Online'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-4">
          {step === 'form' && (
            <div className="my-auto space-y-4 p-2">
              <h4 className="text-center text-lg font-bold text-gray-800">Track your Order</h4>
              <p className="pb-2 text-center text-sm text-gray-500">Enter your info to start a support session with our AI assistant.</p>
              <input
                type="text"
                placeholder="Full Name"
                className="w-full rounded-xl border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-black/5"
                value={leadData.name}
                onChange={(event) => setLeadData((previous) => ({ ...previous, name: event.target.value }))}
              />
              <input
                type="tel"
                placeholder="Phone Number (e.g. +123456789)"
                className="w-full rounded-xl border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-black/5"
                value={leadData.phone}
                onChange={(event) => setLeadData((previous) => ({ ...previous, phone: event.target.value }))}
              />
              <input
                type="email"
                placeholder="Email Address (optional)"
                className="w-full rounded-xl border border-gray-200 bg-white p-3 outline-none focus:ring-2 focus:ring-black/5"
                value={leadData.email}
                onChange={(event) => setLeadData((previous) => ({ ...previous, email: event.target.value }))}
              />
              <button
                disabled={!leadData.name || !leadData.phone}
                onClick={handleFormContinue}
                className="w-full rounded-xl bg-black py-4 font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          )}

          {step === 'choice' && (
            <div className="my-auto space-y-6 p-4 text-center">
              <h4 className="text-xl font-bold text-gray-800">Choose support mode</h4>
              <p className="text-gray-500">Both options connect you to Jordan Support for your account.</p>
              <div className="grid grid-cols-1 gap-4 pt-4">
                <button
                  onClick={() => void startSession('chat')}
                  className="group flex items-center space-x-4 rounded-2xl border-2 border-transparent bg-white p-6 text-left shadow-sm transition-all hover:border-black"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-black group-hover:text-white">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="leading-tight font-bold text-gray-900">Support Chat</p>
                    <p className="text-xs text-gray-500">Text-based tracking and support</p>
                  </div>
                </button>
                <button
                  onClick={() => void startSession('voice')}
                  className="group flex items-center space-x-4 rounded-2xl border-2 border-transparent bg-white p-6 text-left shadow-sm transition-all hover:border-black"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-black group-hover:text-white">
                    <Mic className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="leading-tight font-bold text-gray-900">Voice Assistant</p>
                    <p className="text-xs text-gray-500">Speak directly with our support agent</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {step === 'chat' && (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl p-3.5 text-sm leading-relaxed ${message.role === 'user' ? 'rounded-br-none bg-black text-white' : 'rounded-bl-none border border-gray-100 bg-white text-gray-800 shadow-sm'}`}>
                    {message.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-none border border-gray-100 bg-white p-4 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {step === 'chat' && !useVoice && (
          <div className="rounded-b-2xl border-t border-gray-100 bg-white p-4">
            <form onSubmit={handleSubmit} className="relative">
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about your order..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 pr-12 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-2 rounded-lg bg-black p-1.5 text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}

        {step === 'chat' && useVoice && (
          <div className="rounded-b-2xl border-t border-gray-100 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <span className={`h-2.5 w-2.5 rounded-full ${isVoiceRecording ? 'animate-pulse bg-red-500' : 'bg-gray-300'}`}></span>
                  {isVoiceRecording ? 'Recording from microphone' : 'Voice session idle'}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {isVoiceRecording ? 'Speak naturally. The agent replies on the left.' : 'Start a new voice session when you are ready.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleStopVoiceSession()}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                <MicOff className="h-4 w-4" />
                Stop
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ChatWidget;
