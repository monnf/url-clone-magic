export async function cloneWebpage(url: string): Promise<string> {
  try {
    // Fetch the webpage
    const response = await fetch(url);
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
          const cssResponse = await fetch(cssUrl);
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
          const imageResponse = await fetch(imageUrl);
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

    // Process inline styles
    const elements = doc.querySelectorAll('*[style]');
    elements.forEach((element) => {
      const computedStyle = window.getComputedStyle(element);
      element.setAttribute('style', computedStyle.cssText);
    });

    return doc.documentElement.outerHTML;
  } catch (error) {
    throw new Error('Failed to clone webpage');
  }
}