/*
 * Wrapper for sort-paths.js to handle CommonJS module.exports
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const compareNumbersInPaths = require('../sorted-index/sort-paths.js');

export default compareNumbersInPaths;

