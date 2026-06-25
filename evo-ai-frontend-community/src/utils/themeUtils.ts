export function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const root = document.documentElement;

  root.classList.remove('dark', 'dar-red');

  if (savedTheme === 'dark') {
    root.classList.add('dark');
  } else if (savedTheme === 'dar-red') {
    root.classList.add('dar-red');
  } else if (savedTheme === 'light') {
    // no class
  } else {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark');
    }
  }
}
