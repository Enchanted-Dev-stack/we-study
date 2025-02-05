'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [feedback, setFeedback] = useState({});
  const [expandedSources, setExpandedSources] = useState(new Set());
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/login');
      return;
    }

    async function fetchQuizzes() {
      try {
        setLoading(true);
        const response = await fetch('/api/quizzes', {
          headers: {
            'Authorization': `Bearer ${user.uid}`
          }
        });
        if (!response.ok) {
          throw new Error('Failed to fetch quizzes');
        }
        const data = await response.json();
        setQuizzes(data.quizzes);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchQuizzes();
  }, [user, authLoading, router]);

  const handleAnswerSelect = (quizId, answer) => {
    setUserAnswers(prev => ({
      ...prev,
      [quizId]: answer
    }));
  };

  const checkAnswer = (quizId) => {
    const quiz = quizzes.find(q => q.id === quizId);
    const userAnswer = userAnswers[quizId];
    
    if (!userAnswer) {
      setFeedback(prev => ({
        ...prev,
        [quizId]: { message: 'Please select an answer first', type: 'warning' }
      }));
      return;
    }

    const isCorrect = userAnswer === quiz.correct_answer;
    setFeedback(prev => ({
      ...prev,
      [quizId]: {
        message: isCorrect ? 'Correct! 🎉' : `Incorrect. The correct answer is: ${quiz.correct_answer}`,
        type: isCorrect ? 'success' : 'error'
      }
    }));
  };

  const toggleSource = (url) => {
    setExpandedSources(prev => {
      const newSet = new Set(prev);
      if (newSet.has(url)) {
        newSet.delete(url);
      } else {
        newSet.add(url);
      }
      return newSet;
    });
  };

  // Group quizzes by source URL
  const groupedQuizzes = quizzes.reduce((acc, quiz) => {
    const sourceUrl = quiz.study_materials?.url || 'Unknown Source';
    if (!acc[sourceUrl]) {
      acc[sourceUrl] = {
        quizzes: [],
        metadata: {
          difficulty_level: quiz.study_materials?.difficulty_level,
          estimated_study_time: quiz.study_materials?.estimated_study_time
        }
      };
    }
    acc[sourceUrl].quizzes.push(quiz);
    return acc;
  }, {});

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="animate-pulse flex space-x-4">
              <div className="flex-1 space-y-6 py-1">
                <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto"></div>
                <div className="space-y-3">
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-red-600 text-xl font-semibold">Error: {error}</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Your Quizzes</h1>
          <p className="mt-2 text-gray-600">Test your knowledge with these personalized quizzes</p>
          {user && (
            <p className="mt-1 text-sm text-gray-500">
              Welcome back, {user.displayName || user.email}
            </p>
          )}
        </div>

        <div className="space-y-6">
          {Object.keys(groupedQuizzes).length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900">No quizzes yet</h3>
              <p className="mt-2 text-gray-600">
                Process some content to generate quizzes and test your knowledge.
              </p>
              <button
                onClick={() => router.push('/')}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Generate Quizzes
              </button>
            </div>
          ) : (
            Object.entries(groupedQuizzes).map(([sourceUrl, { quizzes: sourceQuizzes, metadata }]) => (
              <div key={sourceUrl} className="bg-white shadow rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSource(sourceUrl)}
                  className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900 text-left truncate">
                      {sourceUrl}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {sourceQuizzes.length} quizzes • {metadata.difficulty_level} • {metadata.estimated_study_time}
                    </p>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-500 transform transition-transform ${
                      expandedSources.has(sourceUrl) ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expandedSources.has(sourceUrl) && (
                  <div className="divide-y divide-gray-200">
                    {sourceQuizzes.map((quiz) => (
                      <div key={quiz.id} className="p-6">
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <h3 className="text-lg font-medium text-gray-900">{quiz.question}</h3>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                              {quiz.study_materials.difficulty_level}
                            </span>
                          </div>

                          <div className="space-y-2">
                            {quiz.options.map((option, index) => (
                              <label
                                key={index}
                                className={`flex items-center p-3 rounded-lg border ${
                                  userAnswers[quiz.id] === option
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-gray-200 hover:bg-gray-50'
                                } cursor-pointer transition-colors`}
                              >
                                <input
                                  type="radio"
                                  name={`quiz-${quiz.id}`}
                                  value={option}
                                  checked={userAnswers[quiz.id] === option}
                                  onChange={() => handleAnswerSelect(quiz.id, option)}
                                  className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                />
                                <span className="ml-3 text-gray-700">{option}</span>
                              </label>
                            ))}
                          </div>

                          <div className="flex items-center justify-between mt-4">
                            <button
                              onClick={() => checkAnswer(quiz.id)}
                              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                            >
                              Check Answer
                            </button>

                            {feedback[quiz.id] && (
                              <div
                                className={`px-4 py-2 rounded-md text-sm ${
                                  feedback[quiz.id].type === 'success'
                                    ? 'bg-green-100 text-green-800'
                                    : feedback[quiz.id].type === 'error'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                {feedback[quiz.id].message}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
