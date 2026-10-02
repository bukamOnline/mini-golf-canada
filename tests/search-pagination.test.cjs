// Run with: node --test tests/search-pagination.test.cjs
// Exercise the shipped search code and dataset with a small DOM adapter.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function searchPage({legacy = false, listings} = {}) {
  const events = [];
  const status = {textContent: ''};
  const count = {textContent: ''};
  const more = {hidden: true, attributes: {}, setAttribute(name, value) {this.attributes[name] = value;}};
  let pagination = legacy ? null : {hidden: true, querySelector(selector) {return selector === '.js-search-count' ? count : more;}};
  const results = {id: 'search-results', children: [], appendChild(card) {this.children.push(card);}, insertAdjacentElement(_, element) {pagination = element;}};
  Object.defineProperty(results, 'innerHTML', {set() {this.children = [];}});
  const document = {
    activeElement: null,
    addEventListener() {},
    querySelectorAll() {return [];},
    querySelector(selector) {
      return {'.js-search-results': results, '.js-search-status': status, '.js-search-pagination': pagination}[selector] || null;
    },
    createElement(tag) {
      if (tag === 'div') return {querySelector(selector) {return selector === '.js-search-count' ? count : more;}};
      return {
        querySelectorAll() {return [];},
        querySelector(selector) {
          if (selector !== 'h3 a') return null;
          const card = this;
          return {focus() {document.activeElement = card;}};
        },
      };
    },
  };
  const query = {value: ''}, province = {value: ''};
  const form = {
    dataset: {}, filters: [],
    querySelector(selector) {return selector === '[name=q]' ? query : province;},
    querySelectorAll() {return this.filters.map(value => ({value}));},
  };
  const window = {gtag(name, event, params) {events.push({event, params});}};
  const context = {window, document, location: {pathname: '/search/'}, URLSearchParams, Intl};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/listings.js'), 'utf8'), context);
  if (listings) window.MGC_LISTINGS = listings;
  const source = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  // Export only in the VM; the shipped browser script stays private.
  vm.runInContext(source.replace('  function applyQueryParams', '  window.testRunSearch = runSearch;\n\n  function applyQueryParams'), context);
  return {form, query, province, results, status, count, more, document, events, window,
    run(options) {return window.testRunSearch(form, options);},
    loadMore() {more.onclick();},
    paths() {return results.children.map(card => card.innerHTML.match(/<h3><a href="([^"]+)"/)[1]);},
    pagination() {return pagination;},
  };
}

test('all 99 Ontario matches remain reachable in stable, duplicate-free order', () => {
  const page = searchPage(); page.province.value = 'Ontario';
  const matches = page.run({track:true});
  assert.equal(matches.length, 99);
  assert.equal(page.results.children.length, 24);
  assert.match(page.status.textContent, /Showing 24 of 99/);
  assert.equal(page.events[0].params.results_count, 99);
  assert.equal(page.more.attributes['aria-controls'], 'search-results');
  for (const shown of [48,72,96,99]) {
    const previous = page.results.children.slice();
    page.loadMore();
    assert.equal(page.results.children.length, shown);
    assert.deepEqual(page.results.children.slice(0,previous.length), previous);
    assert.equal(new Set(page.paths()).size, shown);
    assert.equal(page.document.activeElement, page.results.children[previous.length]);
    assert.match(page.status.textContent, new RegExp('Showing '+shown+' of 99'));
    assert.equal(page.more.hidden, shown === 99);
  }
  assert.match(page.count.textContent, /All matches are shown/);
  assert.deepEqual(page.paths(), Array.from(matches, item => '../' + item.path.replace(/index\.html$/, '')));
  page.loadMore(); // A stale invocation at the end cannot append duplicates.
  assert.equal(page.results.children.length, 99);
});

test('query, province and combined filters reset an expanded search', () => {
  const page=searchPage(); page.province.value='Ontario'; page.run(); page.loadMore();
  page.query.value='Fleetway'; assert.equal(page.run().length,1);
  assert.match(page.status.textContent,/1 of 1 matching mini golf listing\. All/);
  assert.equal(page.more.hidden,true);
  page.query.value=''; page.run(); assert.equal(page.results.children.length,24);
  page.form.filters=['indoor']; assert.equal(page.run().length,26);
  assert.equal(page.more.attributes['aria-label'],'Show more (2 mini golf listings)');
  page.loadMore(); assert.equal(page.results.children.length,26);
  page.form.filters=['indoor','glow']; const combined=page.run();
  assert.ok(combined.every(item=>item.features.includes('indoor')&&item.features.includes('glow')));
  assert.equal(page.results.children.length,Math.min(24,combined.length));
  page.form.filters=[]; page.province.value='Prince Edward Island'; assert.equal(page.run().length,6);
  assert.equal(page.results.children.length,6); assert.equal(page.more.hidden,true);
});

test('no matches clears cards and hides the entire pagination control', () => {
  const page=searchPage(); page.run(); page.loadMore();
  page.query.value='zzzznonexistentcourse'; assert.equal(page.run().length,0);
  assert.equal(page.results.children.length,0); assert.equal(page.pagination().hidden,true);
  assert.equal(page.more.hidden,true); assert.equal(page.count.textContent,'');
  assert.match(page.status.textContent,/No matching courses found/);
});

test('all national results can be loaded, with the correct total and final partial page', () => {
  const page=searchPage(); const total=page.run().length;
  assert.equal(total,259);
  while (!page.more.hidden) page.loadMore();
  assert.equal(page.results.children.length,total); assert.equal(new Set(page.paths()).size,total);
  assert.match(page.status.textContent,/Showing 259 of 259.*All matches/);
});

test('location sorting reaches all coordinate-bearing matches and keeps distance order', () => {
  const page=searchPage(); page.province.value='Ontario';
  const location={lat:43.65,lng:-79.38,accuracy:5000};
  const matches=page.run({location,track:true});
  const expected=page.window.MGC_LISTINGS.filter(item=>item.province==='Ontario'&&typeof item.lat==='number'&&typeof item.lng==='number').length;
  assert.equal(matches.length,expected); assert.equal(page.results.children.length,18);
  assert.match(page.status.textContent,/closest first.*about 5 km/);
  while (!page.more.hidden) page.loadMore();
  assert.equal(page.results.children.length,expected);
  assert.deepEqual(page.paths(),Array.from(matches,item=>'../'+item.path.replace(/index\.html$/,'')));
  for(let i=1;i<matches.length;i++) assert.ok(matches[i].distance>=matches[i-1].distance-0.05);
  assert.equal(page.events[0].params.results_count,expected);
  page.query.value='zzzznonexistentcourse'; page.run({location});
  assert.match(page.status.textContent,/No nearby listings matched/);
  assert.equal(page.pagination().hidden,true);
});

test('exact page size hides Show more and one extra result remains reachable', () => {
  const fixture=length=>Array.from({length},(_,i)=>({id:String(i),name:'Course '+i,city:'Test',province:'Ontario',path:'courses/'+i+'/index.html'}));
  for(const total of [0,1,24,25,48,49]) {
    const page=searchPage({listings:fixture(total)}); page.run();
    assert.equal(page.results.children.length,Math.min(24,total));
    assert.equal(page.more.hidden,total<=24);
    while(!page.more.hidden) page.loadMore();
    assert.equal(page.results.children.length,total);
  }
});

test('cached homepage markup gains pagination on its first search', () => {
  const page=searchPage({legacy:true}); page.province.value='Ontario'; page.run();
  assert.ok(page.pagination()); assert.equal(page.more.hidden,false);
  page.loadMore(); assert.equal(page.results.children.length,48);
});
