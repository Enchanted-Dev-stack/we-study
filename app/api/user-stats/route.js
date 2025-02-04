import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET(request) {
  const searchParams = new URL(request.url).searchParams;
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json(
      { error: 'User ID is required' },
      { status: 400 }
    );
  }

  try {
    const [flashcardsCount, quizzesCount] = await Promise.all([
      supabase
        .from('flashcards')
        .select('id', { count: 'exact' })
        .eq('user_id', userId),
      supabase
        .from('quizzes')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
    ]);

    return NextResponse.json({
      flashcardsCount: flashcardsCount.count || 0,
      quizzesCount: quizzesCount.count || 0
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user stats' },
      { status: 500 }
    );
  }
}
