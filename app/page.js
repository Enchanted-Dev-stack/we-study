'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { motion } from 'framer-motion';

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStudyMaterials(null);

    try {
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
      setStudyMaterials(data);
      setUrl(''); // Clear the input after successful processing
    } catch (err) {
      setError(err.message);
    } finally {
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

            {error && (
              <div className="mt-4 rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error processing content</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {studyMaterials && (
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-md font-semibold text-gray-900">Summary</h3>
                  {studyMaterials.difficulty_level && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      studyMaterials.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800' :
                      studyMaterials.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {studyMaterials.difficulty_level}
                    </span>
                  )}
                </div>
                
                {studyMaterials.estimated_study_time && (
                  <p className="mt-2 text-sm text-gray-500">
                    Estimated study time: {studyMaterials.estimated_study_time}
                  </p>
                )}

                <ul className="mt-2 list-disc pl-5 space-y-1">
                  {studyMaterials.summary.map((point, index) => (
                    <li key={index} className="text-sm text-gray-600">{point}</li>
                  ))}
                </ul>

                <h3 className="mt-4 text-md font-semibold text-gray-900">
                  Flashcards ({studyMaterials.flashcards.length})
                </h3>
                <div className="mt-2 space-y-3">
                  {studyMaterials.flashcards.map((card, index) => (
                    <div key={index} className="rounded-lg border border-gray-200 p-4">
                      <p className="font-medium text-gray-900">{card.question}</p>
                      <p className="mt-2 text-sm text-gray-600">{card.answer}</p>
                    </div>
                  ))}
                </div>

                <h3 className="mt-4 text-md font-semibold text-gray-900">
                  Quiz ({studyMaterials.quiz?.length || 0})
                </h3>
                <div className="mt-2 space-y-4">
                  {studyMaterials.quiz && studyMaterials.quiz.map((question, index) => (
                    <div key={index} className="rounded-lg border border-gray-200 p-4">
                      <p className="font-medium text-gray-900">
                        {index + 1}. {question.question}
                      </p>
                      <div className="mt-2 space-y-2">
                        {Array.isArray(question.options) && question.options.map((option, optionIndex) => (
                          <div key={optionIndex} className="flex items-center">
                            <input
                              type="radio"
                              name={`question-${index}`}
                              value={option}
                              id={`question-${index}-option-${optionIndex}`}
                              className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600"
                            />
                            <label 
                              htmlFor={`question-${index}-option-${optionIndex}`}
                              className="ml-2 text-sm text-gray-600"
                            >
                              {option}
                            </label>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4">
                        <button
                          type="button"
                          className="text-sm text-indigo-600 hover:text-indigo-500"
                          onClick={() => {
                            const selectedOption = document.querySelector(`input[name="question-${index}"]:checked`)?.value;
                            if (selectedOption) {
                              alert(selectedOption === question.correctAnswer ? 
                                'Correct! 🎉' : 
                                `Incorrect. The correct answer is: ${question.correctAnswer}`);
                            } else {
                              alert('Please select an answer first.');
                            }
                          }}
                        >
                          Check Answer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {studyMaterials.hashtags && (
                  <div className="mt-4">
                    <h3 className="text-md font-semibold text-gray-900">Topics</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {studyMaterials.hashtags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Stats Section */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-lg bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-gray-900">Your Progress</h2>
            <dl className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow ring-1 ring-gray-300 sm:p-6">
                <dt className="truncate text-sm font-medium text-gray-500">Flashcards Created</dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                  {stats.flashcardsCount}
                </dd>
              </div>
              <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow ring-1 ring-gray-300 sm:p-6">
                <dt className="truncate text-sm font-medium text-gray-500">Quizzes Completed</dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                  {stats.quizzesCount}
                </dd>
              </div>
            </dl>
          </motion.div>
        </div>

        {/* Recent Activity Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8 rounded-lg bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          <div className="mt-6">
            <p className="text-sm text-gray-500">No recent activity</p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
