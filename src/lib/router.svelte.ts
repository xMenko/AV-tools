export type Route = { name: 'home' } | { name: 'about' } | { name: 'tool'; id: string };

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path === 'about') return { name: 'about' };
  const m = /^tool\/([\w-]+)$/.exec(path);
  if (m) return { name: 'tool', id: m[1]! };
  return { name: 'home' };
}

export const router = $state<{ route: Route }>({ route: parse(location.hash) });

window.addEventListener('hashchange', () => {
  router.route = parse(location.hash);
  window.scrollTo(0, 0);
});

export const href = {
  home: '#/',
  about: '#/about',
  tool: (id: string) => `#/tool/${id}`,
};
