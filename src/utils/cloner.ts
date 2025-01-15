export async function cloneWebpage(url: string): Promise<string> {
  // List of CORS proxies to try
  const proxyServices = [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => `https://cors-anywhere.herokuapp.com/${url}`,
    (url: string) => `https://crossorigin.me/${url}`
  ];

  async function fetchWithRetry(url: string, attempts = 3, timeout = 5000): Promise<Response> {
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
          console.error('Failed to fetch stylesheet:', href);
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
          console.error(`Failed to fetch media:`, srcAttr);
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
          console.error('Failed to fetch script:', src);
        }
      }
    }));

    // Process favicons and other link elements
    const linkElements = Array.from(doc.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]'));
    await Promise.allSettled(linkElements.map(async (link) => {
      const href = link.getAttribute('href');
      if (href) {
        try {
          const iconUrl = processUrl(href, url);
          const blob = await fetchWithProxies(iconUrl, true);
          if (blob) {
            const reader = new FileReader();
            await new Promise((resolve) => {
              reader.onload = () => {
                link.setAttribute('href', reader.result as string);
                resolve(null);
              };
              reader.readAsDataURL(blob);
            });
          }
        } catch (error) {
          console.error('Failed to fetch icon:', href);
        }
      }
    }));

    // Process background images in inline styles
    const elementsWithStyle = Array.from(doc.querySelectorAll('[style]'));
    elementsWithStyle.forEach(element => {
      const style = element.getAttribute('style');
      if (style) {
        const newStyle = style.replace(
          /url\(['"]?([^'")\s]+)['"]?\)/g,
          (match, p1) => `url("${processUrl(p1, url)}")`
        );
        element.setAttribute('style', newStyle);
      }
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