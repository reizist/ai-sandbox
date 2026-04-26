export interface Route {
  path: RegExp;
  render: (params: string[]) => Promise<void> | void;
}

export class Router {
  private routes: Route[] = [];
  private notFound: () => void = () => {};

  on(pattern: string, render: Route['render']): this {
    const regex = new RegExp(
      '^' +
        pattern.replace(/:[^/]+/g, '([^/]+)').replace(/\//g, '\\/') +
        '$'
    );
    this.routes.push({ path: regex, render });
    return this;
  }

  setNotFound(handler: () => void): this {
    this.notFound = handler;
    return this;
  }

  start(): void {
    window.addEventListener('hashchange', () => this.dispatch());
    this.dispatch();
  }

  navigate(hash: string): void {
    if (location.hash === hash) {
      this.dispatch();
    } else {
      location.hash = hash;
    }
  }

  private dispatch(): void {
    const hash = location.hash.replace(/^#/, '') || '/';
    for (const route of this.routes) {
      const m = hash.match(route.path);
      if (m) {
        const params = m.slice(1).map((p) => decodeURIComponent(p));
        Promise.resolve(route.render(params)).catch((err) => {
          console.error('[router]', err);
          renderError(err);
        });
        return;
      }
    }
    this.notFound();
  }
}

function renderError(err: Error) {
  const main = document.getElementById('view');
  if (main) {
    main.innerHTML = `<div class="error">Error: ${escapeHtml(err.message)}</div>`;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
