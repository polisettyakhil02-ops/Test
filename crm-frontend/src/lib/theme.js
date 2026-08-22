// App-wide dark/light theme. Deliberately tiny and framework-free: the CSS
// custom properties in styles/base.css do all the real work once
// `data-theme` is set on <html> - nothing else needs to read the value in
// JS, so there's no context/provider, just a getter and a setter.
//
// Default is 'dark' - this switch was the whole point of the change (the
// Developer Workstation's look becomes the app's look), not an opt-in.
export const THEME_STORAGE_KEY = 'dominare_theme';
export const DEFAULT_THEME = 'dark';

export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage can throw in a locked-down/private context - the toggle
    // still works for the session, it just won't persist across reloads.
  }
}

export function toggleTheme() {
  const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
