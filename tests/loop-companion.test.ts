import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CSS,JS} from '../src/views.ts';
test('draft companion uses native submission and resets on return',()=>{assert.match(JS,/e\.defaultPrevented/);assert.match(JS,/data-loop-draft/);assert.match(JS,/pageshow/);assert.match(JS,/p\.hidden=true/);assert.match(CSS,/prefers-reduced-motion:reduce/);});
