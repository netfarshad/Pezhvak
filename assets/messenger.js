(function () {
	'use strict';
	var cfg = window.SMSG;
	var root = document.getElementById('smsg-app');
	if (!cfg || !root) return;

	var state = { peer: null, lastId: 0, convs: [], searchTerm: '', busy: false };
	var $ = {};

	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) n.className = cls;
		if (text != null) n.textContent = text;
		return n;
	}

	function api(route, opts) {
		opts = opts || {};
		var url = cfg.rest + route;
		if (opts.query) {
			var qs = Object.keys(opts.query).map(function (k) {
				return encodeURIComponent(k) + '=' + encodeURIComponent(opts.query[k]);
			}).join('&');
			url += (url.indexOf('?') > -1 ? '&' : '?') + qs;
		}
		return fetch(url, {
			method: opts.body ? 'POST' : 'GET',
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': cfg.nonce, 'Content-Type': 'application/json' },
			body: opts.body ? JSON.stringify(opts.body) : undefined
		}).then(function (r) {
			return r.json().then(function (d) {
				if (!r.ok) throw d;
				return d;
			});
		});
	}

	function fa(n) { return Number(n).toLocaleString('fa-IR'); }
	function timeLabel(ts) {
		var d = new Date(ts * 1000), now = new Date();
		var t = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
		return d.toDateString() === now.toDateString() ? t : d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }) + ' ' + t;
	}

	function avatar(u) {
		var a = el('img', 'smsg-avatar');
		a.src = u.avatar || '';
		a.alt = '';
		a.loading = 'lazy';
		return a;
	}

	/* ---------- ساختار صفحه ---------- */
	function build() {
		root.textContent = '';
		var wrap = el('div', 'smsg');

		var side = el('aside', 'smsg-side');
		$.search = el('input', 'smsg-search');
		$.search.type = 'search';
		$.search.placeholder = 'جستجوی عضو با نام…';
		$.search.setAttribute('aria-label', 'جستجوی عضو');
		$.list = el('div', 'smsg-list');
		side.appendChild($.search);
		side.appendChild($.list);

		var main = el('section', 'smsg-main');
		$.head = el('header', 'smsg-head');
		$.back = el('button', 'smsg-back', '‹ گفتگوها');
		$.back.type = 'button';
		$.title = el('span', 'smsg-title');
		$.head.appendChild($.back);
		$.head.appendChild($.title);
		$.msgs = el('div', 'smsg-msgs');
		$.form = el('form', 'smsg-form');
		$.input = el('textarea', 'smsg-input');
		$.input.rows = 1;
		$.input.maxLength = cfg.max;
		$.input.placeholder = 'پیام خود را بنویسید…';
		$.send = el('button', 'smsg-send', 'ارسال');
		$.send.type = 'submit';
		$.err = el('div', 'smsg-err');
		$.form.appendChild($.input);
		$.form.appendChild($.send);
		main.appendChild($.head);
		main.appendChild($.msgs);
		main.appendChild($.err);
		main.appendChild($.form);

		wrap.appendChild(side);
		wrap.appendChild(main);
		root.appendChild(wrap);
		$.wrap = wrap;

		var t;
		$.search.addEventListener('input', function () {
			clearTimeout(t);
			t = setTimeout(doSearch, 300);
		});
		$.form.addEventListener('submit', function (e) { e.preventDefault(); send(); });
		$.input.addEventListener('keydown', function (e) {
			if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
		});
		$.back.addEventListener('click', function () {
			state.peer = null;
			$.wrap.classList.remove('smsg-open');
			renderConvs();
		});
		showEmpty();
	}

	function showEmpty() {
		$.msgs.textContent = '';
		$.msgs.appendChild(el('div', 'smsg-empty', 'یک گفتگو را انتخاب کنید یا با جستجوی نام، عضو جدیدی پیدا کنید.'));
		$.form.style.display = 'none';
		$.title.textContent = '';
	}

	/* ---------- لیست گفتگوها و جستجو ---------- */
	function row(user, subtitle, unread, active) {
		var b = el('button', 'smsg-row' + (active ? ' is-active' : ''));
		b.type = 'button';
		b.appendChild(avatar(user));
		var txt = el('span', 'smsg-row-txt');
		txt.appendChild(el('span', 'smsg-row-name', user.name));
		if (subtitle) txt.appendChild(el('span', 'smsg-row-sub', subtitle));
		b.appendChild(txt);
		if (unread) b.appendChild(el('span', 'smsg-badge', fa(unread)));
		b.addEventListener('click', function () { openChat(user); });
		return b;
	}

	function renderConvs() {
		if (state.searchTerm.length >= 2) return;
		$.list.textContent = '';
		if (!state.convs.length) {
			$.list.appendChild(el('div', 'smsg-empty-small', 'هنوز گفتگویی ندارید. نام یک عضو را جستجو کنید.'));
			return;
		}
		state.convs.forEach(function (c) {
			var prefix = c.last.from === cfg.me ? 'شما: ' : '';
			var preview = prefix + c.last.text;
			if (preview.length > 40) preview = preview.slice(0, 40) + '…';
			$.list.appendChild(row(c.user, preview, c.unread, state.peer && state.peer.id === c.user.id));
		});
	}

	function loadConvs() {
		return api('conversations').then(function (d) {
			state.convs = d;
			// پیام‌های گفتگوی بازِ فعلی همین حالا خوانده می‌شوند
			if (state.peer) state.convs.forEach(function (c) { if (c.user.id === state.peer.id) c.unread = 0; });
			renderConvs();
		}).catch(function () {});
	}

	function doSearch() {
		var term = $.search.value.trim();
		state.searchTerm = term;
		if (term.length < 2) { renderConvs(); return; }
		api('users', { query: { search: term } }).then(function (users) {
			if (state.searchTerm !== term) return;
			$.list.textContent = '';
			if (!users.length) $.list.appendChild(el('div', 'smsg-empty-small', 'عضوی با این نام پیدا نشد.'));
			users.forEach(function (u) { $.list.appendChild(row(u, '', 0, false)); });
		}).catch(function () {});
	}

	/* ---------- گفتگو ---------- */
	function openChat(user) {
		state.peer = user;
		state.lastId = 0;
		$.search.value = '';
		state.searchTerm = '';
		$.title.textContent = user.name;
		$.msgs.textContent = '';
		$.form.style.display = '';
		$.wrap.classList.add('smsg-open');
		renderConvs();
		fetchMessages(true);
		$.input.focus();
	}

	function bubble(m) {
		var mine = m.from === cfg.me;
		var b = el('div', 'smsg-msg ' + (mine ? 'is-mine' : 'is-theirs'));
		b.appendChild(el('div', 'smsg-text', m.text));
		b.appendChild(el('time', 'smsg-time', timeLabel(m.ts)));
		return b;
	}

	function append(list) {
		if (!list.length) return;
		var atBottom = $.msgs.scrollHeight - $.msgs.scrollTop - $.msgs.clientHeight < 80;
		list.forEach(function (m) {
			if (m.id <= state.lastId) return;
			$.msgs.appendChild(bubble(m));
			state.lastId = m.id;
		});
		if (atBottom || state.lastId === list[list.length - 1].id && $.msgs.children.length === list.length) {
			$.msgs.scrollTop = $.msgs.scrollHeight;
		}
	}

	function fetchMessages(first) {
		if (!state.peer) return;
		var peer = state.peer.id;
		api('messages', { query: { 'with': peer, after: state.lastId } }).then(function (list) {
			if (!state.peer || state.peer.id !== peer) return;
			if (first && !list.length) {
				$.msgs.appendChild(el('div', 'smsg-empty', 'هنوز پیامی نیست. اولین پیام را بفرستید.'));
				$.msgs.firstChild.classList.add('is-placeholder');
			} else if (list.length) {
				var ph = $.msgs.querySelector('.is-placeholder');
				if (ph) ph.remove();
			}
			append(list);
		}).catch(function () {});
	}

	function send() {
		var text = $.input.value.trim();
		if (!text || !state.peer || state.busy) return;
		state.busy = true;
		$.err.textContent = '';
		api('messages', { body: { to: state.peer.id, message: text } }).then(function (m) {
			$.input.value = '';
			var ph = $.msgs.querySelector('.is-placeholder');
			if (ph) ph.remove();
			append([m]);
			$.msgs.scrollTop = $.msgs.scrollHeight;
			loadConvs();
		}).catch(function (e) {
			$.err.textContent = (e && e.message) || 'ارسال انجام نشد. دوباره تلاش کنید.';
		}).then(function () { state.busy = false; });
	}

	/* ---------- شروع و بروزرسانی دوره‌ای ---------- */
	build();
	loadConvs();
	setInterval(function () {
		if (document.hidden) return;
		loadConvs();
		fetchMessages(false);
	}, cfg.poll);
})();
