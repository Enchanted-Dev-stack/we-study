import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { getVideoTranscript, getVideoId, getVideoThumbnail } from '@/app/utils/youtube';

// Initialize OpenRouter
const openRouterApiKey = process.env.OPENROUTER_API_KEY;

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

// Sanitize JSON string
function sanitizeJsonString(str) {
  try {
    // First try to find JSON-like structure
    const jsonStart = str.indexOf('{');
    const jsonEnd = str.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('No JSON object found');
    }

    let jsonStr = str.slice(jsonStart, jsonEnd + 1);
    
    // Remove any markdown formatting or text outside the JSON
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '');
    
    // Fix common formatting issues
    jsonStr = jsonStr
      .replace(/(\w+):/g, '"$1":')  // Add quotes to property names
      .replace(/:\s*"([^"]*)"(\s*[}\],])/g, ':"$1"$2')  // Fix trailing quotes
      .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
    
    return jsonStr;
  } catch (error) {
    console.error('Error sanitizing JSON string:', error);
    throw error;
  }
}

async function generateStudyMaterials(content, chunk_index = 0) {
  try {
    const requestBody = {
      model: 'google/gemini-2.0-flash-thinking-exp:free',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Generate study materials from this content. Output ONLY a JSON object with this exact structure:

{
  "summary": "Brief overview of the content",
  "questions": [
    {
      "question": "Clear question text",
      "options": [
        "Option 1",
        "Option 2", 
        "Option 3",
        "Option 4"
      ],
      "correct_answer": "Option 1"
    }
  ],
  "difficulty_level": "beginner",
  "estimated_study_time": 30
}

Rules:
1. Output ONLY the JSON object, no other text
2. Generate exactly 5 multiple choice questions
3. Each question must have exactly 4 options
4. Difficulty level must be one of: beginner, intermediate, advanced
5. Estimated time should be in minutes
6. Ensure all JSON is properly formatted with quotes around strings

Content to process: ${content}`
            }
          ]
        }
      ]
    };

    console.log('Making OpenRouter request for chunk', chunk_index);
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterApiKey}`,
        'HTTP-Referer': 'https://westudy.com',
        'X-Title': 'WeStudy'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('OpenRouter raw response:', JSON.stringify(result, null, 2));

    if (!result || !result.choices || !result.choices.length) {
      console.error('Invalid response structure from OpenRouter:', result);
      throw new Error('Invalid response from OpenRouter: No choices returned');
    }

    const choice = result.choices[0];
    if (!choice.message || !choice.message.content) {
      console.error('Invalid choice structure from OpenRouter:', choice);
      throw new Error('Invalid choice from OpenRouter: No message content');
    }

    const generatedContent = choice.message.content;
    console.log('Generated content:', generatedContent);

    // Try parsing the raw response first
    try {
      const parsedContent = JSON.parse(generatedContent);
      
      // Validate the structure
      if (!parsedContent.summary || !Array.isArray(parsedContent.questions) || 
          !parsedContent.difficulty_level || !parsedContent.estimated_study_time) {
        console.error('Invalid content structure:', parsedContent);
        throw new Error('Invalid response structure');
      }

      return parsedContent;
    } catch (parseError) {
      // If direct parsing fails, try sanitizing
      console.error('Direct parsing failed, attempting sanitization:', parseError);
      try {
        const sanitizedJson = sanitizeJsonString(generatedContent);
        console.log('Sanitized JSON:', sanitizedJson);
        const parsedContent = JSON.parse(sanitizedJson);
        
        if (!parsedContent.summary || !Array.isArray(parsedContent.questions) || 
            !parsedContent.difficulty_level || !parsedContent.estimated_study_time) {
          throw new Error('Invalid response structure after sanitization');
        }

        return parsedContent;
      } catch (sanitizeError) {
        console.error('Error parsing AI response after sanitization:', sanitizeError);
        throw new Error('Failed to parse AI response');
      }
    }
  } catch (error) {
    console.error(`Error generating study materials for chunk ${chunk_index}:`, error);
    throw error;
  }
}

async function storeStudyMaterials(userId, url, materials, thumbnail) {
  try {
    // Log the initial materials
    console.log('Raw materials received:', {
      summary: materials.summary?.length,
      questions: materials.questions?.length,
      difficulty_level: materials.difficulty_level,
      estimated_study_time: materials.estimated_study_time
    });

    if (materials.questions?.length > 0) {
      console.log('First question for reference:', materials.questions[0]);
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

    // Store questions
    if (materials.questions?.length > 0) {
      console.log('Preparing to store questions. Count:', materials.questions.length);
      
      // Log the formatted data for the first question
      const formattedQuestions = materials.questions.map(q => ({
        study_material_id: studyMaterial.id,
        question: q.question,
        options: `{${q.options.map(opt => `"${opt.replace(/"/g, '\\"')}"`).join(',')}}`,
        correct_answer: q.correct_answer,
        user_id: userId
      }));

      console.log('First formatted question for reference:', formattedQuestions[0]);
      
      const { data: questionData, error: questionError } = await supabase
        .from('quizzes')
        .insert(formattedQuestions)
        .select();

      if (questionError) {
        console.error('Error storing questions:', questionError);
        throw questionError;
      }
      console.log('Successfully stored questions. Count:', questionData?.length);
    } else {
      console.log('No questions to store');
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

    // Split content into smaller chunks for processing
    const chunkSize = 5000; // Process 5000 characters at a time
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
          return generateStudyMaterials(chunk, i * concurrencyLimit + index);
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
      questions: [],
      difficulty_level: allResponses[0].difficulty_level,
      estimated_study_time: allResponses[0].estimated_study_time
    };

    for (const response of allResponses) {
      if (response.summary) combinedMaterials.summary.push(...response.summary);
      if (response.questions) combinedMaterials.questions.push(...response.questions);
    }

    // Deduplicate and limit items
    combinedMaterials.summary = Array.from(new Set(combinedMaterials.summary));
    combinedMaterials.questions = combinedMaterials.questions
      .filter((q, index, self) => 
        index === self.findIndex(item => item.question === q.question));

    console.log('Study materials generation completed successfully');
    
    // Store in database
    await storeStudyMaterials(userId, url, combinedMaterials, thumbnail);

    return NextResponse.json({ 
      ...combinedMaterials, 
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
