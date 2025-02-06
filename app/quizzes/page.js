'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import Image from 'next/image';

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
          estimated_study_time: quiz.study_materials?.estimated_study_time,
          thumbnail: quiz.study_materials?.thumbnail
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.keys(groupedQuizzes).length === 0 ? (
            <div className="col-span-full text-center py-12">
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
              <div 
                key={sourceUrl} 
                className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/quizzes/${encodeURIComponent(sourceUrl)}`)}
              >
                {/* Thumbnail with 16:9 aspect ratio */}
                <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                  {metadata.thumbnail ? (
                    <Image
                      src={metadata.thumbnail}
                      alt="Video thumbnail"
                      fill
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement.classList.add('bg-gradient-to-r', 'from-indigo-500', 'to-purple-600');
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center">
                      <svg
                        className="w-12 h-12 text-white opacity-75"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <h3 className="font-medium text-gray-900 line-clamp-2 mb-2">
                    {sourceUrl}
                  </h3>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{sourceQuizzes.length} quizzes</span>
                    <span>{metadata.difficulty_level}</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Estimated time: {metadata.estimated_study_time}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
