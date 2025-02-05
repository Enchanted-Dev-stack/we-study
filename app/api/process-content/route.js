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

async function sanitizeJsonString(text) {
  try {
    // Remove markdown code blocks first
    let cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    
    try {
      // If it's already valid JSON, return it
      JSON.parse(cleaned);
      return cleaned;
    } catch (e) {
      // Continue with cleaning if not valid JSON
    }

    // Extract the JSON object if it's wrapped in other text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    // Replace escaped quotes and normalize quotes
    cleaned = cleaned
      .replace(/\\"/g, "'")
      .replace(/(\w)"(\w)/g, "$1'$2")
      .replace(/([:{,]\s*)"([^"]+)"/g, '$1"$2"')
      .replace(/([:{,]\s*)([a-zA-Z0-9_]+):/g, '$1"$2":');

    // Handle nested quotes in text
    cleaned = cleaned.replace(/"([^"]*)"([^"]*)"([^"]*)"/g, (match, p1, p2, p3) => {
      const fixed = (p1 + p2 + p3).replace(/"/g, "'");
      return `"${fixed}"`;
    });

    return cleaned;
  } catch (error) {
    console.error('Error in sanitizeJsonString:', error);
    throw error;
  }
}

async function parseGeminiResponse(response) {
  try {
    const text = response.text();
    console.log('Raw response text:', text.substring(0, 200) + '...');

    // First attempt: direct parse after basic cleanup
    const sanitizedText = await sanitizeJsonString(text);
    
    try {
      return JSON.parse(sanitizedText);
    } catch (firstError) {
      console.error('First parse attempt failed:', firstError);
      console.log('Failed text:', sanitizedText);
      
      // Second attempt: more aggressive cleaning
      let fixedText = sanitizedText
        // Fix potential quote issues
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
        // Ensure proper quotes around string values
        .replace(/:\s*"?([^",}\]]+)"?([,}])/g, ':"$1"$2')
        // Fix arrays with unquoted strings
        .replace(/\[([^\]]+)\]/g, (match, p1) => {
          return '[' + p1.split(',')
            .map(item => item.trim())
            .map(item => item.startsWith('"') ? item : `"${item}"`)
            .join(',') + ']';
        });

      console.log('Fixed text:', fixedText.substring(0, 200) + '...');

      try {
        return JSON.parse(fixedText);
      } catch (secondError) {
        console.error('Second parse attempt failed:', secondError);
        
        // Third attempt: try to extract valid JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extractedJson = jsonMatch[0];
          console.log('Extracted JSON:', extractedJson.substring(0, 200) + '...');
          
          try {
            return JSON.parse(extractedJson);
          } catch (thirdError) {
            console.error('Third parse attempt failed:', thirdError);
            throw thirdError;
          }
        }
        throw secondError;
      }
    }
  } catch (error) {
    console.error('Failed to parse Gemini response:', error);
    throw new Error('Invalid response format from AI. Details: ' + error.message);
  }
}

// Utility function for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Retry function with exponential backoff
async function retryWithBackoff(fn, maxRetries = 5, initialDelay = 10000) {
  let retries = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      
      // Stop if we've exceeded max retries
      if (retries > maxRetries) {
        console.error(`Failed after ${maxRetries} retries:`, error);
        throw error;
      }

      // Calculate delay based on error type
      let waitTime = initialDelay;
      if (error.status === 429) { // Rate limit
        waitTime = initialDelay * Math.pow(2, retries - 1); // 10s, 20s, 40s, etc.
        console.log(`Rate limited. Waiting ${waitTime/1000} seconds before retry ${retries}/${maxRetries}`);
      } else if (error.status === 500) { // Internal server error
        waitTime = 15000; // Fixed 15 second delay for server errors
        console.log(`Server error. Waiting ${waitTime/1000} seconds before retry ${retries}/${maxRetries}`);
      } else {
        throw error; // For other errors, don't retry
      }

      // Wait before retrying
      await delay(waitTime);
    }
  }
}

async function generateStudyMaterials(content) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const chunks = [];
    const chunkSize = 4000;
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    const prompt = `
      Generate study materials in valid JSON format. DO NOT use quotes within text content.
      
      Content to analyze: ${content.substring(0, 4000)}

      Return ONLY a JSON object exactly like this example (no other text):
      {
        "summary": [
          "First key point about the topic",
          "Second key point about the topic"
        ],
        "flashcards": [
          {
            "question": "Simple question without quotes",
            "answer": "Simple answer without quotes"
          }
        ],
        "quiz": [
          {
            "question": "Simple question without quotes",
            "options": [
              "First option",
              "Second option",
              "Third option",
              "Fourth option"
            ],
            "correctAnswer": "First option"
          }
        ],
        "hashtags": ["topic", "subtopic"],
        "difficulty_level": "beginner",
        "estimated_study_time": "30 minutes"
      }

      IMPORTANT RULES:
      1. Do not use quotes (") inside any text - rephrase to avoid them
      2. Use simple words and punctuation only (periods, commas)
      3. Keep all text content basic and clean
      4. Format must be exact - no extra fields or formatting
      5. Each string must be in double quotes
      6. Arrays and objects must use square and curly brackets
      7. Use commas between items
      8. No trailing commas
    `;

    // Process content
    if (chunks.length > 1) {
      let allResults = [];
      for (const chunk of chunks) {
        const chunkPrompt = prompt.replace(content.substring(0, 4000), chunk);
        
        const result = await retryWithBackoff(async () => {
          const response = await model.generateContent(chunkPrompt);
          const text = response.response.text();
          const sanitized = await sanitizeJsonString(text);
          return JSON.parse(sanitized);
        });

        allResults.push(result);
        
        // Add a delay between chunks to avoid rate limits
        if (chunks.length > 1) {
          await delay(5000); // 5 second delay between chunks
        }
      }

      // Combine results
      return {
        summary: allResults.flatMap(r => r.summary || []),
        flashcards: allResults.flatMap(r => r.flashcards || []),
        quiz: allResults.flatMap(r => r.quiz || []),
        hashtags: [...new Set(allResults.flatMap(r => r.hashtags || []))].slice(0, 8),
        difficulty_level: allResults[0].difficulty_level || 'beginner',
        estimated_study_time: allResults[0].estimated_study_time || '30 minutes'
      };
    }

    // For shorter content
    return await retryWithBackoff(async () => {
      const response = await model.generateContent(prompt);
      const text = response.response.text();
      const sanitized = await sanitizeJsonString(text);
      return JSON.parse(sanitized);
    });

  } catch (error) {
    console.error('Error generating study materials:', error);
    if (error.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    } else if (error.status === 500) {
      throw new Error('Server temporarily unavailable. Please try again.');
    }
    throw new Error('Failed to generate study materials: ' + error.message);
  }
}

async function storeStudyMaterials(userId, url, materials) {
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
