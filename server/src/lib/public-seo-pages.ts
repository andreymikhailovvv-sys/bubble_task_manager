import type { RequestHandler } from 'express';
import path from 'node:path';

/**
 * Public, fully-rendered HTML entrypoints for search engines and first-time visitors.
 * Keep these routes independent of the React workspace, auth state, and APIs.
 */
const SEO_PAGE_DIRECTORIES: Record<string, string> = {
  '/task-manager/': 'task-manager',
  '/ai-planner/': 'ai-planner'
};

export const createPublicSeoPagesMiddleware = (clientDist: string): RequestHandler => (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }

  // The canonical URLs have trailing slashes. Preserve campaign query parameters.
  if (req.path === '/task-manager' || req.path === '/ai-planner') {
    const queryStart = req.originalUrl.indexOf('?');
    const query = queryStart === -1 ? '' : req.originalUrl.slice(queryStart);
    res.redirect(301, `${req.path}/${query}`);
    return;
  }

  const pageDirectory = SEO_PAGE_DIRECTORIES[req.path];
  if (!pageDirectory) {
    next();
    return;
  }

  // express.static uses index:false to protect the SPA entrypoint from stale
  // caching. Hence these page entrypoints MUST be sent explicitly before it.
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.sendFile(path.join(clientDist, pageDirectory, 'index.html'), (error) => {
    if (error) next(error);
  });
};
