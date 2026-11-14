/**
 * Show-one-hide-others switcher for the three top-level view sections
 * (upload / analyze / compare). Constructed with a `{ name → element }`
 * map; show(name) flips the `hidden` attribute on each section.
 */
export class ViewRouter {
  constructor(views) {
    this.views = views;
  }

  show(name) {
    for (const [key, el] of Object.entries(this.views)) {
      if (!el) continue;
      el.hidden = key !== name;
    }
  }
}
