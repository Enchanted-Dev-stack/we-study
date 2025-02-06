'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';

export default function QuizPage() {
  const [quizzes, setQuizzes] = useState([]);
  const [userAnswers, setUserAnswers] = useState({});
  const [feedback, setFeedback] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const sourceUrl = params?.sourceUrl ? decodeURIComponent(params.sourceUrl) : '';

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
        // Filter quizzes for this source URL
        const sourceQuizzes = data.quizzes.filter(
          quiz => quiz.study_materials?.url === sourceUrl
        );
        setQuizzes(sourceQuizzes);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchQuizzes();
  }, [user, authLoading, router, sourceUrl]);

  const handleAnswerSelect = (quizId, selectedOption) => {
    setUserAnswers(prev => ({
      ...prev,
      [quizId]: selectedOption
    }));
    // Clear feedback when user changes answer
    setFeedback(prev => ({
      ...prev,
      [quizId]: null
    }));
  };

  const checkAnswer = (quizId) => {
    const quiz = quizzes.find(q => q.id === quizId);
    if (!quiz || !userAnswers[quizId]) {
      setFeedback(prev => ({
        ...prev,
        [quizId]: { type: 'warning', message: 'Please select an answer' }
      }));
      return;
    }

    const isCorrect = userAnswers[quizId] === quiz.correct_answer;
    setFeedback(prev => ({
      ...prev,
      [quizId]: {
        type: isCorrect ? 'success' : 'error',
        message: isCorrect ? 'Correct!' : 'Try again'
      }
    }));
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-red-600 text-xl font-semibold">Error: {error}</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <button
            onClick={() => router.push('/quizzes')}
            className="text-indigo-600 hover:text-indigo-800 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Quizzes
          </button>
          
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Quizzes for Video</h1>
          <p className="mt-2 text-gray-600 break-all">{sourceUrl}</p>
        </div>

        <div className="space-y-6">
          {quizzes.map((quiz) => (
            <div key={quiz.id} className="bg-white shadow rounded-lg overflow-hidden">
              <div className="p-6">
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
