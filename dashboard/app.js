/* Token Radar — the page. Reads window.RADAR (written by main.ts), renders four views, no network. */

(function () {
  'use strict';

  var R = window.RADAR;
  var $ = function (id) { return document.getElementById(id); };

  var TVL_STEPS = [0, 5e6, 25e6, 100e6, 500e6, 1e9];
  var TVL_LABELS = ['any size', '$5M+', '$25M+', '$100M+', '$500M+', '$1B+'];
  var PAGE = 120;

  var state = { q: '', cat: '', chain: '', tvl: 0, scope: 'all', sort: 'rank', shown: PAGE };

  // ---------------------------------------------------------------- formatting

  function usd(n) {
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(n >= 1e10 ? 1 : 2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }

  function pct(n) {
    if (n === null || n === undefined) return '<span class="mut">—</span>';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : 'mut';
    var sign = n > 0 ? '+' : '';
    return '<span class="' + cls + '">' + sign + n.toFixed(1) + '%</span>';
  }

  function age(days) {
    if (days === null || days === undefined) return '<span class="mut">unrecorded</span>';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    if (days >= 30) return Math.round(days / 30) + 'mo';
    return days + 'd';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------------------------------------------------------------- filtering

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = R.rows.filter(function (r) {
      if (state.cat && (r.category || 'Uncategorised') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < TVL_STEPS[state.tvl]) return false;
      if (state.scope === 'watchlist' && !r.watchlist) return false;
      if (state.scope === 'calibrated' && r.category_source !== 'calibrated') return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = {
      rank: function (a, b) { return a.rank - b.rank; },
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || -999) - (a.change_7d || -999); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); }
    }[state.sort];
    return out.sort(key);
  }

  // ---------------------------------------------------------------- board

  function renderBoard() {
    var rows = filtered();
    var top = rows.length ? rows[0].implied_value_usd : 1;
    var slice = rows.slice(0, state.shown);

    // The first column numbers the rows of this view; the board's own rank rides with the name, so a
    // filtered or re-sorted list reads 1, 2, 3 without hiding where the protocol really stands.
    $('rows').innerHTML = slice.map(function (r, i) {
      var width = Math.max(2, Math.round((r.implied_value_usd / top) * 100));
      var showRank = state.sort !== 'rank' || state.scope !== 'all' || state.q !== '' ||
        state.cat !== '' || state.chain !== '' || state.tvl !== 0;
      return '<tr class="' + (r.watchlist ? 'wl' : '') + '">' +
        '<td class="num rank">' + (i + 1) + '</td>' +
        '<td><div class="pname"><a href="#/p/' + encodeURIComponent(r.slug) + '">' + esc(r.name) + '</a>' +
          '<span class="slug">' + esc(r.slug) +
            (showRank ? ' · board #' + r.rank : '') + '</span></div></td>' +
        '<td><span class="cat' + (r.category_source === 'calibrated' ? '' : ' fb') + '">' +
          esc(r.category || 'Uncategorised') + '</span></td>' +
        '<td class="num tvl">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num implied">' + usd(r.implied_value_usd) +
          '<span class="bar"><i style="width:' + width + '%"></i></span>' +
          '<span class="rng">' + usd(r.value_low_usd) + '\u2013' + usd(r.value_high_usd) +
            ' \u00b7 rank ' + r.rank_low + '\u2013' + r.rank_high + '</span></td>' +
        '<td class="num"><span class="v v-' + r.verdict.toLowerCase() + '">' + r.verdict + '</span>' +
          '<span class="rng">net ' + sgn(r.net_usd) + '</span></td>' +
        '</tr>';
    }).join('');

    $('empty').hidden = rows.length > 0;
    $('more').textContent = rows.length > state.shown
      ? 'Showing ' + state.shown + ' of ' + rows.length + ' rows — scroll for more.'
      : rows.length + ' rows.';

    var wl = rows.filter(function (r) { return r.watchlist; }).length;
    $('filter-note').textContent = rows.length + ' of ' + R.rows.length + ' pre-token protocols' +
      (wl ? ' · ' + wl + ' on the watchlist' : '') + '.';
  }

  // ---------------------------------------------------------------- detail

  function sgn(v) {
    var s = v < 0 ? '\u2212' : '+';
    var a = Math.abs(v);
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'k';
    return s + '$' + a.toFixed(0);
  }

  function renderDetail(slug) {
    var r = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) r = R.rows[i];
    if (!r) {
      $('detail').innerHTML = '<p class="more">No protocol called ' + esc(slug) + ' on the board.</p>';
      return;
    }
    var m = r.multiple_at_size;
    var base = r.implied_value_usd / (r.growth_multiplier * r.tenure_multiplier * r.reach_multiplier);
    var fit = R.fit;
    var chains = r.chains.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('');

    $('detail').innerHTML =
      '<div class="detail-head">' +
        '<h2>' + esc(r.name) + '</h2>' +
        '<div class="sub"><code>' + esc(r.slug) + '</code> · ' + esc(r.category || 'Uncategorised') +
          ' · ' + (r.watchlist ? '<span class="implied">on the watchlist</span>' : 'below the watchlist floor') +
          (r.listed_at ? ' · tracked since ' + esc(r.listed_at) : ' · no listing date recorded') +
        '</div>' +
      '</div>' +
      '<div class="hero">' +
        '<div class="big"><span>Implied launch value</span><b>' + usd(r.implied_value_usd) + '</b>' +
          '<em class="iv">200 bootstrap refits: ' + usd(r.value_low_usd) + '\u2013' + usd(r.value_high_usd) +
          ', rank ' + r.rank_low + '\u2013' + r.rank_high + '</em></div>' +
        '<div class="verdict v-' + r.verdict.toLowerCase() + '"><b>' + r.verdict + '</b> ' +
          'net ' + sgn(r.net_usd) + ' after cost</div>' +
        '<div><span>TVL</span><b>' + usd(r.tvl_usd) + '</b></div>' +
        '<div><span>7d change</span><b>' + pct(r.change_7d) + '</b></div>' +
        '<div><span>No token for</span><b>' + age(r.age_days) + '</b></div>' +
        '<div><span>Chains</span><b>' + r.chains.length + '</b></div>' +
        '<div><span>Rank</span><b>' + r.rank + ' / ' + R.rows.length + '</b></div>' +
      '</div>' +
      '<div class="cols">' +
        '<section>' +
          '<h3>Farm plan — ' + r.farm_steps.length + ' steps, each with a cost and a time</h3>' +
          '<ol class="plan">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
        '</section>' +
        '<aside>' +
          '<h3>How the value was reached</h3>' +
          '<table class="breakdown">' +
            '<tr><td>TVL</td><td>' + usd(r.tvl_usd) + '</td></tr>' +
            '<tr><td>power law: ' + fit.a.toFixed(0) + ' &times; TVL^' + fit.b.toFixed(3) + '</td><td>' + usd(base) + '</td></tr>' +
            '<tr><td>= implied multiple at this size</td><td>' + m.toFixed(3) + '&times;</td></tr>' +
            '<tr><td>&times; growth ' + (r.growth_multiplier >= 1 ? '+' : '') +
              ((r.growth_multiplier - 1) * 100).toFixed(0) + '%</td><td>' + r.growth_multiplier.toFixed(3) + '&times;</td></tr>' +
            '<tr><td>&times; tenure</td><td>' + r.tenure_multiplier.toFixed(3) + '&times;</td></tr>' +
            '<tr><td>&times; reach</td><td>' + r.reach_multiplier.toFixed(3) + '&times;</td></tr>' +
            '<tr class="total"><td>= implied</td><td>' + usd(r.implied_value_usd) + '</td></tr>' +
          '</table>' +
          '<p class="note">The base is the power law fitted on ' + fit.sample +
            ' trading protocols, not a category average: at ' + usd(r.tvl_usd) +
            ' of TVL it implies ' + m.toFixed(3) + '&times;. Out of sample it is off by ' +
            fit.walkForwardSmapePct.toFixed(0) + '% typically (median, walk-forward).</p>' +
          '<h3 style="margin-top:22px">Deployed on</h3>' +
          '<ul class="chainlist">' + chains + '</ul>' +
        '</aside>' +
      '</div>';
  }

  // ---------------------------------------------------------------- calibration

  function renderModel() {
    var f = R.fit;

    $('model-sample').textContent = f.sample;
    $('model-headline').innerHTML =
      'mcap = <strong>' + f.a.toFixed(0) + '</strong> &times; TVL<sup><strong>' + f.b.toFixed(3) +
      '</strong></sup>';

    var rows = [
      { name: 'Power law (this model)', loo: f.looSmapePct, walk: f.walkForwardSmapePct, cls: 'win' },
      { name: 'Flat multiple', loo: f.flatLooSmapePct, walk: f.flatWalkForwardSmapePct, cls: '' },
      { name: 'Per-category medians', loo: f.categoryLooSmapePct, walk: f.categoryWalkForwardSmapePct, cls: '' }
    ];
    var worst = 0;
    rows.forEach(function (r) { worst = Math.max(worst, r.loo, r.walk); });

    $('val-rows').innerHTML = rows.map(function (r) {
      function bar(v) {
        var w = Math.round((v / worst) * 100);
        return '<span class="bar" style="width:90px"><i style="width:' + w + '%"></i></span>';
      }
      return '<tr class="' + r.cls + '">' +
        '<td>' + esc(r.name) + '</td>' +
        '<td class="num">' + r.loo.toFixed(1) + '%</td>' +
        '<td>' + bar(r.loo) + '</td>' +
        '<td class="num">' + r.walk.toFixed(1) + '%</td>' +
        '<td>' + bar(r.walk) + '</td>' +
        '</tr>';
    }).join('');

    var best = Math.max.apply(null, f.sizeBands.map(function (b) { return b.multiple; }));
    $('band-rows').innerHTML = f.sizeBands.map(function (b) {
      var w = Math.max(2, Math.round((b.multiple / best) * 100));
      return '<tr>' +
        '<td>' + esc(b.label) + '</td>' +
        '<td class="num mult">' + b.multiple.toFixed(3) + '&times;</td>' +
        '<td><span class="bar" style="width:140px"><i style="width:' + w + '%"></i></span></td>' +
        '<td class="num">' + b.count + '</td>' +
        '</tr>';
    }).join('');

    $('model-note').textContent =
      'Fitted on ' + f.sample + ' protocols whose token already trades, then scored on data the fit ' +
      'never saw. Leave-one-out refits ' + f.sample + ' times; walk-forward trains on earlier-listed ' +
      'protocols and scores later ones, which is the direction this radar works in.';
  }

  // ---------------------------------------------------------------- live

  function renderLive() {
    $('live-rows').innerHTML = R.live.map(function (p, i) {
      return '<tr>' +
        '<td class="num rank">' + (i + 1) + '</td>' +
        '<td><div class="pname"><span>' + esc(p.name) + '</span>' +
          '<span class="slug">' + esc(p.slug) + '</span></div></td>' +
        '<td><span class="cat">' + esc(p.symbol || '—') + '</span></td>' +
        '<td><span class="cat">' + esc(p.category || 'Uncategorised') + '</span></td>' +
        '<td class="num">' + usd(p.tvl_usd) + '</td>' +
        '<td class="num">' + usd(p.mcap_usd) + '</td>' +
        '<td class="num">' + p.multiple.toFixed(3) + '&times;</td>' +
        '</tr>';
    }).join('');
  }

  // ---------------------------------------------------------------- chrome

  function renderChrome() {
    $('ver').textContent = R.model_version;
    $('stats').innerHTML =
      '<div><span>protocols read</span><b>' + R.counts.protocols + '</b></div>' +
      '<div><span>pre-token ranked</span><b>' + R.counts.rows + '</b></div>' +
      '<div><span>watchlist covered</span><b>' + R.counts.watchlist + '</b></div>' +
      '<div><span>already trading</span><b>' + R.counts.live + '</b></div>' +
      '<div><span>snapshot</span><b>' + R.as_of + '</b></div>';
    $('foot').textContent = 'Token Radar · ' + R.model_version + ' · snapshot ' + R.as_of +
      ' · ' + R.source.replace(/^DefiLlama /, 'source: DefiLlama ') +
      ' · values are the model\'s claim, not advice';
  }

  function renderFilters() {
    var cats = {};
    var chains = {};
    R.rows.forEach(function (r) {
      var c = r.category || 'Uncategorised';
      cats[c] = (cats[c] || 0) + 1;
      r.chains.forEach(function (ch) { chains[ch] = (chains[ch] || 0) + 1; });
    });

    var catList = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    $('f-cat').innerHTML = '<option value="">All categories</option>' + catList.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + ' (' + cats[c] + ')</option>';
    }).join('');
    $('cat-count').textContent = catList.length + '';

    var chainList = Object.keys(chains).sort(function (a, b) { return chains[b] - chains[a]; });
    $('f-chain').innerHTML = '<option value="">All chains</option>' + chainList.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + ' (' + chains[c] + ')</option>';
    }).join('');
    $('chain-count').textContent = chainList.length + '';
  }

  // ---------------------------------------------------------------- routing

  function show(view) {
    ['board', 'detail', 'calibration', 'live', 'method'].forEach(function (v) {
      var el = $('view-' + v);
      if (el) el.classList.toggle('on', v === view);
    });
    var tab = view === 'detail' ? 'board' : view;
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === tab);
    });
  }

  function route() {
    var h = location.hash || '#/board';
    var m = h.match(/^#\/p\/(.+)$/);
    if (m) {
      renderDetail(decodeURIComponent(m[1]));
      show('detail');
      window.scrollTo(0, 0);
      return;
    }
    var v = h.replace('#/', '') || 'board';
    if (['board', 'calibration', 'live', 'method'].indexOf(v) < 0) v = 'board';
    if (v === 'calibration') renderModel();
    if (v === 'live') renderLive();
    if (v === 'board') renderBoard();
    show(v);
  }

  // ---------------------------------------------------------------- wiring

  $('q').addEventListener('input', function (e) { state.q = e.target.value; state.shown = PAGE; renderBoard(); });
  $('f-cat').addEventListener('change', function (e) { state.cat = e.target.value; state.shown = PAGE; renderBoard(); });
  $('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; state.shown = PAGE; renderBoard(); });
  $('f-tvl').addEventListener('input', function (e) {
    state.tvl = Number(e.target.value);
    $('f-tvl-out').textContent = TVL_LABELS[state.tvl];
    state.shown = PAGE;
    renderBoard();
  });

  Array.prototype.forEach.call(document.querySelectorAll('#scope button'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('#scope button'), function (o) { o.classList.remove('on'); });
      b.classList.add('on');
      state.scope = b.getAttribute('data-scope');
      state.shown = PAGE;
      renderBoard();
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('#sort button'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('#sort button'), function (o) { o.classList.remove('on'); });
      b.classList.add('on');
      state.sort = b.getAttribute('data-sort');
      renderBoard();
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
    b.addEventListener('click', function () {
      location.hash = '#/' + b.getAttribute('data-view');
    });
  });

  window.addEventListener('hashchange', route);

  document.addEventListener('scroll', function () {
    if (!document.getElementById('view-board').classList.contains('on')) return;
    var rows = filtered();
    if (state.shown >= rows.length) return;
    var near = window.innerHeight + window.scrollY > document.body.offsetHeight - 600;
    if (near) { state.shown += PAGE; renderBoard(); }
  }, { passive: true });

  // ---------------------------------------------------------------- boot

  renderChrome();
  renderFilters();
  renderBoard();
  route();

  // A deep link into a protocol, for a screenshot: ?p=slug opens its detail view.
  var qp = new URLSearchParams(location.search).get('p');
  if (qp && !location.hash) location.hash = '#/p/' + encodeURIComponent(qp);
})();
