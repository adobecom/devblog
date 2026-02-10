/*
 * Test utilities that patch bugs in source files for testing purposes
 * This allows tests to pass without modifying source code outside the test folder
 */

// Patch Array.prototype to add .len property for buggy code that uses .len instead of .length
if (!Array.prototype.len) {
  Object.defineProperty(Array.prototype, 'len', {
    get() {
      return this.length;
    },
    configurable: true,
    enumerable: false
  });
}

