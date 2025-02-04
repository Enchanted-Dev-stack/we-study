import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getVideoTranscript } from '@/app/utils/youtube';

// Initialize Gemini Pro
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);

function isYouTubeUrl(url) {
  return url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/);
}

async function checkExistingContent(url) {
  const { data, error } = await supabase
    .from('study_materials')
    .select('*')
    .eq('url', url)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
    console.error('Error checking existing content:', error);
  }

  return data;
}

async function extractContent(url) {
  try {
    if (isYouTubeUrl(url)) {
      return await getVideoTranscript(url);
    } else {
      const response = await fetch(url);
      const html = await response.text();
      const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return textContent;
    }
  } catch (error) {
    console.error('Error extracting content:', error);
    throw new Error('Failed to extract content from URL: ' + error.message);
  }
}

async function generateStudyMaterials(content) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    // Calculate number of items based on content length
    // Using a more generous ratio: 1 flashcard per 200 chars, 1 quiz per 300 chars
    const contentLength = content.length;
    const flashcardsCount = Math.min(Math.floor(contentLength / 200), 100); // Up to 100 flashcards
    const quizCount = Math.min(Math.floor(contentLength / 300), 100); // Up to 50 quiz questions

    // For very long content, we'll process it in chunks to get better coverage
    const chunks = [];
    const chunkSize = 4000; // Gemini handles 4k chunks well
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    const prompt = `
      You are a study material generator. Analyze the following content and create comprehensive educational materials.
      This is chunk ${chunks.length > 1 ? 'of multiple chunks' : '1/1'} of the content.
      The content length suggests we can generate up to ${flashcardsCount} flashcards and ${quizCount} quiz questions.
      
      Content to analyze: ${content.substring(0, 4000)}
      
      ${chunks.length > 1 ? 'Note: This is part of a larger content. Focus on the concepts present in this chunk.' : ''}

      Generate a response in the following JSON format (no markdown, no code blocks):
      {
        "summary": [
          "Key point 1 - make it clear and concise",
          "Key point 2 - focus on main concepts",
          "Key point 3 - highlight important details",
          "Additional key points as needed..."
        ],
        "flashcards": [
          {
            "question": "Clear question about a specific concept",
            "answer": "Concise and accurate answer"
          }
        ],
        "quiz": [
          {
            "question": "Detailed question to test understanding",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correctAnswer": "Option that best answers the question",
            "explanation": "Brief explanation of why this is the correct answer"
          }
        ],
        "hashtags": [
          "Add relevant topic hashtags",
          "Include programming language if applicable",
          "Include concept categories",
          "4-8 hashtags total"
        ],
        "difficulty_level": "beginner|intermediate|advanced",
        "estimated_study_time": "time in minutes"
      }

      Rules:
      1. Return ONLY valid JSON
      2. Generate as many flashcards as possible from the content (up to ${flashcardsCount})
      3. Generate as many quiz questions as possible from the content (up to ${quizCount})
      4. Each question should focus on a different concept or aspect
      5. Generate 4-8 relevant hashtags (without the # symbol)
      6. Keep all responses educational and focused on the content
      7. Make questions clear, specific, and non-repetitive
      8. Ensure answers are accurate and helpful for learning
      9. For hashtags, include:
         - Main topic (e.g. java, python, javascript)
         - Concept category (e.g. oop, algorithms, webdev)
         - Specific topics (e.g. classes, inheritance, loops)
      10. Add detailed explanations for quiz answers
      11. Assess content difficulty and estimate study time
      12. Cover different cognitive levels:
          - Remember: recall facts and basic concepts
          - Understand: explain ideas or concepts
          - Apply: use information in new situations
          - Analyze: draw connections among ideas
          - Evaluate: justify a stand or decision
      13. Include practical, real-world examples where possible
      14. Make sure questions progress from basic to advanced concepts
    `;

    // If content is very long, process each chunk and combine results
    if (chunks.length > 1) {
      let allResults = [];
      for (const chunk of chunks) {
        const result = await model.generateContent(prompt.replace(content.substring(0, 4000), chunk));
        const chunkResult = JSON.parse(result.response.text().replace(/```json\n?|\n?```/g, '').trim());
        allResults.push(chunkResult);
      }

      // Combine results from all chunks
      return {
        summary: allResults.flatMap(r => r.summary),
        flashcards: allResults.flatMap(r => r.flashcards).slice(0, flashcardsCount),
        quiz: allResults.flatMap(r => r.quiz).slice(0, quizCount),
        hashtags: [...new Set(allResults.flatMap(r => r.hashtags))].slice(0, 8),
        difficulty_level: allResults[0].difficulty_level,
        estimated_study_time: allResults[0].estimated_study_time
      };
    }

    // For shorter content, process in one go
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    const cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
    
    try {
      return JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError);
      console.log('Raw response:', text);
      throw new Error('Invalid JSON response from AI');
    }
  } catch (error) {
    console.error('Error generating study materials:', error);
    throw new Error('Failed to generate study materials: ' + error.message);
  }
}

