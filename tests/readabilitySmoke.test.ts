import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

describe('Readability extraction (smoke)', () => {
    it('extracts the main text content from simple article HTML', () => {
        const html = `
            <!doctype html>
            <html>
              <head>
                <title>Test Article</title>
              </head>
              <body>
                <header>Site Header</header>
                <nav>Navigation</nav>
                <article>
                  <h1>My Article</h1>
                  <p>This is the first paragraph of the article body.</p>
                  <p>More content follows with additional details and examples.</p>
                </article>
                <footer>Footer content</footer>
                <script>console.log('noise');</script>
              </body>
            </html>
        `;
        const dom = new JSDOM(html, { url: 'https://example.com/post/1' });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        expect(article).toBeTruthy();
        expect(article!.title).toMatch(/test article|my article/i);
        expect(article!.textContent).toMatch(/first paragraph/);
        expect(article!.textContent).toMatch(/additional details/);
    });
});
