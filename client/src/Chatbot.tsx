import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PaperClipIcon, ArrowUpIcon, ChevronDownIcon, MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import 'highlight.js/styles/github.css';

hljs.configure({ 
  ignoreUnescapedHTML: true,
  languages: ['javascript', 'typescript', 'python', 'html', 'css', 'json']
});

// Custom highlight.js styles
const customHighlight = (code: string, isDark: boolean) => {
  return hljs.highlightAuto(code).value
    .replace(/<span class="hljs-keyword">/g, `<span class="${isDark ? 'text-blue-400' : 'text-blue-600'}">`)
    .replace(/<span class="hljs-built_in">/g, `<span class="${isDark ? 'text-purple-400' : 'text-purple-600'}">`)
    .replace(/<span class="hljs-string">/g, `<span class="${isDark ? 'text-green-400' : 'text-green-600'}">`)
    .replace(/<span class="hljs-number">/g, `<span class="${isDark ? 'text-yellow-400' : 'text-yellow-600'}">`)
    .replace(/<span class="hljs-comment">/g, `<span class="${isDark ? 'text-gray-400' : 'text-gray-500'}">`);
};

type Message = { role: string; content: string };

const MODELS = [
  { id: "deepseek/deepseek-chat-v3-0324:free", name: "DeepSeek Chat" },
  { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1" },
  { id: "google/gemini-2.5-pro-exp-03-25:free", name: "Gemini 2.5 Pro" },
  { id: "gryphe/mythomax-l2-13b:free", name: "Mythomax 13B" },
];

const DEFAULT_MODEL = MODELS[0].id;

const Chatbot = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentModel, setCurrentModel] = useState(DEFAULT_MODEL);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [attachedFileContent, setAttachedFileContent] = useState<string | null>(null);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const messageVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, x: -50 }
  };



  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      handleFileUpload(file);
    }
  }, []);

  const handleFileUpload = (file: File) => {
    setAttachedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      setAttachedFileContent(e.target?.result as string);
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleStreamResponse = async (reader: ReadableStreamDefaultReader) => {
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const lineEnd = buffer.indexOf('\n');
          if (lineEnd === -1) break;

          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);

          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                setMessages(prev => [
                  ...prev.slice(0, -1),
                  { ...prev[prev.length - 1], content: fullResponse }
                ]);
              }
            } catch (e) {
              console.error('Error parsing stream data:', e);
            }
          }
        }
      }
    } finally {
      reader.cancel();
      setIsStreaming(false);
      setAbortController(null);
    }
  };

  const sendMessage = async (messageContent: string) => {
    if (!messageContent.trim()) return;

    const userMessage = { role: "user", content: messageContent };
    const botMessage = { role: "assistant", content: "" };

    setMessages([...messages, userMessage, botMessage]);
    setLoading(true);
    setIsStreaming(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
          "HTTP-Referer": import.meta.env.VITE_SITE_URL,
          "X-Title": import.meta.env.VITE_SITE_NAME,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: currentModel,
          messages: [...messages, userMessage],
          stream: true
        })
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body is not readable');

      await handleStreamResponse(reader);
    } catch (error) {
      if (error !== 'AbortError') {
        console.error("Error fetching response:", error);
        setMessages(prev => [
          ...prev.slice(0, -1),
          { ...prev[prev.length - 1], content: "Error: Failed to get response" }
        ]);
      }
    } finally {
      setLoading(false);
      setIsStreaming(false);
      setAbortController(null);
    }
  };

  const handleSendMessage = async () => {
    let messageContent = input;
    if (attachedFileContent && attachedFileName) {
      messageContent += `\n\nFile Uploaded: ${attachedFileName}\nContents:\n\n\`\`\`\n${attachedFileContent}\n\`\`\``;
      setAttachedFileContent(null);
      setAttachedFileName(null);
    }
    sendMessage(messageContent);
    setInput("");
  };

  const stopGeneration = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const getModelName = (modelId: string) => {
    return MODELS.find(model => model.id === modelId)?.name || modelId.split('/')[1]?.replace(/-/g, ' ') || modelId;
  };

  const handleModelChange = (modelId: string) => {
    setCurrentModel(modelId);
    setShowModelDropdown(false);
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <div 
    ref={chatContainerRef}
    className={`flex flex-col ${isDarkMode ? 'bg-black text-white' : 'bg-white'} shadow-xl rounded-lg overflow-hidden`}
    style={{
      width: '100%',
      height: '100%',

      margin: '0 auto',
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)'
    }}
    onDragEnter={handleDragEnter}
    onDragLeave={handleDragLeave}
    onDragOver={handleDragOver}
    onDrop={handleDrop}
  >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center rounded-lg"
          >
            <div className="text-center p-6 bg-gray-800 rounded-lg border-2 border-dashed border-blue-500">
              <PaperClipIcon className="h-12 w-12 mx-auto text-blue-400 mb-4" />
              <p className="text-xl font-medium text-white">Drop your file here</p>
              <p className="text-gray-400 mt-2">Supported: .txt, .js, .ts, .py, etc.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className={`p-4 border-b ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex justify-between items-center max-w-3xl mx-auto">
          <h1 className={`text-lg font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            AI Chat Assistant
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isDarkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {getModelName(currentModel)}
                <ChevronDownIcon className="h-4 w-4" />
              </button>
              <AnimatePresence>
                {showModelDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className={`absolute right-0 mt-2 w-40 rounded-md shadow-sm z-10 border ${
                      isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="py-1">
                      {MODELS.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => handleModelChange(model.id)}
                          className={`block w-full text-left px-3 py-2 text-sm transition-colors ${
                            currentModel === model.id
                              ? isDarkMode
                                ? 'bg-blue-900 text-blue-200'
                                : 'bg-blue-50 text-blue-800'
                              : isDarkMode
                              ? 'text-gray-300 hover:bg-gray-700'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {model.name}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button onClick={toggleDarkMode} className={`p-1 rounded-full focus:outline-none ${
              isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
            }`}>
              {isDarkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
  {/* Chat messages */}
  <div className="flex-1 overflow-y-auto p-4">
    <AnimatePresence>
      {messages.map((msg, index) => (
        <motion.div
          key={index}
          variants={messageVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.3 }}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-3`}
        >
          <div className={`max-w-2xl rounded-lg p-4 text-base ${
            msg.role === "user"
              ? isDarkMode
                ? "bg-blue-600 text-white"
                : "bg-blue-100 text-gray-800"
              : isDarkMode
              ? "bg-gray-800 text-white"
              : "bg-gray-100 text-gray-800"
          }`}>
            <div className={`font-medium text-xs mb-1 opacity-70 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {msg.role === "user" ? "You" : getModelName(currentModel)}
            </div>
            <div className="prose dark:prose-invert prose-sm max-w-none">
              {/* REPLACE THE EXISTING PRE/CODE BLOCK WITH THIS: */}
              <pre className={`whitespace-pre-wrap break-words font-mono text-sm leading-relaxed p-2 rounded-sm ${
                isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-100'
              }`}>
                <code
                  dangerouslySetInnerHTML={{
                    __html: customHighlight(msg.content, isDarkMode)
                  }}
                />
              </pre>
            </div>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
    <div ref={messagesEndRef} />
  </div>

      {/* Input area */}
      <div className={`p-3 border-t ${isDarkMode ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="max-w-3xl mx-auto">
          {!attachedFileName && (
            <div className={`text-xs mb-2 text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Or drag & drop a file here
            </div>
          )}
          <div className={`flex items-center gap-2 rounded-md px-3 py-2 border ${isDarkMode ? 'border-gray-700 bg-gray-700' : 'border-gray-200 bg-white'}`}>
            <input
              type="text"
              className={`flex-1 border-0 focus:outline-none placeholder-gray-400 bg-transparent ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isStreaming && handleSendMessage()}
              disabled={loading}
            />

            <div className="flex items-center gap-1">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleFileButtonClick}
                className={`p-1.5 rounded-full focus:outline-none ${
                  isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                }`}
                aria-label="Attach file"
                disabled={isStreaming}
              >
                <PaperClipIcon className="h-4 w-4" />
              </motion.button>
              <input
                type="file"
                ref={fileInputRef}
                accept=".txt,.c,.cpp,.h,.hpp,.py,.java,.js,.ts,.html,.css,.json,.md"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                className="hidden"
              />
              {attachedFileName && (
                <span className={`text-sm italic ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Attached: {attachedFileName}
                </span>
              )}

              {isStreaming ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={stopGeneration}
                  className="p-1.5 rounded-full text-white bg-red-600 hover:bg-red-700 focus:outline-none"
                >
                  <div className="h-4 w-4 flex items-center justify-center">
                    <div className="h-2 w-2 bg-white rounded-full" />
                  </div>
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSendMessage}
                  className={`p-1.5 rounded-full focus:outline-none ${
                    loading || (!input.trim() && !attachedFileContent)
                      ? 'text-gray-400'
                      : 'text-white bg-blue-600 hover:bg-blue-700'
                  }`}
                  disabled={loading || (!input.trim() && !attachedFileContent)}
                >
                  <ArrowUpIcon className="h-4 w-4" />
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;