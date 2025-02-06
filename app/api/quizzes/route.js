import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    // Get user ID from the token
    const userId = authHeader.split('Bearer ')[1];
    if (!userId) {
      return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 });
    }

    console.log('Fetching quizzes for user:', userId);

    // Get all quizzes for the user with related study material info
    const { data: quizzes, error: quizzesError } = await supabase
      .from('quizzes')
      .select(`
        id,
        question,
        options,
        correct_answer,
        created_at,
        study_materials (
          url,
          summary,
          difficulty_level,
          estimated_study_time,
          thumbnail
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (quizzesError) {
      console.error('Database error:', quizzesError);
      throw quizzesError;
    }

    console.log('Found quizzes:', quizzes?.length || 0);
    return NextResponse.json({ quizzes: quizzes || [] });
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