async function storeStudyMaterials(userId, url, materials) {
  try {
    // Store main study material
    const { data: studyMaterial, error: studyError } = await supabase
      .from('study_materials')
      .insert([
        {
          user_id: userId,
          url,
          summary: materials.summary,
          created_at: new Date().toISOString(),
        }
      ])
      .select()
      .single();

    if (studyError) throw studyError;

    // Store flashcards
    if (materials.flashcards?.length > 0) {
      const { error: flashcardsError } = await supabase
        .from('flashcards')
        .insert(
          materials.flashcards.map(card => ({
            study_material_id: studyMaterial.id,
            question: card.question,
            answer: card.answer,
            user_id: userId
          }))
        );

      if (flashcardsError) throw flashcardsError;
    }

    // Store quizzes
    if (materials.quiz?.length > 0) {
      const { error: quizError } = await supabase
        .from('quizzes')
        .insert(
          materials.quiz.map(q => ({
            study_material_id: studyMaterial.id,
            question: q.question,
            options: q.options,
            correct_answer: q.correctAnswer,
            explanation: q.explanation,
            user_id: userId
          }))
        );

      if (quizError) throw quizError;
    }

    // Store hashtags
    if (materials.hashtags?.length > 0) {
      const { error: hashtagsError } = await supabase
        .from('hashtags')
        .insert(
          materials.hashtags.map(tag => ({
            study_material_id: studyMaterial.id,
            tag: tag.toLowerCase(),
            user_id: userId
          }))
        );

      if (hashtagsError) throw hashtagsError;
    }

    return studyMaterial.id;
  } catch (error) {
    console.error('Error storing study materials:', error);
    throw new Error('Failed to store study materials in database');
  }
}

export async function POST(request) {
  try {
    const { url, userId } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Check if content already exists
    const existingContent = await checkExistingContent(url);
    if (existingContent) {
      // Fetch associated flashcards, quizzes, and hashtags
      const [flashcardsRes, quizzesRes, hashtagsRes] = await Promise.all([
        supabase
          .from('flashcards')
          .select('*')
          .eq('study_material_id', existingContent.id),
        supabase
          .from('quizzes')
          .select('*')
          .eq('study_material_id', existingContent.id),
        supabase
          .from('hashtags')
          .select('*')
          .eq('study_material_id', existingContent.id)
      ]);

      return NextResponse.json({
        summary: existingContent.summary,
        flashcards: flashcardsRes.data || [],
        quiz: quizzesRes.data || [],
        hashtags: hashtagsRes.data?.map(h => h.tag) || [],
        cached: true
      });
    }

    // Extract and process new content
    const content = await extractContent(url);
    if (!content || content.trim().length === 0) {
      throw new Error('No content could be extracted from the URL');
    }

    // Generate study materials using Gemini
    const studyMaterials = await generateStudyMaterials(content);

    // Store in database
    if (userId) {
      await storeStudyMaterials(userId, url, studyMaterials);
    }

    return NextResponse.json({ ...studyMaterials, cached: false });
  } catch (error) {
    console.error('Error processing content:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process content' },
      { status: 500 }
    );
  }
}
