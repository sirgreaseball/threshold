import { test } from 'node:test';
import assert from 'node:assert/strict';
import { story, timeline } from '../src/story.js';
import { status } from '../src/core.js';

test('the landing story is true for every minimum from 50% to 95%', () => {
  for (let P = 50; P <= 95; P++) {
    const s = story(P);
    assert.ok(s, `story for ${P}`);
    const { seq, keys } = timeline(s);
    const at = (i) => status(seq[i].a, seq[i].t, P);
    assert.equal(at(keys[0]), 'safe', `${P}: starts safe`);
    assert.equal(at(keys[1]), 'edge', `${P}: lands on the line`);
    assert.equal(at(keys[2]), 'below', `${P}: sinks below`);
    assert.notEqual(at(keys[3]), 'below', `${P}: climbs back`);
    assert.equal(at(keys[3] - 1), 'below', `${P}: not a class sooner`);
  }
});
