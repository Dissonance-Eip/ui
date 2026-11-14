/**
 * Renderer entry point — invoked from index.html as a module script.
 * Waits for DOMContentLoaded, then hands off to the composition root.
 */
import { bootstrap } from './app/bootstrap.js';

window.addEventListener('DOMContentLoaded', () => {
  bootstrap();
});
