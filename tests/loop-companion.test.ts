import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CSS,JS} from '../src/views.ts';
test('draft companion uses native submission and resets on return',()=>{assert.match(JS,/e\.defaultPrevented/);assert.match(JS,/data-loop-draft/);assert.match(JS,/pageshow/);assert.match(JS,/p\.hidden=true/);assert.match(CSS,/prefers-reduced-motion:reduce/);});

test('Loop uses eight cloud frames, not the previous dragon image',()=>{assert.match(CSS,/\.loop-cloud\{/);assert.match(CSS,/steps\(8,end\)/);assert.match(CSS,/prefers-reduced-motion:reduce\)\{\.loop-cloud\{animation:none/);const match=CSS.match(/loop-cloud\{[^}]*base64,([A-Za-z0-9+/=]+)/);const encoded=match?.[1];assert.ok(encoded,'Loop sprite payload must be present');const bytes=Buffer.from(encoded,'base64');assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',12,16),'VP8X');assert.equal(bytes.readUIntLE(24,3)+1,320);assert.equal(bytes.readUIntLE(27,3)+1,30);});
