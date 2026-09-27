import test from 'node:test';
import assert from 'node:assert/strict';

import { estUnRobot, provenance } from '../src/web/provenance.ts';

const p = (q = '') => new URLSearchParams(q);

test('d’où vient la visite : lien partagé, moteur de recherche, ou autre', () => {
  assert.equal(provenance('', p('?defi')), 'partage');
  assert.equal(provenance('', p('?salon=ABCD')), 'partage');
  assert.equal(provenance('https://www.google.com/', p('?via=partage')), 'partage', 'la marque du partage l’emporte');
  assert.equal(provenance('https://www.google.fr/', p()), 'recherche');
  assert.equal(provenance('https://www.bing.com/search?q=president', p()), 'recherche');
  assert.equal(provenance('https://duckduckgo.com/', p()), 'recherche');
  assert.equal(provenance('https://www.qwant.com/', p()), 'recherche');
  assert.equal(provenance('https://github.com/mickaelmarinho/larbin', p()), 'autre');
  assert.equal(provenance('', p()), 'autre');
  assert.equal(provenance('pas une adresse', p()), 'autre');
  assert.equal(provenance('https://googleusercontent.example.com/', p()), 'autre', 'pas n’importe quel « google »');
});

test('les robots ne comptent pas comme des visiteurs', () => {
  assert.equal(estUnRobot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
  assert.equal(estUnRobot('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'), true);
  assert.equal(estUnRobot('Mozilla/5.0 (Windows NT 10.0) HeadlessChrome/140.0'), true);
  assert.equal(estUnRobot('WhatsApp/2.23.20.0'), true, 'l’aperçu d’un lien dans WhatsApp');
  assert.equal(estUnRobot('Mozilla/5.0 (Linux; Android 14) Chrome/140.0 Mobile Safari/537.36'), false);
  assert.equal(estUnRobot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1', true), true, 'un navigateur piloté');
});
