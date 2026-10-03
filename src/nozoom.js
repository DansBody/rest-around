// The page itself never zooms: the camera does that. index.html asks for user-scalable=no, but iOS Safari
// ignores it, so its pinch gestures and any two-finger move on the page are cancelled here, and a trackpad
// pinch on a desktop (ctrl + wheel) too. Double-tap zoom is off through touch-action in style.css.
// Typing: iOS slides the page up to keep the field above the keyboard and can leave it there after the
// keyboard closes, so the page is put back once no field has focus.
export function lockPageZoom() {
  const stop = (e) => e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  const typing = () => { const el = document.activeElement; return !!el && el.matches('input:not([type=range]):not([type=checkbox]), textarea'); };
  document.addEventListener('focusout', () => setTimeout(() => { if (!typing() && (window.scrollX || window.scrollY)) window.scrollTo(0, 0); }, 60));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (!typing() && (window.scrollX || window.scrollY)) window.scrollTo(0, 0); });
}
