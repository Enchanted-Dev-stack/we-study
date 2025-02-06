'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

export default function StudyMaterialsModal({ isOpen, onClose, materials }) {
  const [activeTab, setActiveTab] = useState('summary');

  if (!isOpen || !materials) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="relative w-full max-w-5xl overflow-hidden rounded-2xl bg-gradient-to-br from-white to-gray-50 shadow-2xl border border-white/20"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-6 top-6 rounded-full bg-white/10 p-2 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 z-10"
          >
            <svg className="h-6 w-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-gray-100 p-6">
            <button
              onClick={() => setActiveTab('summary')}
              className={`rounded-xl px-5 py-2.5 font-medium transition-all duration-200 ${
                activeTab === 'summary'
                ? 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Summary
            </button>
            <button
              onClick={() => setActiveTab('flashcards')}
              className={`rounded-xl px-5 py-2.5 font-medium transition-all duration-200 flex items-center gap-2 ${
                activeTab === 'flashcards'
                ? 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Flashcards
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-sm">
                {materials.flashcards.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('quiz')}
              className={`rounded-xl px-5 py-2.5 font-medium transition-all duration-200 flex items-center gap-2 ${
                activeTab === 'quiz'
                ? 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Quiz
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-sm">
                {materials.quiz.length}
              </span>
            </button>
          </div>

          {/* Content Area */}
          <div className="max-h-[70vh] overflow-y-auto p-6 styled-scrollbar">
            {activeTab === 'summary' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                {materials.summary.map((point, index) => (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    key={index}
                    className="flex gap-3 bg-white/50 p-4 rounded-xl backdrop-blur-sm border border-white/20 shadow-sm"
                  >
                    <span className="text-indigo-500 font-bold">•</span>
                    <span className="text-gray-700">{point}</span>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {activeTab === 'flashcards' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {materials.flashcards.map((card, index) => (
                  <FlashCard key={index} card={card} index={index} />
                ))}
              </motion.div>
            )}

            {activeTab === 'quiz' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {materials.quiz.map((question, index) => (
                  <QuizQuestion key={index} question={question} index={index} />
                ))}
              </motion.div>
            )}
          </div>
        </motion.div>

        <style jsx global>{`
          .styled-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: #818CF8 #EEF2FF;
          }
          .styled-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .styled-scrollbar::-webkit-scrollbar-track {
            background: #EEF2FF;
            border-radius: 100vh;
          }
          .styled-scrollbar::-webkit-scrollbar-thumb {
            background: #818CF8;
            border-radius: 100vh;
          }
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
}

function FlashCard({ card, index }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="relative h-40 w-full perspective-1000"
    >
      <div
        onClick={() => setIsFlipped(!isFlipped)}
        className="relative h-full w-full cursor-pointer transition-transform duration-200 hover:scale-[1.02]"
      >
        <motion.div
          className="absolute inset-0 rounded-xl bg-white p-4 shadow-md border border-indigo-100"
          initial={false}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6 }}
          style={{ 
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden'
          }}
        >
          <div className="flex h-full items-center justify-center text-center bg-gradient-to-br from-indigo-500 to-violet-500 rounded-lg">
            <h3 className="px-3 text-base font-medium text-white">{card.question}</h3>
          </div>
        </motion.div>

        <motion.div
          className="absolute inset-0 rounded-xl bg-white p-4 shadow-md border border-indigo-100"
          initial={false}
          animate={{ rotateY: isFlipped ? 0 : -180 }}
          transition={{ duration: 0.6 }}
          style={{ 
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden'
          }}
        >
          <div className="flex h-full items-center justify-center text-center bg-gray-50 rounded-lg">
            <p className="px-3 text-base text-gray-800">{card.answer}</p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function QuizQuestion({ question, index }) {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);

  const difficultyColors = {
    easy: 'bg-gradient-to-r from-green-500 to-emerald-500 text-white',
    medium: 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white',
    hard: 'bg-gradient-to-r from-orange-500 to-red-500 text-white',
    extreme: 'bg-gradient-to-r from-red-500 to-rose-500 text-white'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="rounded-xl bg-white p-6 shadow-md border-2 border-gray-100"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">{question.question}</h3>
        <span className={`rounded-full px-4 py-1 text-sm font-medium shadow-sm ${difficultyColors[question.difficulty] || 'bg-gradient-to-r from-gray-500 to-gray-600 text-white'}`}>
          {question.difficulty || 'normal'}
        </span>
      </div>
      
      <div className="mt-4 space-y-3">
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={() => {
              setSelectedAnswer(option);
              setShowAnswer(true);
            }}
            className={`w-full rounded-xl border-2 p-3 text-left transition-all duration-200 ${
              showAnswer
                ? option === question.correctAnswer
                  ? 'border-green-200 bg-green-50 text-green-900 shadow-sm'
                  : option === selectedAnswer
                  ? 'border-red-200 bg-red-50 text-red-900 shadow-sm'
                  : 'border-gray-100 bg-white text-gray-800'
                : 'border-gray-100 bg-white text-gray-800 hover:border-indigo-100 hover:bg-indigo-50/30'
            }`}
            disabled={showAnswer}
          >
            <div className="flex items-center gap-3">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                showAnswer
                  ? option === question.correctAnswer
                    ? 'bg-green-100 text-green-800'
                    : option === selectedAnswer
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-600'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {String.fromCharCode(65 + index)}
              </span>
              <span className="font-medium">{option}</span>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
