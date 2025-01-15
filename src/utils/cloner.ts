export async function cloneWebpage(url: string): Promise<string> {
  try {
    // Create a proxy URL to bypass CORS
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    
    // Fetch the webpage
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch webpage');
    }
    const html = await response.text();

    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Process external stylesheets
    const styleSheets = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    await Promise.all(styleSheets.map(async (stylesheet) => {
      const href = stylesheet.getAttribute('href');
      if (href) {
        try {
          const cssUrl = new URL(href, url).href;
          const cssResponse = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(cssUrl)}`);
          const cssText = await cssResponse.text();
          const style = doc.createElement('style');
          style.textContent = cssText;
          stylesheet.parentNode?.replaceChild(style, stylesheet);
        } catch (error) {
          console.error('Failed to fetch stylesheet:', href);
        }
      }
    }));

    // Process images
    const images = Array.from(doc.querySelectorAll('img'));
    await Promise.all(images.map(async (img) => {
      const src = img.getAttribute('src');
      if (src) {
        try {
          const imageUrl = new URL(src, url).href;
          const imageResponse = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`);
          const blob = await imageResponse.blob();
          const reader = new FileReader();
          await new Promise((resolve) => {
            reader.onload = () => {
              img.src = reader.result as string;
              resolve(null);
            };
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.error('Failed to fetch image:', src);
        }
      }
    }));

    // Process scripts
    const scripts = Array.from(doc.querySelectorAll('script[src]'));
    await Promise.all(scripts.map(async (script) => {
      const src = script.getAttribute('src');
      if (src) {
        try {
          const scriptUrl = new URL(src, url).href;
          const scriptResponse = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(scriptUrl)}`);
          const scriptText = await scriptResponse.text();
          const newScript = doc.createElement('script');
          newScript.textContent = scriptText;
          script.parentNode?.replaceChild(newScript, script);
        } catch (error) {
          console.error('Failed to fetch script:', src);
        }
      }
    }));

    return doc.documentElement.outerHTML;
  } catch (error) {
    throw new Error('Failed to clone webpage');
  }
}