'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { motion } from 'framer-motion';
import StudyMaterialsModal from './components/StudyMaterialsModal';

export default function Home() {
  const { user, signInWithGoogle } = useAuth();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [studyMaterials, setStudyMaterials] = useState(null);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    flashcardsCount: 0,
    quizzesCount: 0
  });
  const [processingSteps, setProcessingSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Function to add a new processing step
  const addProcessingStep = (step, status = 'pending') => {
    setProcessingSteps(prev => [...prev, { step, status, timestamp: new Date() }]);
    setCurrentStep(step);
  };

  // Function to update step status
  const updateStepStatus = (step, status) => {
    setProcessingSteps(prev => 
      prev.map(s => 
        s.step === step ? { ...s, status } : s
      )
    );
  };

  // Fetch user stats when user logs in or study materials change
  useEffect(() => {
    async function fetchUserStats() {
      if (!user) return;

      try {
        const response = await fetch(`/api/user-stats?userId=${user.uid}`);
        if (!response.ok) throw new Error('Failed to fetch user stats');
        const data = await response.json();
        setStats({
          flashcardsCount: data.flashcardsCount,
          quizzesCount: data.quizzesCount
        });
      } catch (error) {
        console.error('Error fetching user stats:', error);
      }
    }

    fetchUserStats();
  }, [user, studyMaterials]); // Re-fetch when user or study materials change

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setStudyMaterials(null);
    setProcessingSteps([]); // Reset steps

    try {
      // Show initializing for 3 seconds
      addProcessingStep('Initializing request');
      await sleep(3000);
      updateStepStatus('Initializing request', 'completed');
      
      // Add YouTube transcript step if it's a YouTube URL
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        addProcessingStep('Fetching YouTube transcript');
      } else {
        addProcessingStep('Extracting content from URL');
      }

      const response = await fetch('/api/process-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          userId: user?.uid,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process content');
      }

      const data = await response.json();
      if (!data) {
        throw new Error('No data received');
      }

      // Update transcript/content step
      updateStepStatus(currentStep, 'completed');

      // Add and show generating materials step
      addProcessingStep('Generating study materials');
      await sleep(2000); // Show for at least 2 seconds
      updateStepStatus('Generating study materials', 'completed');
      
      // Add saving step
      addProcessingStep('Saving to database');
      await sleep(1000); // Show for at least 1 second
      updateStepStatus('Saving to database', 'completed');
      
      // Final success step
      addProcessingStep('Content processed successfully', 'completed');
      
      setStudyMaterials(data);
      setShowModal(true); // Show modal when materials are ready
      setUrl('');
      setLoading(false);
    } catch (err) {
      // Add error step and update current step as failed
      updateStepStatus(currentStep, 'error');
      addProcessingStep(`Error: ${err.message}`, 'error');
      setError(err.message);
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-gradient-to-b from-white to-gray-50 px-6 py-12 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Welcome to WeStudy
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Your AI-powered learning assistant for competitive exams
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <button
              onClick={signInWithGoogle}
              className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Get started
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Content Input Section */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-lg bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-gray-900">Add Study Content</h2>
            <p className="mt-1 text-sm text-gray-500">
              Paste a link to a YouTube video, blog post, or tweet to generate study materials
            </p>
            <form onSubmit={handleSubmit} className="mt-6">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className={`mt-4 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                  loading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {loading ? 'Processing...' : 'Process Content'}
              </button>
            </form>

            {/* Progress Indicator */}
            {loading && processingSteps.length > 0 && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-sm">
                <div className="space-y-2">
                  {processingSteps.map(({ step, status, timestamp }, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      {/* Status indicator */}
                      {status === 'pending' && (
                        <svg className="h-4 w-4 animate-spin text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {status === 'completed' && (
                        <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                      )}
                      {status === 'error' && (
                        <svg className="h-4 w-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      )}
                      <span className={status === 'error' ? 'text-red-600' : ''}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">
                {error}
              </div>
            )}
          </motion.div>

          {/* Stats Section */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-lg bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-gray-900">Your Study Stats</h2>
            <div className="mt-6 grid grid-cols-2 gap-6">
              <div className="rounded-lg bg-indigo-50 p-4">
                <h3 className="text-sm font-medium text-indigo-600">Flashcards Created</h3>
                <p className="mt-2 text-3xl font-semibold text-indigo-900">{stats.flashcardsCount}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-4">
                <h3 className="text-sm font-medium text-green-600">Quizzes Generated</h3>
                <p className="mt-2 text-3xl font-semibold text-green-900">{stats.quizzesCount}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Study Materials Modal */}
      <StudyMaterialsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        materials={studyMaterials}
      />
    </main>
  );
}
