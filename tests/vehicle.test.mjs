import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vehicleFromQuery } from '../vehicle.js';

test('vehicleFromQuery: known id, unknown id, no parameter', () => {
  const ids = ['compact', 'delorean'];
  assert.equal(vehicleFromQuery('?vehicle=delorean', ids), 'delorean');
  assert.equal(vehicleFromQuery('?debug&vehicle=delorean', ids), 'delorean');
  assert.equal(vehicleFromQuery('?vehicle=tank', ids), null);
  assert.equal(vehicleFromQuery('?debug', ids), null);
  assert.equal(vehicleFromQuery('', ids), null);
  assert.equal(vehicleFromQuery('?vehicle=constructor', ids), null);
});
