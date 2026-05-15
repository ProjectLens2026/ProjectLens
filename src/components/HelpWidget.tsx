'use client'
import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

const STORAGE_KEY = 'pl_help_chat_history'

const SUGGESTED_QUESTIONS = [
  'How do I run a TIA?',
  'What is the critical path?',
  'How do I move a version between projects?',
  'What triggers a rebaseline recommendation?',
  'How does ProjectLens detect fragnets?',
]

export default function HelpWidget() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load chat history on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) setMessages(parsed)
      }
    } catch {}
  }, [])

  // Save chat history on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {}
  }, [messages])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  function getCurrentPageContext(): string {
    if (!pathname) return 'Dashboard'
    if (pathname.includes('/dashboard/lens')) return 'ProjectLens Analysis'
    if (pathname.includes('/dashboard/risks')) return 'Risks & Issues'
    if (pathname.includes('/dashboard/procurement')) return 'Procurement'
    if (pathname.includes('/dashboard/submittals')) return 'Submittals'
    if (pathname.includes('/dashboard/changes')) return 'Change Orders'
    if (pathname.includes('/dashboard/rfis')) return 'RFIs'
    if (pathname.includes('/dashboard/tia')) return 'TIA Comparison'
    if (pathname.includes('/dashboard/trend')) return 'Trend Analysis'
    if (pathname.includes('/dashboard/upload')) return 'Upload New Version'
    if (pathname.includes('/dashboard/projects')) return 'Projects'
    if (pathname.includes('/dashboard')) return 'Dashboard'
    return 'ProjectLens'
  }

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          currentPage: getCurrentPageContext(),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown server error' }))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.reply || 'No response received.',
        timestamp: Date.now(),
      }
      setMessages([...newMessages, assistantMessage])
    } catch (err: any) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Sorry — I had trouble responding. Error: ${err.message || 'unknown'}. Please try again.`,
        timestamp: Date.now(),
      }
      setMessages([...newMessages, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  function handleSend() {
    sendMessage(input)
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function clearChat() {
    if (confirm('Clear this conversation?')) {
      setMessages([])
      try { localStorage.removeItem(STORAGE_KEY) } catch {}
    }
  }

  // Don't render on login page or landing page
  if (pathname === '/' || pathname === '/login') return null

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 hover:scale-105 transition-all flex items-center gap-2 print:hidden"
          aria-label="Open Ask ProjectLens">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-sm font-bold pr-1">Ask ProjectLens</span>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-40 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col print:hidden"
             style={{ width: '380px', height: '560px', maxHeight: 'calc(100vh - 48px)' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 rounded-t-2xl flex items-center justify-between flex-shrink-0">
            <div>
              <div className="font-bold text-sm">Ask ProjectLens</div>
              <div className="text-[10px] text-blue-100">Schedule & app help</div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={clearChat}
                  title="Clear conversation"
                  className="text-blue-100 hover:text-white p-1.5 rounded hover:bg-blue-800/30">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                  </svg>
                </button>
              )}
              <button onClick={() => setIsOpen(false)}
                title="Close"
                className="text-blue-100 hover:text-white p-1.5 rounded hover:bg-blue-800/30">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {messages.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">💬</div>
                <div className="text-sm font-bold text-slate-900 mb-1">Welcome to Ask ProjectLens</div>
                <div className="text-xs text-slate-500 mb-5 leading-relaxed">
                  Ask me anything about scheduling, TIA, fragnets, or how to use ProjectLens.
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Try asking:</div>
                <div className="space-y-1.5">
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button key={i}
                      onClick={() => sendMessage(q)}
                      className="block w-full text-left text-xs bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg px-3 py-2 text-slate-700 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                  }`}>
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 p-3 bg-white rounded-b-2xl flex-shrink-0">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={isLoading}
                placeholder="Ask about scheduling or ProjectLens..."
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 disabled:bg-slate-50" />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:bg-slate-200 disabled:text-slate-400 hover:bg-blue-700 transition-colors">
                Send
              </button>
            </div>
            <div className="text-[9px] text-slate-400 mt-1.5 text-center">
              ProjectLens supports your visibility — it does not replace your judgment.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
