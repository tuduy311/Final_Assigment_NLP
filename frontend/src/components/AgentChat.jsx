import React, { useState, useRef, useEffect } from 'react'
import { sendAgentMessage } from '../services/api'
import { Send, Bot, User, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

const AgentChat = ({ audioId }) => {
  const [messages, setMessages] = useState([
    { role: 'model', content: 'Hello! I am your AI Meeting Assistant. Ask me anything about the transcript, action items, or ask me to add tasks to your calendar.' }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    setMessages([
      { role: 'model', content: 'Hello! I am your AI Meeting Assistant. Ask me anything about the transcript, action items, or ask me to add tasks to your calendar.' }
    ])
    setInput('')
    setIsLoading(false)
  }, [audioId])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !audioId) return

    const userMessage = { role: 'user', content: input.trim() }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Pass the previous history excluding the very first greeting
      const historyToSend = messages.slice(1).map(m => ({ role: m.role, content: m.content }))
      const response = await sendAgentMessage(audioId, userMessage.content, historyToSend)
      
      setMessages(prev => [...prev, { role: 'model', content: response.reply }])
    } catch (error) {
      console.error("Agent chat error:", error)
      setMessages(prev => [...prev, { role: 'model', content: 'Sorry, I encountered an error connecting to the AI.' }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[500px] bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="bg-blue-50 border-b border-blue-100 p-4 flex items-center gap-2">
        <Bot className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-blue-900">AI Meeting Assistant</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
              ) : (
                <div className="markdown-body text-sm prose prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 flex-row">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-100 text-blue-600">
              <Bot className="w-4 h-4" />
            </div>
            <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-gray-100 text-gray-800 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-sm text-gray-500">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-gray-50 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={audioId ? "Ask me anything..." : "Upload audio first..."}
            disabled={!audioId || isLoading}
            className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !audioId || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default AgentChat
