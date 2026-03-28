'use strict';

const assert = require('assert');
const { getPublicGameCatalog, buildGameCatalogSummary } = require('../config/gameCatalog');
const { buildPublicRouteManifest, isCompatRewriteCandidate, toCompatApiPath } = require('../utils/routeManifest');

const catalog = getPublicGameCatalog();
const summary = buildGameCatalogSummary(catalog);
const manifest = buildPublicRouteManifest();

assert.ok(Array.isArray(catalog) && catalog.length >= 9, 'Oyun kataloğu en az 9 oyun içermeli.');
assert.equal(summary.total, catalog.length, 'Katalog özeti toplam oyun sayısını doğru hesaplamalı.');
assert.ok(manifest.routeGroups.home.includes('/api/home/showcase'), 'Home showcase manifestte görünmeli.');
assert.equal(isCompatRewriteCandidate('/home/showcase'), true, 'Home showcase compat rewrite adayı olmalı.');
assert.equal(toCompatApiPath('/home/showcase'), '/api/home/showcase', 'Home showcase compat rewrite yolu doğru olmalı.');
console.log('FAZ 5 ana sayfa senkron doğrulaması geçti.');
