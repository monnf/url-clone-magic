export async function cloneWebpage(url: string): Promise<string> {
  // List of CORS proxies to try
  const proxyServices = [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];

  async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await fetch(url, {
          mode: 'cors',
          headers: {
            'Accept': '*/*',
          }
        });
        if (response.ok) return response;
      } catch (error) {
        console.log(`Attempt ${i + 1} failed for ${url}`);
        if (i === attempts - 1) throw error;
      }
    }
    throw new Error(`Failed to fetch after ${attempts} attempts`);
  }

  async function fetchWithProxies(targetUrl: string, isBinary = false): Promise<any> {
    for (const proxyService of proxyServices) {
      try {
        const response = await fetchWithRetry(proxyService(targetUrl));
        
        if (isBinary) {
          const blob = await response.blob();
          return blob;
        }
        
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch {
          return { contents: text };
        }
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
          console.error('Failed to fetch stylesheet:', href);
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
          const blob = await fetchWithProxies(imageUrl, true);
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
          console.error('Failed to fetch script:', src);
        }
      }
    }));

    return doc.documentElement.outerHTML;
  } catch (error) {
    console.error('Cloning error:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to clone webpage');
  }
}