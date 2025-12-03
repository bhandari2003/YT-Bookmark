function getVideoIdFromUrl() {
  try {
    const url = new URL(window.location.href);

    // Standard video
    const v = url.searchParams.get("v");
    if (v) return v;

    // Shorts: /shorts/<id>
    if (url.pathname.startsWith("/shorts/")) {
      const parts = url.pathname.split("/");
      return parts[2] || null;
    }

    return null;
  } catch (e) {
    return null;
  }
}

function getVideoTitle() {
  // Try various selectors for YouTube's current and past DOM structures
  
  // Try h1 with yt-formatted-string
  const title1 = document.querySelector("h1 yt-formatted-string");
  if (title1 && title1.textContent.trim()) return title1.textContent.trim();
  
  // Try direct h1
  const title2 = document.querySelector("h1.title");
  if (title2 && title2.textContent.trim()) return title2.textContent.trim();
  
  // Try meta tags
  const metaTitle = document.querySelector("meta[name='title']");
  if (metaTitle && metaTitle.getAttribute("content")) return metaTitle.getAttribute("content");
  
  // Try og:title
  const ogTitle = document.querySelector("meta[property='og:title']");
  if (ogTitle && ogTitle.getAttribute("content")) return ogTitle.getAttribute("content");
  
  // Fallback to document.title
  return document.title.replace("- YouTube", "").replace("YouTube", "").trim() || "YouTube Video";
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_VIDEO_INFO") {
    const video = document.querySelector("video");
    const videoId = getVideoIdFromUrl();

    if (!video || !videoId) {
      sendResponse({ ok: false, error: "No video found" });
      return true; // Keep message channel open
    }

    const currentTime = Math.floor(video.currentTime || 0);
    const title = getVideoTitle();

    sendResponse({
      ok: true,
      videoId,
      title,
      timestamp: currentTime
    });
    
    return true; // Keep message channel open
  }
});
