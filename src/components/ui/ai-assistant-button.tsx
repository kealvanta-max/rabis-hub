'use client';

// Future AI provider: Google Gemini API (https://ai.google.dev/)
// This component will be connected to Gemini when the AI assistant feature is launched.

import { useState } from 'react';
import { motion } from 'framer-motion';

export default function AIAssistantButton() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-6 z-[9989] group"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="AI Assistant"
      >
        <div className="absolute inset-0 w-14 h-14 bg-blue-500/20 rounded-full animate-pulse" />
        <div className="relative w-14 h-14 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center text-white shadow-lg hover:shadow-blue-500/50 transition-all duration-300 cursor-pointer">
          <span className="text-xl">✨</span>
        </div>
        <div className="absolute bottom-full right-0 mb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="bg-gray-900 text-white text-xs font-medium px-3 py-2 rounded-lg whitespace-nowrap border border-gray-700">
            AI Assistant — Coming Soon
          </div>
          <div className="absolute bottom-0 right-4 transform translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45 border-r border-b border-gray-700" />
        </div>
      </motion.button>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9990] flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm mx-4 shadow-2xl"
          >
            <div className="flex items-center justify-center mb-4">
              <div className="text-5xl">✨</div>
            </div>
            <h2 className="text-2xl font-bold text-white text-center mb-3">AI Assistant</h2>
            <p className="text-gray-300 text-center mb-6">
              Our intelligent AI assistant powered by Google Gemini is coming soon!
              It will help you with savings recommendations, payment tracking, and more.
            </p>
            <button
              onClick={() => setIsOpen(false)}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-2 px-4 rounded-lg hover:shadow-lg transition-all duration-300"
            >
              Got it!
            </button>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
