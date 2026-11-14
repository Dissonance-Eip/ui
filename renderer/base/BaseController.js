import { Disposable } from './Disposable.js';

/**
 * Base class for top-level renderer controllers.
 * Adds a start() hook on top of Disposable; dispose() is the teardown.
 * Currently only AppController extends it.
 */
export class BaseController extends Disposable {
  start() {}
}
