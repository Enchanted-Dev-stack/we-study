import axios from 'axios';

// Get video ID from URL
export function getVideoId(url) {
  try {
    const urlObj = new URL(url);
    let videoId = '';

    if (urlObj.hostname === 'youtu.be') {
      videoId = urlObj.pathname.slice(1);
    } else if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
      videoId = urlObj.searchParams.get('v');
    }

    return videoId;
  } catch (error) {
    console.error('Error parsing YouTube URL:', error);
    return null;
  }
}

// Get video thumbnail URL
export function getVideoThumbnail(videoId) {
  // Return highest quality thumbnail available
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// Get video transcript
export async function getVideoTranscript(videoUrl) {
  console.log('Starting transcript fetch for:', videoUrl);
  try {
    // Extract video ID from URL
    const videoId = getVideoId(videoUrl);
    if (!videoId) {
      console.error('Invalid YouTube URL, could not extract video ID');
      throw new Error('Invalid YouTube URL');
    }
    console.log('Extracted video ID:', videoId);

    // First try with English
    const options = {
      method: 'GET',
      url: 'https://youtube-transcriptor.p.rapidapi.com/transcript',
      params: {
        video_id: videoId,
        lang: ''
      },
      headers: {
        'x-rapidapi-key': process.env.NEXT_PUBLIC_RAPIDAPI_KEY,
        'x-rapidapi-host': 'youtube-transcriptor.p.rapidapi.com'
      }
    };

    console.log('Making RapidAPI request for video ID:', videoId);
    let response = await axios.request(options);
    
    // If we get a language availability error, try with the first available language
    if (response.data?.error === 'This language is not available on this video.' && 
        Array.isArray(response.data?.availableLangs) && 
        response.data.availableLangs.length > 0) {
      console.log('English not available, trying with language:', response.data.availableLangs[0]);
      
      // Update options with the first available language
      options.params.lang = response.data.availableLangs[0];
      response = await axios.request(options);
    }

    if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      console.error('Invalid response format:', response.data);
      throw new Error('Invalid response from transcript service');
    }

    // Get the first transcript result
    const transcriptData = response.data[0];
    
    if (!transcriptData.transcription || !Array.isArray(transcriptData.transcription)) {
      console.error('No transcription found in response');
      throw new Error('No transcript available for this video');
    }

    // Combine all subtitles into a single text
    const fullText = transcriptData.transcription
      .map(item => item.subtitle)
      .join(' ')
      .replace(/\[.*?\]/g, '') // Remove text in square brackets like [Applause]
      .replace(/\s+/g, ' ')    // Replace multiple spaces with single space
      .trim();

    console.log('Successfully processed transcript, length:', fullText.length);
    
    // If we used a non-English language, add a note
    if (options.params.lang !== 'en') {
      return `[Note: This transcript is in ${options.params.lang} language as English was not available] ${fullText}`;
    }
    
    return fullText;
  } catch (error) {
    console.error('Detailed error in getVideoTranscript:', {
      message: error?.message,
      response: error?.response?.data,
      status: error?.response?.status
    });
    if (error?.response?.data?.error) {
      throw new Error(`Failed to get video transcript: ${error.response.data.error}`);
    }
    throw new Error(`Failed to get video transcript: ${error.message}`);
  }
}
