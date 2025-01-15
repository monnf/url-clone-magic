export async function cloneWebpage(url: string): Promise<string> {
  // List of CORS proxies to try
  const proxyServices = [
    (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&charset=UTF-8`,
    (url: string) => `https://cors-proxy.htmldriven.com/?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await fetch(url);
        if (response.ok) return response;
      } catch (error) {
        console.log(`Attempt ${i + 1} failed for ${url}`);
        if (i === attempts - 1) throw error;
      }
    }
    throw new Error(`Failed to fetch after ${attempts} attempts`);
  }

  async function fetchWithProxies(targetUrl: string): Promise<{ contents: string }> {
    for (const proxyService of proxyServices) {
      try {
        const response = await fetchWithRetry(proxyService(targetUrl));
        const data = await response.json();
        return data.contents ? { contents: data.contents } : { contents: data };
      } catch (error) {
        console.log(`Proxy failed: ${proxyService(targetUrl)}`);
        continue;
      }
    }
    throw new Error('All proxy services failed');
  }

  try {
    // Fetch the webpage
    const data = await fetchWithProxies(url);
    const html = data.contents;

    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Process external stylesheets
    const styleSheets = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    await Promise.allSettled(styleSheets.map(async (stylesheet) => {
      const href = stylesheet.getAttribute('href');
      if (href) {
        try {
          const cssUrl = new URL(href, url).href;
          const cssData = await fetchWithProxies(cssUrl);
          const style = doc.createElement('style');
          style.textContent = cssData.contents;
          stylesheet.parentNode?.replaceChild(style, stylesheet);
        } catch (error) {
          console.error('Failed to fetch stylesheet:', href, error);
          // Keep the original stylesheet link if fetch fails
        }
      }
    }));

    // Process images
    const images = Array.from(doc.querySelectorAll('img'));
    await Promise.allSettled(images.map(async (img) => {
      const src = img.getAttribute('src');
      if (src) {
        try {
          const imageUrl = new URL(src, url).href;
          const response = await fetchWithRetry(`https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`);
          const blob = await response.blob();
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
          // Keep the original image source if fetch fails
        }
      }
    }));

    // Process scripts
    const scripts = Array.from(doc.querySelectorAll('script[src]'));
    await Promise.allSettled(scripts.map(async (script) => {
      const src = script.getAttribute('src');
      if (src) {
        try {
          const scriptUrl = new URL(src, url).href;
          const scriptData = await fetchWithProxies(scriptUrl);
          const newScript = doc.createElement('script');
          newScript.textContent = scriptData.contents;
          script.parentNode?.replaceChild(newScript, script);
        } catch (error) {
          console.error('Failed to fetch script:', src, error);
          // Keep the original script tag if fetch fails
        }
      }
    }));

    return doc.documentElement.outerHTML;
  } catch (error) {
    console.error('Cloning error:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to clone webpage');
  }
}
