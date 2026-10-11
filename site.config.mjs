// Public site identity and host policy. Keep redirects and API routes out of precache.
export const site = {
  origin: 'https://clear-current.example',
  name: 'Clear Current',
  themeStorageKey: 'clear-current-theme',
  navigation: [
    { label: 'Workshops', href: '/workshops/' },
    { label: 'Project support', href: '/project-support/' },
    { label: 'Contact', href: '/contact/' },
  ],
  footer: { label: 'Start a conversation', href: '/contact/' },
  offline: {
    cachePrefix: 'still-starter-reading-',
    workerFile: 'reading-worker.js',
    globPatterns: ['**/*.{html,js,css,json,svg,woff2,ttf}'],
    maxResources: 100,
    maxBytes: 5 * 1024 * 1024,
    maxFileBytes: 2 * 1024 * 1024,
    maxHtmlBytes: 256 * 1024,
    worker: {
      navigationStrategy: 'network-first',
      stripQuery: false,
      excludedPrefixes: ['/api/'],
      navigationFallback: '/offline/index.html',
    },
  },
};
