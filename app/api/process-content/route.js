import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getVideoTranscript, getVideoId, getVideoThumbnail } from '@/app/utils/youtube';

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

// Sanitize and parse JSON from AI response while preserving content
function sanitizeAndParseJSON(text) {
  try {
    // First try parsing as is
    return JSON.parse(text);
  } catch (firstError) {
    console.log('First parse attempt failed:', firstError.message);
    
    try {
      // Clean the text - only fixing JSON structure issues
      let cleanText = text
        // Remove any potential script tags
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // Fix JSON structure issues only
        .replace(/(["\]}])[\n\r]+(["\[{])/g, '$1,$2')
        // Remove trailing commas
        .replace(/,(\s*[}\]])/g, '$1');

      // Try to find where the JSON actually starts
      const jsonStart = cleanText.indexOf('{');
      if (jsonStart !== -1) {
        cleanText = cleanText.substring(jsonStart);
      }

      // Try to find where the JSON actually ends
      const jsonEnd = cleanText.lastIndexOf('}');
      if (jsonEnd !== -1) {
        cleanText = cleanText.substring(0, jsonEnd + 1);
      }

      // Try parsing the cleaned text
      try {
        const parsed = JSON.parse(cleanText);
        
        // Validate the structure but preserve content
        if (!parsed.summary || !Array.isArray(parsed.summary) ||
            !parsed.flashcards || !Array.isArray(parsed.flashcards) ||
            !parsed.quiz || !Array.isArray(parsed.quiz)) {
          throw new Error('Invalid study materials structure');
        }

        // Only trim whitespace at start/end, preserve internal formatting
        parsed.summary = parsed.summary
          .map(item => String(item).trim())
          .filter(Boolean);

        parsed.flashcards = parsed.flashcards
          .filter(card => card && typeof card.question === 'string' && typeof card.answer === 'string')
          .map(card => ({
            question: card.question.trim(),
            answer: card.answer.trim()
          }));

        parsed.quiz = parsed.quiz
          .filter(q => q && typeof q.question === 'string' && Array.isArray(q.options) && typeof q.correctAnswer === 'string')
          .map(q => ({
            question: q.question.trim(),
            options: q.options.map(opt => String(opt).trim()),
            correctAnswer: q.correctAnswer.trim(),
            difficulty: q.difficulty || 'medium'
          }));

        return parsed;
      } catch (parseError) {
        console.error('Failed to parse cleaned JSON:', parseError.message);
        
        // If we still can't parse, try one more time with more aggressive cleaning
        // but ONLY on the JSON structure, not the content
        try {
          cleanText = cleanText
            // Fix potential unmatched quotes in property names only
            .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3')
            // Ensure property names are properly quoted
            .replace(/([{,]\s*)([^"\s][^:\s]*)(\s*:)/g, '$1"$2"$3');

          const finalParsed = JSON.parse(cleanText);
          
          // Apply the same validation as before
          if (!finalParsed.summary || !Array.isArray(finalParsed.summary) ||
              !finalParsed.flashcards || !Array.isArray(finalParsed.flashcards) ||
              !finalParsed.quiz || !Array.isArray(finalParsed.quiz)) {
            throw new Error('Invalid study materials structure');
          }

          return finalParsed;
        } catch (finalError) {
          throw new Error('Invalid JSON structure after cleaning');
        }
      }
    } catch (error) {
      console.error('JSON sanitization failed:', error.message);
      throw new Error('Failed to process AI response');
    }
  }
}

async function makeGenerateRequest(model, prompt, retryCount = 0) {
  try {
    const response = await model.generateContent(prompt);
    const text = response.response.text();
    
    try {
      return sanitizeAndParseJSON(text);
    } catch (error) {
      console.error('Error parsing AI response:', error.message);
      
      // If we have retries left and it's a parsing error, try again
      if (retryCount < 2) {
        console.log(`Retrying generate request (attempt ${retryCount + 1})`);
        return makeGenerateRequest(model, prompt, retryCount + 1);
      }
      
      throw new Error('Failed to parse AI response after retries');
    }
  } catch (error) {
    console.error('Error in generate request:', error.message);
    throw error;
  }
}

// Utility function for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Utility function for chunking array
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function generateStudyMaterials(content) {
  try {
    console.log('Starting study materials generation...');
    
    // Split content into smaller chunks for processing
    const chunkSize = 10000; // Process 5000 characters at a time
    const contentChunks = content.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];
    const concurrencyLimit = 3; // Process 3 chunks at a time
    
    const chunks = chunkArray(contentChunks, concurrencyLimit);
    let allResponses = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkGroup = chunks[i];
      console.log(`Processing chunk group ${i + 1}/${chunks.length}`);

      try {
        // Process chunks in parallel
        const chunkPromises = chunkGroup.map(async (chunk, index) => {
          const prompt = generatePrompt(chunk);
          const model = genAI.getGenerativeModel({ model: "gemini-pro" });
          return makeGenerateRequest(model, prompt);
        });

        const chunkResults = await Promise.all(chunkPromises);
        allResponses = allResponses.concat(chunkResults);

        // Small delay between groups to avoid rate limits
        if (i + 1 < chunks.length) {
          console.log('Waiting before processing next chunk group...');
          await delay(1000);
        }
      } catch (chunkError) {
        console.error(`Error processing chunk group ${i + 1}:`, chunkError);
        throw chunkError;
      }
    }

    // Combine all responses
    const combinedMaterials = {
      summary: [],
      flashcards: [],
      quiz: []
    };

    for (const response of allResponses) {
      if (response.summary) combinedMaterials.summary.push(...response.summary);
      if (response.flashcards) combinedMaterials.flashcards.push(...response.flashcards);
      if (response.quiz) combinedMaterials.quiz.push(...response.quiz);
    }

    // Deduplicate and limit items
    combinedMaterials.summary = Array.from(new Set(combinedMaterials.summary));
    combinedMaterials.flashcards = combinedMaterials.flashcards
      .filter((card, index, self) => 
        index === self.findIndex(c => c.question === card.question));
    combinedMaterials.quiz = combinedMaterials.quiz
      .filter((q, index, self) => 
        index === self.findIndex(item => item.question === q.question));

    console.log('Study materials generation completed successfully');
    return combinedMaterials;

  } catch (error) {
    console.error('Error generating study materials:', error);
    if (error.message.includes('rate limit')) {
      throw new Error('API rate limit reached. Please try again in a few minutes.');
    } else if (error.message.includes('Invalid JSON')) {
      throw new Error('Error processing content. Please try with a different video.');
    } else {
      throw new Error('Failed to generate study materials. Please try again.');
    }
  }
}

function generatePrompt(content) {
  return `
    Generate comprehensive study materials in valid JSON format.
    
    Content: ${content}

    Return ONLY a valid JSON object like this (no other text or explanation):
    {
      "summary": [
        "Key point about the topic",
        "Another key point",
        "more points if available",
        "... so on"
      ],
      "flashcards": [
        {
          "question": "Simple question avoiding quotes or special characters",
          "answer": "Simple answer avoiding quotes or special characters"
        }
      ],
      "quiz": [
        {
          "question": "Simple multiple choice question",
          "options": [
            "First choice",
            "Second choice",
            "Third choice",
            "Fourth choice"
          ],
          "correctAnswer": "First choice",
          "difficulty": "easy"
        }
      ],
      "hashtags": ["topic1", "topic2"],
      "difficulty_level": "beginner",
      "estimated_study_time": "30"
    }

    IMPORTANT RULES:
    1. Return ONLY the JSON object above, no other text
    2. AVOID using quotes within text content - rephrase if needed
    3. For HTML/CSS examples, use single quotes instead of double quotes
    4. Keep questions and answers simple, avoid special characters
    5. Generate as many flashcards as needed to cover important concepts
    6. Generate quiz questions across different difficulty levels:
       - easy: Basic recall questions
       - medium: Understanding and application
       - hard: Complex scenarios
       - extreme: Advanced problem-solving
    7. Add a difficulty field to each quiz question
    8. Focus on key concepts from this section
    9. Make sure questions are varied and cover different aspects
  `;
}

async function storeStudyMaterials(userId, url, materials, thumbnail) {
  try {
    // Log the initial materials
    console.log('Raw materials received:', {
      summary: materials.summary?.length,
      flashcards: materials.flashcards?.length,
      quiz: materials.quiz?.length,
      hashtags: materials.hashtags?.length
    });

    if (materials.quiz?.length > 0) {
      console.log('First quiz item for reference:', materials.quiz[0]);
    }

    // Store main study material
    const { data: studyMaterial, error: studyError } = await supabase
      .from('study_materials')
      .insert([
        {
        user_id: userId,
        url,
        thumbnail,
        summary: materials.summary,
        created_at: new Date().toISOString(),
        difficulty_level: materials.difficulty_level,
        estimated_study_time: materials.estimated_study_time
      }
      ])
      .select()
      .single();

    if (studyError) {
      console.error('Error storing study material:', studyError);
      throw studyError;
    }

    console.log('Successfully stored study material with ID:', studyMaterial.id);

    // Store flashcards
    if (materials.flashcards?.length > 0) {
      console.log('Storing flashcards:', materials.flashcards.length);
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

      if (flashcardsError) {
        console.error('Error storing flashcards:', flashcardsError);
        throw flashcardsError;
      }
      console.log('Successfully stored flashcards');
    }

    // Store quizzes
    if (materials.quiz?.length > 0) {
      console.log('Preparing to store quizzes. Count:', materials.quiz.length);
      
      // Log the formatted data for the first quiz
      const formattedQuizzes = materials.quiz.map(q => ({
        study_material_id: studyMaterial.id,
        question: q.question,
        options: `{${q.options.map(opt => `"${opt.replace(/"/g, '\\"')}"`).join(',')}}`,
        correct_answer: q.correctAnswer,
        user_id: userId
      }));

      console.log('First formatted quiz for reference:', formattedQuizzes[0]);
      
      const { data: quizData, error: quizError } = await supabase
        .from('quizzes')
        .insert(formattedQuizzes)
        .select();

      if (quizError) {
        console.error('Error storing quizzes:', quizError);
        throw quizError;
      }
      console.log('Successfully stored quizzes. Count:', quizData?.length);
    } else {
      console.log('No quizzes to store');
    }

    // Store hashtags
    if (materials.hashtags?.length > 0) {
      console.log('Storing hashtags:', materials.hashtags.length);
      const { error: hashtagsError } = await supabase
        .from('hashtags')
        .insert(
          materials.hashtags.map(tag => ({
            study_material_id: studyMaterial.id,
            tag: tag.toLowerCase(),
            user_id: userId
          }))
        );

      if (hashtagsError) {
        console.error('Error storing hashtags:', hashtagsError);
        throw hashtagsError;
      }
      console.log('Successfully stored hashtags');
    }

    return studyMaterial.id;
  } catch (error) {
    console.error('Error storing study materials:', error);
    // Log the full error details
    console.error('Full error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    throw error;
  }
}

export async function POST(request) {
  try {
    const { url, userId } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required', step: 'validation_failed' },
        { status: 400 }
      );
    }

    let content = '';
    let thumbnail = null;

    // Process YouTube URL
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const videoId = getVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }
      
      // Get video thumbnail
      thumbnail = getVideoThumbnail(videoId);
      
      // Get transcript
      const transcript = await getVideoTranscript(url);
      content = transcript;
    } else {
      // Handle other content types here
      throw new Error('Unsupported content type');
    }

    // Generate study materials
    const studyMaterials = await generateStudyMaterials(content);

    // Store in database
    await storeStudyMaterials(userId, url, studyMaterials, thumbnail);

    return NextResponse.json({ 
      ...studyMaterials, 
      cached: false,
      step: 'completed'
    });
  } catch (error) {
    console.error('Error in process-content:', error);
    return NextResponse.json(
      { 
        error: error.message,
        step: 'error',
        details: error?.response?.data || error.message
      },
      { status: 500 }
    );
  }
}
