export async function cloneWebpage(url: string): Promise<string> {
  // Prioritize allorigins.win as the primary CORS proxy
  const proxyServices = [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];

  async function fetchWithRetry(url: string, attempts = 3, timeout = 8000): Promise<Response> {
    for (let i = 0; i < attempts; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(url, {
          signal: controller.signal,
          mode: 'cors',
          headers: {
            'Accept': '*/*',
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.status === 404) {
          throw new Error(`Resource not found: ${url}`);
        }
        
        if (response.ok) return response;
        throw new Error(`HTTP error! status: ${response.status}`);
      } catch (error) {
        console.log(`Attempt ${i + 1} failed for ${url}:`, error);
        if (i === attempts - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
    throw new Error(`Failed to fetch after ${attempts} attempts`);
  }

  async function fetchWithProxies(targetUrl: string, isBinary = false): Promise<any> {
    let lastError;
    
    if (isBinary) {
      try {
        const response = await fetchWithRetry(targetUrl);
        return await response.blob();
      } catch (error) {
        console.log('Direct fetch failed, trying proxies');
      }
    }
    
    for (const proxyService of proxyServices) {
      try {
        const proxyUrl = proxyService(targetUrl);
        console.log(`Trying proxy: ${proxyUrl}`);
        
        const response = await fetchWithRetry(proxyUrl);
        
        if (isBinary) {
          return await response.blob();
        }
        
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch {
          return { contents: text };
        }
      } catch (error) {
        console.log(`Proxy failed: ${proxyService(targetUrl)}`);
        lastError = error;
        continue;
      }
    }
    
    if (isBinary) {
      console.log(`All proxies failed for binary content: ${targetUrl}, keeping original URL`);
      return null;
    }
    
    throw lastError || new Error('All proxy services failed');
  }

  function processUrl(originalUrl: string, baseUrl: string): string {
    try {
      if (originalUrl.startsWith('data:')) return originalUrl;
      if (originalUrl.startsWith('blob:')) return originalUrl;
      if (originalUrl.startsWith('//')) {
        return `https:${originalUrl}`;
      }
      const absoluteUrl = new URL(originalUrl, baseUrl).href;
      return absoluteUrl;
    } catch {
      return originalUrl;
    }
  }

  try {
    const data = await fetchWithProxies(url);
    const html = data.contents;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Process meta tags and ensure proper encoding
    const metaTags = Array.from(doc.querySelectorAll('meta'));
    metaTags.forEach(meta => {
      if (meta.getAttribute('charset')) {
        meta.setAttribute('charset', 'UTF-8');
      }
    });

    // Process all external stylesheets
    const styleSheets = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    await Promise.allSettled(styleSheets.map(async (stylesheet) => {
      const href = stylesheet.getAttribute('href');
      if (href) {
        try {
          const cssUrl = processUrl(href, url);
          const cssData = await fetchWithProxies(cssUrl);
          const style = doc.createElement('style');
          style.textContent = cssData.contents;
          stylesheet.parentNode?.replaceChild(style, stylesheet);
        } catch (error) {
          console.warn('Failed to fetch stylesheet:', href);
        }
      }
    }));

    // Process inline styles with url() references
    const styleElements = Array.from(doc.querySelectorAll('style'));
    styleElements.forEach(style => {
      if (style.textContent) {
        style.textContent = style.textContent.replace(
          /url\(['"]?([^'")\s]+)['"]?\)/g,
          (match, p1) => `url("${processUrl(p1, url)}")`
        );
      }
    });

    // Process all images and other media
    const mediaElements = Array.from(doc.querySelectorAll('img, video, audio, source'));
    await Promise.allSettled(mediaElements.map(async (element) => {
      const srcAttr = element.getAttribute('src') || element.getAttribute('srcset');
      if (srcAttr) {
        try {
          const mediaUrl = processUrl(srcAttr, url);
          const blob = await fetchWithProxies(mediaUrl, true);
          if (blob) {
            const reader = new FileReader();
            await new Promise((resolve) => {
              reader.onload = () => {
                element.setAttribute('src', reader.result as string);
                resolve(null);
              };
              reader.readAsDataURL(blob);
            });
          }
        } catch (error) {
          console.warn(`Failed to fetch media:`, srcAttr);
        }
      }
    }));

    // Process scripts
    const scripts = Array.from(doc.querySelectorAll('script[src]'));
    await Promise.allSettled(scripts.map(async (script) => {
      const src = script.getAttribute('src');
      if (src) {
        try {
          const scriptUrl = processUrl(src, url);
          const scriptData = await fetchWithProxies(scriptUrl);
          const newScript = doc.createElement('script');
          newScript.textContent = scriptData.contents;
          script.parentNode?.replaceChild(newScript, script);
        } catch (error) {
          console.warn('Failed to fetch script:', src);
        }
      }
    }));

    // Add sandbox attribute to iframes
    const iframes = Array.from(doc.querySelectorAll('iframe'));
    iframes.forEach(iframe => {
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
    });

    // Add base tag to handle relative URLs that weren't processed
    const baseTag = doc.createElement('base');
    baseTag.href = url;
    doc.head.insertBefore(baseTag, doc.head.firstChild);

    return doc.documentElement.outerHTML;
  } catch (error) {
    console.error('Cloning error:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to clone webpage');
  }
}