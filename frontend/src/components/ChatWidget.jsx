import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send, X } from 'lucide-react';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:8000' : '')
).replace(/\/$/, '');

const DUMMY_LEAD_NAME = 'ABC_DUMMY_LEAD';
const DUMMY_LEAD_PHONE = '+123456789';
const DUMMY_LEAD_EMAIL = '';
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
  const [leadId, setLeadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

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

  useEffect(() => {
    return () => {
      closeSocket();
    };
  }, []);

  const resetWidget = () => {
    closeSocket();
    setIsOpen(false);
    setLeadId(null);
    setMessages([]);
    setInput('');
    setIsLoading(false);
    setStatusText('');
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
        socket.send(JSON.stringify({ role: 'user', content: 'Hi' }));
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

  const startChatSession = async () => {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setStatusText('Preparing chat...');
    setMessages([]);

    try {
      closeSocket();

      const response = await fetch(`${API_BASE_URL}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          phone_number: DUMMY_LEAD_PHONE,
          first_name: DUMMY_LEAD_NAME,
          email_address: DUMMY_LEAD_EMAIL,
          use_voice: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const sessionData = await response.json();
      if (sessionData.lead_id) {
        setLeadId(sessionData.lead_id);
      }

      setMessages([]);

      const socket = createSocket(sessionData);
      await attachChatHandlers(socket);
    } catch (error) {
      console.error('Error starting session:', error);
      appendMessage('assistant', error.message || 'Unable to start the assistant right now.');
      setStatusText('Connection error');
      closeSocket();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!input.trim() || isLoading) {
      return;
    }

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendMessage('assistant', 'The chat session is not connected anymore. Reopen the widget to start a new session.');
      return;
    }

    const userMessage = input.trim();
    setInput('');
    appendMessage('user', userMessage, false);
    setIsLoading(true);
    socket.send(JSON.stringify({ role: 'user', content: userMessage }));
  };

  const handleOpen = () => {
    setIsOpen(true);
    void startChatSession();
  };

  return (
    <>
      <button
        type="button"
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
          <button type="button" onClick={resetWidget} className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-4">
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
        </div>

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
      </div>
    </>
  );
};

export default ChatWidget;
