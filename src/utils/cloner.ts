export async function cloneWebpage(url: string): Promise<string> {
  try {
    // Using cors-anywhere as an alternative proxy
    const proxyUrl = `https://cors-anywhere.herokuapp.com/${url}`;
    
    // Fetch the webpage
    const response = await fetch(proxyUrl, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
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
          const cssResponse = await fetch(`https://cors-anywhere.herokuapp.com/${cssUrl}`, {
            headers: {
              'X-Requested-With': 'XMLHttpRequest'
            }
          });
          if (!cssResponse.ok) throw new Error(`Failed to fetch CSS: ${cssResponse.status}`);
          const cssText = await cssResponse.text();
          const style = doc.createElement('style');
          style.textContent = cssText;
          stylesheet.parentNode?.replaceChild(style, stylesheet);
        } catch (error) {
          console.error('Failed to fetch stylesheet:', href, error);
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
          const imageResponse = await fetch(`https://cors-anywhere.herokuapp.com/${imageUrl}`, {
            headers: {
              'X-Requested-With': 'XMLHttpRequest'
            }
          });
          if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageResponse.status}`);
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
          console.error('Failed to fetch image:', src, error);
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
          const scriptResponse = await fetch(`https://cors-anywhere.herokuapp.com/${scriptUrl}`, {
            headers: {
              'X-Requested-With': 'XMLHttpRequest'
            }
          });
          if (!scriptResponse.ok) throw new Error(`Failed to fetch script: ${scriptResponse.status}`);
          const scriptText = await scriptResponse.text();
          const newScript = doc.createElement('script');
          newScript.textContent = scriptText;
          script.parentNode?.replaceChild(newScript, script);
        } catch (error) {
          console.error('Failed to fetch script:', src, error);
        }
      }
    }));

    return doc.documentElement.outerHTML;
  } catch (error) {
    console.error('Cloning error:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to clone webpage');
  }
}