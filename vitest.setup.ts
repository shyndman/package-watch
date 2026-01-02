/**
 * Vitest setup file.
 * Polyfills Temporal API for Node.js test environment.
 * This polyfill is NOT bundled into browser builds - the browser has native Temporal support.
 */
import { Temporal } from '@js-temporal/polyfill';

// @ts-expect-error - Temporal is not in Node.js globals yet
globalThis.Temporal = Temporal;
