import { YoutubeTranscript } from 'youtube-transcript';

export async function getVideoTranscript(videoUrl) {
  try {
    // Extract video ID from URL
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // Get transcript
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    
    // Combine all text from transcript
    const fullText = transcript
      .map(item => item.text)
      .join(' ');

    return fullText;
  } catch (error) {
    console.error('Error getting YouTube transcript:', error);
    throw new Error('Failed to get video transcript');
  }
}

function extractVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}
