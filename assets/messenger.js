(function () {
	'use strict';
	var cfg = window.SMSG;
	var root = document.getElementById('smsg-app');
	if (!cfg || !root) return;
	// wp_localize_script مقدارهای ساده را رشته می‌کند
	cfg.me = Number(cfg.me);
	cfg.poll = Number(cfg.poll) || 4000;
	cfg.max = Number(cfg.max) || 1000;
	cfg.maxFile = Number(cfg.maxFile) || 10;
	cfg.maxVideo = Number(cfg.maxVideo) || 30;
	cfg.maxMusic = Number(cfg.maxMusic) || 20;
	cfg.hasMap = Number(cfg.hasMap) === 1;
	cfg.mapLink = String(cfg.mapLink || '');
	cfg.fullscreen = Number(cfg.fullscreen) === 1;

	var state = {
		me: cfg.meCard || { id: cfg.me, name: '', avatar: '', username: '', bio: '', first_name: '' },
		peer: null, lastId: 0, lastDay: '', convs: [], unread: {}, seeded: false,
		searchTerm: '', busy: false, page: null,
		contacts: [], contactIds: {}, contactTerm: '',
		blocks: [], blockIds: {}, blockTerm: ''
	};
	var R = {};
	var pending = {}; // پیام‌های ارسالیِ هنوز دیده‌نشده: id -> {node, st}
	var baseTitle = document.title;

	/* ---------- ابزارها ---------- */
	var P = {
		lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
		shield: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z',
		eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
		block: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z',
		pin: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
		music: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
		skipn: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
		skipp: 'M6 6h2v12H6zm3.5 6l8.5 6V6z',
		copy: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
		open: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
		photo: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
		clip: 'M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z',
		mic: 'M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z',
		file: 'M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z',
		play: 'M8 5v14l11-7z',
		pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
		trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
		download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
		contacts: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
		plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
		gear: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z',
		back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
		chev: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
		send: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
		camera: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z',
		user: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
		close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
		logout: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z'
	};
	var COLORS = ['#d14d54', '#d97a2e', '#7d68c9', '#4f9e3d', '#2f9fa3', '#3b86c6', '#c94d86'];

	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) n.className = cls;
		if (text != null) n.textContent = text;
		return n;
	}
	function icon(name, flip) {
		var s = el('span', 'smsg-ico' + (flip ? ' flip' : ''));
		s.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="' + P[name] + '"/></svg>';
		return s;
	}
	function iconBtn(name, label, flip) {
		var b = el('button', 'smsg-iconbtn');
		b.type = 'button';
		b.setAttribute('aria-label', label);
		b.appendChild(icon(name, flip));
		return b;
	}
	function fa(n) { return Number(n).toLocaleString('fa-IR'); }
	function hhmm(ts) {
		return new Date(ts * 1000).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });
	}
	function dayKey(ts) { return new Date(ts * 1000).toDateString(); }
	function dayLabel(ts) {
		var d = new Date(ts * 1000), t = new Date(), y = new Date();
		y.setDate(t.getDate() - 1);
		if (d.toDateString() === t.toDateString()) return 'امروز';
		if (d.toDateString() === y.toDateString()) return 'دیروز';
		return d.toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
	}
	function shortTime(ts) {
		var d = new Date(ts * 1000);
		return d.toDateString() === new Date().toDateString() ? hhmm(ts) : d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
	}

	function avatarEl(u, size) {
		var a = el('span', 'smsg-avatar');
		a.style.setProperty('--s', size + 'px');
		if (u.avatar) {
			var img = el('img');
			img.src = u.avatar; img.alt = ''; img.loading = 'lazy';
			a.appendChild(img);
		} else {
			a.style.background = COLORS[Math.abs(Number(u.id) || 0) % COLORS.length];
			a.appendChild(el('span', 'smsg-initial', (Array.from(u.name || '؟')[0] || '؟')));
		}
		return a;
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
		var headers = { 'X-WP-Nonce': cfg.nonce };
		var body;
		if (opts.form) { body = opts.form; }
		else if (opts.body) { body = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json'; }
		return fetch(url, {
			method: opts.method || ((opts.body || opts.form) ? 'POST' : 'GET'),
			credentials: 'same-origin', headers: headers, body: body
		}).then(function (r) {
			return r.json().then(function (d) { if (!r.ok) throw d; return d; });
		});
	}

	/* ---------- لایه‌ها و دکمهٔ بازگشت مرورگر/موبایل ---------- */
	// هر لایهٔ باز (چت در موبایل، تنظیمات، دیالوگ، عکس) یک ورودی history می‌سازد؛
	// دکمهٔ Back فقط همان لایه را می‌بندد و تنها وقتی لایه‌ای باز نیست از صفحه خارج می‌شود.
	var stack = [], lid = 0;
	function pushLayer(name, onClose) {
		stack.push({ name: name, onClose: onClose });
		try { history.pushState({ smsg: stack.length }, ''); } catch (e) {}
	}
	function hasLayer(name) {
		return stack.some(function (l) { return l.name === name; });
	}
	function closeLayer(name) {
		for (var i = stack.length - 1; i >= 0; i--) {
			if (stack[i].name === name) { history.go(-(stack.length - i)); return; }
		}
	}
	function closeAll(cb) {
		var n = stack.length;
		if (!n) { cb(); return; }
		window.addEventListener('popstate', function h() {
			window.removeEventListener('popstate', h);
			cb();
		});
		history.go(-n);
	}
	window.addEventListener('popstate', function (e) {
		var target = (e.state && e.state.smsg) || 0;
		while (stack.length > target) {
			var l = stack.pop();
			try { l.onClose(); } catch (x) {}
		}
	});
	function isNarrow() { return window.matchMedia('(max-width: 720px)').matches; }
	function isDesktopInput() { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; }

	/* ---------- پنجرهٔ گفتگو (مودال) ---------- */
	function modal(o) {
		var id = 'm' + (++lid);
		var ov = el('div', 'smsg-modal');
		var box = el('div', 'smsg-dialog');
		box.setAttribute('role', 'dialog');
		box.setAttribute('aria-modal', 'true');
		box.appendChild(el('h3', 'smsg-dialog-title', o.title));
		if (o.text) box.appendChild(el('p', 'smsg-dialog-text', o.text));
		var inputs = {}, first = null, okBtns = [];
		function setOk(flag) { okBtns.forEach(function (b) { b.disabled = !flag; }); }
		(o.fields || []).forEach(function (f) {
			var wrap = el('label', 'smsg-field');
			wrap.appendChild(el('span', 'smsg-field-label', f.label));
			var inp = el(f.multiline ? 'textarea' : 'input', 'smsg-field-input');
			if (f.multiline) inp.rows = 3; else inp.type = 'text';
			if (f.max) inp.maxLength = f.max;
			if (f.dir) inp.dir = f.dir;
			if (f.placeholder) inp.placeholder = f.placeholder;
			inp.autocomplete = 'off';
			inp.value = f.value || '';
			inputs[f.name] = inp;
			if (!first) first = inp;
			if (f.prefix) {
				var row = el('span', 'smsg-field-row');
				row.appendChild(el('span', 'smsg-field-prefix', f.prefix));
				row.appendChild(inp);
				wrap.appendChild(row);
			} else {
				wrap.appendChild(inp);
			}
			if (f.hint) wrap.appendChild(el('span', 'smsg-field-hint', f.hint));
			if (f.check) {
				// بررسی زندهٔ مقدار (مثلاً تکراری‌بودن نام کاربری) پیش از زدن دکمهٔ تأیید
				var st = el('span', 'smsg-field-status');
				wrap.appendChild(st);
				var norm = f.normalize || function (v) { return v.trim(); };
				var tm, seq = 0;
				inp.addEventListener('input', function () {
					clearTimeout(tm);
					var my = ++seq, v = norm(inp.value);
					st.className = 'smsg-field-status';
					if (v === norm(f.value || '')) { st.textContent = ''; setOk(true); return; }
					if (v === '') { st.textContent = 'نام کاربری حذف خواهد شد.'; setOk(true); return; }
					setOk(false);
					st.textContent = 'در حال بررسی…';
					tm = setTimeout(function () {
						f.check(v).then(function (r) {
							if (my !== seq) return;
							st.className = 'smsg-field-status ' + (r.available ? 'is-ok' : 'is-bad');
							st.textContent = r.message;
							setOk(!!r.available);
						}).catch(function (e) {
							if (my !== seq) return;
							st.className = 'smsg-field-status is-bad';
							st.textContent = (e && e.message) || 'بررسی انجام نشد.';
							setOk(false);
						});
					}, 400);
				});
			}
			box.appendChild(wrap);
		});
		if (o.content) box.appendChild(o.content);
		var err = el('div', 'smsg-dialog-err');
		box.appendChild(err);
		var bar = el('div', 'smsg-dialog-actions');
		function onKey(e) {
			if (e.key === 'Escape' && stack.length && stack[stack.length - 1].name === id) closeLayer(id);
		}
		(o.actions || []).forEach(function (a) {
			var b = el('button', 'smsg-dbtn' + (a.kind ? ' is-' + a.kind : ''), a.text);
			b.type = 'button';
			if (a.kind === 'primary') okBtns.push(b);
			b.addEventListener('click', function () {
				if (!a.onClick) { closeLayer(id); return; }
				var vals = {};
				Object.keys(inputs).forEach(function (k) { vals[k] = inputs[k].value; });
				b.disabled = true;
				err.textContent = '';
				Promise.resolve(a.onClick(vals)).then(function () { closeLayer(id); }).catch(function (e) {
					err.textContent = (e && e.message) || 'خطایی رخ داد. دوباره تلاش کنید.';
					b.disabled = false;
				});
			});
			bar.appendChild(b);
		});
		box.appendChild(bar);
		ov.appendChild(box);
		ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeLayer(id); });
		document.addEventListener('keydown', onKey);
		root.appendChild(ov);
		pushLayer(id, function () {
			ov.remove();
			document.removeEventListener('keydown', onKey);
			if (o.onClose) o.onClose();
		});
		if (first && (isDesktopInput() || !o.noAutofocus)) first.focus();
	}

	/* ---------- نمایش تمام‌صفحهٔ عکس پروفایل ---------- */
	function showPhoto(u) {
		if (!u.avatar) return;
		var id = 'p' + (++lid);
		var ov = el('div', 'smsg-lightbox');
		var img = el('img', 'smsg-lightbox-img');
		img.src = u.avatar;
		img.alt = u.name;
		var cap = el('div', 'smsg-lightbox-cap', u.name);
		var x = iconBtn('close', 'بستن');
		x.classList.add('smsg-lightbox-x');
		ov.appendChild(x);
		ov.appendChild(img);
		ov.appendChild(cap);
		function onKey(e) { if (e.key === 'Escape') closeLayer(id); }
		ov.addEventListener('click', function (e) { if (e.target !== img) closeLayer(id); });
		document.addEventListener('keydown', onKey);
		root.appendChild(ov);
		pushLayer(id, function () { ov.remove(); document.removeEventListener('keydown', onKey); });
	}

	/* ---------- ساختار صفحه ---------- */
	function build() {
		root.textContent = '';
		if (cfg.fullscreen) document.body.classList.add('smsg-lock');
		var wrap = el('div', 'smsg');
		R.wrap = wrap;

		var side = el('aside', 'smsg-side');
		var head = el('div', 'smsg-side-head');
		R.gear = iconBtn('gear', 'تنظیمات');
		R.search = el('input', 'smsg-search');
		R.search.type = 'search';
		R.search.placeholder = 'جستجو (نام یا @نام‌کاربری)';
		R.search.setAttribute('aria-label', 'جستجو');
		R.contactsBtn = iconBtn('contacts', 'مخاطبین');
		head.appendChild(R.gear);
		head.appendChild(R.contactsBtn);
		head.appendChild(R.search);
		R.notice = el('div', 'smsg-notice');
		R.list = el('div', 'smsg-list');
		R.panel = el('div', 'smsg-panel');
		side.appendChild(head);
		side.appendChild(R.notice);
		side.appendChild(R.list);
		side.appendChild(R.panel);

		var main = el('section', 'smsg-main is-empty');
		R.main = main;
		R.head = el('header', 'smsg-head');
		R.back = iconBtn('back', 'بازگشت', true);
		R.back.classList.add('smsg-back');
		R.headInfo = el('button', 'smsg-head-info');
		R.headInfo.type = 'button';
		R.headAv = el('span', 'smsg-head-av');
		var ht = el('span', 'smsg-head-txt');
		R.title = el('span', 'smsg-title');
		R.sub = el('span', 'smsg-sub');
		ht.appendChild(R.title);
		ht.appendChild(R.sub);
		R.headInfo.appendChild(R.headAv);
		R.headInfo.appendChild(ht);
		R.head.appendChild(R.back);
		R.head.appendChild(R.headInfo);
		R.msgs = el('div', 'smsg-msgs');
		R.err = el('div', 'smsg-err');
		R.form = el('form', 'smsg-form');
		var pill = el('div', 'smsg-pill');
		R.input = el('textarea', 'smsg-input');
		R.input.rows = 1;
		R.input.maxLength = cfg.max;
		R.input.placeholder = 'پیام';
		R.input.setAttribute('aria-label', 'متن پیام');
		R.send = el('button', 'smsg-send');
		R.send.type = 'submit';
		R.send.setAttribute('aria-label', 'ارسال');
		R.send.appendChild(icon('send', true));
		R.attach = iconBtn('clip', 'ارسال فایل');
		R.file = el('input');
		R.file.type = 'file';
		R.file.hidden = true;
		R.media = el('input');
		R.media.type = 'file';
		R.media.accept = 'image/*,video/*';
		R.media.hidden = true;
		R.music = el('input');
		R.music.type = 'file';
		R.music.accept = 'audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac';
		R.music.hidden = true;
		R.menu = el('div', 'smsg-attach-menu');
		R.menu.appendChild(menuItem('photo', 'تصویر یا ویدئو', function () { R.media.click(); }));
		R.menu.appendChild(menuItem('file', 'فایل', function () { R.file.click(); }));
		R.menu.appendChild(menuItem('music', 'موزیک', function () { R.music.click(); }));
		R.menu.appendChild(menuItem('pin', 'موقعیت مکانی', openLocation));
		R.mic = el('button', 'smsg-send smsg-mic');
		R.mic.type = 'button';
		R.mic.setAttribute('aria-label', 'ضبط پیام صوتی');
		R.mic.appendChild(icon('mic'));
		pill.appendChild(R.attach);
		pill.appendChild(R.file);
		pill.appendChild(R.media);
		pill.appendChild(R.music);
		pill.appendChild(R.input);
		pill.appendChild(R.send);
		pill.appendChild(R.mic);
		R.form.appendChild(pill);
		R.recbar = el('div', 'smsg-recbar');
		R.recCancel = iconBtn('trash', 'لغو ضبط');
		R.recTime = el('span', 'smsg-rec-time', '');
		R.recSend = iconBtn('send', 'ارسال پیام صوتی', true);
		R.recSend.classList.add('smsg-rec-send');
		R.recbar.appendChild(R.recCancel);
		R.recbar.appendChild(el('span', 'smsg-rec-dot'));
		R.recbar.appendChild(R.recTime);
		R.recbar.appendChild(R.recSend);
		R.form.appendChild(R.recbar);
		R.form.appendChild(R.menu);
		R.mini = el('div', 'smsg-mini');
		R.miniPrev = iconBtn('skipp', 'موزیک قبلی', true);
		R.miniPlay = iconBtn('play', 'پخش');
		R.miniNext = iconBtn('skipn', 'موزیک بعدی', true);
		R.miniClose = iconBtn('close', 'بستن پخش‌کننده');
		R.miniTitle = el('span', 'smsg-mini-title');
		R.miniArtist = el('span', 'smsg-mini-artist');
		var mt = el('span', 'smsg-mini-txt');
		mt.appendChild(R.miniTitle);
		mt.appendChild(R.miniArtist);
		R.miniFill = el('i');
		var mbar = el('span', 'smsg-mini-bar');
		mbar.appendChild(R.miniFill);
		R.mini.appendChild(R.miniPlay);
		R.mini.appendChild(mt);
		R.mini.appendChild(R.miniPrev);
		R.mini.appendChild(R.miniNext);
		R.mini.appendChild(R.miniClose);
		R.mini.appendChild(mbar);
		R.miniPlay.addEventListener('click', function () {
			if (!musicCur) return;
			if (musicAudio.paused) { var p = musicAudio.play(); if (p && p.catch) p.catch(function () {}); } else musicAudio.pause();
		});
		R.miniPrev.addEventListener('click', function () { musicStep(-1); });
		R.miniNext.addEventListener('click', function () { musicStep(1); });
		R.miniClose.addEventListener('click', musicClose);
		main.appendChild(R.head);
		main.appendChild(R.mini);
		main.appendChild(R.msgs);
		main.appendChild(R.err);
		R.blockbar = el('div', 'smsg-blockbar');
		R.blockbar.appendChild(el('span', null, 'این کاربر را بلاک کرده‌اید.'));
		var ub = el('button', 'smsg-dbtn', 'رفع بلاک');
		ub.type = 'button';
		ub.addEventListener('click', function () { if (state.peer) toggleBlock(state.peer).catch(function () {}); });
		R.blockbar.appendChild(ub);
		main.appendChild(R.blockbar);
		main.appendChild(R.form);

		R.toasts = el('div', 'smsg-toasts');
		wrap.appendChild(side);
		wrap.appendChild(main);
		wrap.appendChild(R.toasts);
		root.appendChild(wrap);

		var t;
		R.search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(doSearch, 300); });
		R.gear.addEventListener('click', function () { if (!hasLayer('panel')) openPanel(); });
		R.contactsBtn.addEventListener('click', function () {
			if (!hasLayer('panel')) openPanel();
			if (!hasLayer('contacts')) openContacts();
		});
		R.headInfo.addEventListener('click', function () { if (state.peer) showProfile(state.peer); });
		R.form.addEventListener('submit', function (e) { e.preventDefault(); send(); });
		R.input.addEventListener('keydown', function (e) {
			if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
		});
		R.input.addEventListener('input', autosize);
		R.input.addEventListener('input', toggleComposer);
		R.attach.addEventListener('click', function () {
			if (state.peer && !state.busy && !preparing) R.menu.classList.toggle('is-open');
		});
		document.addEventListener('click', function (e) {
			if (R.menu.classList.contains('is-open') && !R.menu.contains(e.target) && !R.attach.contains(e.target)) R.menu.classList.remove('is-open');
		});
		R.music.addEventListener('change', function () {
			var f = R.music.files[0];
			R.music.value = '';
			if (f) handleMusic(f);
		});
		R.media.addEventListener('change', function () {
			var f = R.media.files[0];
			R.media.value = '';
			if (f) handleMedia(f);
		});
		R.file.addEventListener('change', function () {
			var f = R.file.files[0];
			R.file.value = '';
			if (f) upload(f, 'file', f.name);
		});
		R.mic.addEventListener('click', startRec);
		R.recCancel.addEventListener('click', function () { if (rec) rec.stop(false); });
		R.recSend.addEventListener('click', function () { if (rec) rec.stop(true); });
		R.input.addEventListener('input', function () { setActivity(R.input.value.trim() ? 'typing' : 'stop'); });
		R.back.addEventListener('click', function () {
			if (hasLayer('chat')) closeLayer('chat'); else exitChat();
		});
		showEmpty();
		setupNotice();
		toggleComposer();
	}

	function exitChat() {
		if (rec) rec.stop(false);
		musicCtrls = [];
		state.peer = null;
		state.status = null;
		pending = {};
		R.wrap.classList.remove('smsg-open');
		R.main.classList.add('is-empty');
		showEmpty();
		renderConvs();
	}

	function autosize() {
		R.input.style.height = 'auto';
		R.input.style.height = Math.min(R.input.scrollHeight, 130) + 'px';
	}

	function showEmpty() {
		R.msgs.textContent = '';
		R.msgs.appendChild(el('div', 'smsg-pill-note', 'یک گفتگو را انتخاب کنید تا پیام‌ها نمایش داده شوند'));
	}

	/* ---------- لیست گفتگوها و جستجو ---------- */
	function row(user, sub, unread, active, time, online) {
		var b = el('button', 'smsg-row' + (active ? ' is-active' : ''));
		b.type = 'button';
		var aw = el('span', 'smsg-av-wrap');
		aw.appendChild(avatarEl(user, 48));
		if (online) aw.appendChild(el('span', 'smsg-dot'));
		b.appendChild(aw);
		var body = el('span', 'smsg-row-body');
		var top = el('span', 'smsg-row-top');
		top.appendChild(el('span', 'smsg-row-name', user.name));
		if (time) top.appendChild(el('span', 'smsg-row-time', time));
		var bot = el('span', 'smsg-row-bot');
		bot.appendChild(el('span', 'smsg-row-sub', sub || ''));
		if (unread) bot.appendChild(el('span', 'smsg-badge', fa(unread)));
		body.appendChild(top);
		body.appendChild(bot);
		b.appendChild(body);
		b.addEventListener('click', function () { openChat(user); });
		return b;
	}

	function renderConvs() {
		if (state.searchTerm.length >= 2) return;
		R.list.textContent = '';
		if (!state.convs.length) {
			R.list.appendChild(el('div', 'smsg-empty-small', 'هنوز گفتگویی ندارید. نام یا @نام‌کاربری یک عضو را جستجو کنید.'));
			return;
		}
		state.convs.forEach(function (c) {
			var prefix = Number(c.last.from) === cfg.me ? 'شما: ' : '';
			var preview = (prefix + msgPreview(c.last)).replace(/\s+/g, ' ');
			R.list.appendChild(row(c.user, preview, c.unread, state.peer && state.peer.id === c.user.id, shortTime(c.last.ts), c.online));
		});
	}

	function loadConvs() {
		return api('conversations', { query: { vis: document.hidden ? 0 : 1 } }).then(function (d) {
			var total = 0;
			d.forEach(function (c) {
				c.user.id = Number(c.user.id);
				var prev = state.unread[c.user.id] || 0;
				var viewing = state.peer && state.peer.id === c.user.id && !document.hidden;
				if (viewing) c.unread = 0;
				if (state.seeded && c.unread > prev && !viewing) notify(c);
				state.unread[c.user.id] = c.unread;
				total += c.unread;
			});
			state.seeded = true;
			state.convs = d;
			if (state.peer) {
				d.forEach(function (c) {
					if (c.user.id === state.peer.id && !same(c.user, state.peer)) { state.peer = c.user; updateHeader(); }
				});
			}
			document.title = total > 0 ? '(' + total + ') ' + baseTitle : baseTitle;
			renderConvs();
		}).catch(function () {});
	}

	function doSearch() {
		var term = R.search.value.trim();
		state.searchTerm = term;
		if (term.replace(/^@/, '').length < 2) { state.searchTerm = ''; renderConvs(); return; }
		api('users', { query: { search: term } }).then(function (users) {
			if (state.searchTerm !== term) return;
			R.list.textContent = '';
			if (!users.length) R.list.appendChild(el('div', 'smsg-empty-small', 'عضوی پیدا نشد.'));
			users.forEach(function (u) {
				u.id = Number(u.id);
				R.list.appendChild(row(u, u.username ? '@' + u.username : '', 0, false, ''));
			});
		}).catch(function () {});
	}

	/* ---------- گفتگو ---------- */
	function openChat(user) {
		user.id = Number(user.id);
		state.peer = user;
		state.lastId = 0;
		state.lastDay = '';
		if (rec) rec.stop(false);
		musicCtrls = [];
		pending = {};
		state.status = null;
		lastAct = { kind: '', t: 0 };
		state.unread[user.id] = 0;
		state.convs.forEach(function (c) { if (c.user.id === user.id) c.unread = 0; });
		R.search.value = '';
		state.searchTerm = '';
		updateHeader();
		R.msgs.textContent = '';
		R.err.textContent = '';
		toggleComposer();
		R.main.classList.remove('is-empty');
		R.wrap.classList.add('smsg-open');
		renderConvs();
		if (isNarrow() && !hasLayer('chat')) pushLayer('chat', exitChat);
		fetchMessages(true);
		pollStatus();
		syncProfiles(true);
		// در موبایل کیبورد خودکار باز نشود (ممکن است کاربر فقط بخواهد پیام‌ها را بخواند)
		if (isDesktopInput()) R.input.focus();
	}

	function updateHeader() {
		var u = state.peer;
		if (!u) return;
		R.title.textContent = u.name;
		renderSub();
		R.headAv.textContent = '';
		R.headAv.appendChild(avatarEl(u, 40));
		updateBlockUI();
	}

	/* ---------- ارسال فایل و ویس ---------- */
	var rec = null, curVoice = null, MAX_REC = 300;

	function toggleComposer() {
		var has = !!R.input.value.trim();
		R.send.classList.toggle('is-off', !has);
		R.mic.classList.toggle('is-off', has);
	}
	function mmss(s) {
		s = Math.max(0, Math.floor(s || 0));
		return Number(Math.floor(s / 60)).toLocaleString('fa-IR') + ':' + Number(s % 60).toLocaleString('fa-IR', { minimumIntegerDigits: 2 });
	}
	function fsize(b) {
		b = Number(b) || 0;
		if (b < 1024) return fa(b) + ' بایت';
		if (b < 1048576) return fa(Math.round(b / 1024)) + ' کیلوبایت';
		return Number(b / 1048576).toLocaleString('fa-IR', { maximumFractionDigits: 1 }) + ' مگابایت';
	}
	function fileUrl(m) {
		return cfg.rest + 'file' + (cfg.rest.indexOf('?') > -1 ? '&' : '?') + 'id=' + m.id + '&_wpnonce=' + encodeURIComponent(cfg.nonce);
	}
	function msgPreview(m) {
		if (m.type === 'voice') return '🎤 پیام صوتی';
		if (m.type === 'location') return '📍 موقعیت مکانی' + (m.text ? ' — ' + m.text : '');
		if (m.type === 'music') return '🎵 ' + ((m.file && (m.file.title || m.file.name)) || 'موزیک');
		if (m.type === 'image') return '🖼 تصویر' + (m.text ? ' — ' + m.text : '');
		if (m.type === 'video') return '🎬 ویدئو' + (m.text ? ' — ' + m.text : '');
		if (m.type === 'file') return '📎 ' + ((m.file && m.file.name) || 'فایل') + (m.text ? ' — ' + m.text : '');
		return m.text;
	}
	function actFor(mime) {
		mime = mime || '';
		if (/^image\//.test(mime)) return 'sending_image';
		if (/^video\//.test(mime)) return 'sending_video';
		if (/^audio\//.test(mime)) return 'sending_music';
		return 'sending_file';
	}

	function fileEl(m) {
		var a = el('a', 'smsg-file');
		a.href = fileUrl(m);
		a.download = m.file.name;
		a.rel = 'noopener';
		var ic = el('span', 'smsg-file-ic');
		ic.appendChild(icon('file'));
		var t = el('span', 'smsg-file-txt');
		t.appendChild(el('span', 'smsg-file-name', m.file.name));
		t.appendChild(el('span', 'smsg-file-size', fsize(m.file.size)));
		a.appendChild(ic);
		a.appendChild(t);
		a.appendChild(icon('download'));
		return a;
	}

	function voiceEl(m) {
		var w = el('div', 'smsg-voice');
		var a = new Audio();
		a.preload = 'none';
		a.src = fileUrl(m);
		var dur = m.file.dur || 0;
		var btn = iconBtn('play', 'پخش');
		btn.classList.add('smsg-voice-btn');
		var bar = el('input', 'smsg-voice-bar');
		bar.type = 'range'; bar.min = 0; bar.max = 1000; bar.value = 0;
		bar.setAttribute('aria-label', 'پیشرفت پخش');
		var tm = el('span', 'smsg-voice-time', mmss(dur));
		function total() { return isFinite(a.duration) && a.duration > 0 ? a.duration : dur; }
		function setBtn(playing) {
			btn.textContent = '';
			btn.appendChild(icon(playing ? 'pause' : 'play'));
			btn.setAttribute('aria-label', playing ? 'توقف' : 'پخش');
		}
		setBtn(false);
		btn.addEventListener('click', function () {
			if (a.paused) {
				if (curVoice && curVoice !== a) curVoice.pause();
				if (musicAudio) musicAudio.pause();
				curVoice = a;
				var p = a.play();
				if (p && p.catch) p.catch(function () {});
			} else { a.pause(); }
		});
		a.addEventListener('play', function () { setBtn(true); });
		a.addEventListener('pause', function () { setBtn(false); });
		a.addEventListener('ended', function () { setBtn(false); bar.value = 0; tm.textContent = mmss(dur); });
		a.addEventListener('timeupdate', function () {
			var d = total();
			if (d) bar.value = Math.min(1000, a.currentTime / d * 1000);
			tm.textContent = mmss(a.currentTime);
		});
		bar.addEventListener('input', function () {
			var d = total();
			if (d) a.currentTime = bar.value / 1000 * d;
		});
		w.appendChild(btn);
		w.appendChild(bar);
		w.appendChild(tm);
		return w;
	}

	/* ---------- موزیک: ارسال، پخش‌کنندهٔ داخل برنامه و نوار پخش ---------- */
	var musicAudio = new Audio();
	musicAudio.preload = 'auto';
	var musicCur = null, musicCtrls = [];

	function id3Decode(bytes, enc) {
		try {
			if (enc === 1) {
				var le = !(bytes[0] === 0xFE && bytes[1] === 0xFF);
				var st = (bytes[0] === 0xFF || bytes[0] === 0xFE) ? 2 : 0;
				return new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(bytes.subarray(st));
			}
			if (enc === 2) return new TextDecoder('utf-16be').decode(bytes);
			if (enc === 3) return new TextDecoder('utf-8').decode(bytes);
			// کدگذاری ۰ در عمل اغلب UTF-8 یا windows-1256 (فارسی) است
			try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) {}
			return new TextDecoder('windows-1256').decode(bytes);
		} catch (e) { return ''; }
	}
	function id3Text(fr) { return id3Decode(fr.subarray(1), fr[0]).split('\0')[0].trim().slice(0, 100); }
	function id3Pic(fr, v2) {
		try {
			var enc = fr[0], p, mime;
			if (v2) { mime = 'image/' + String.fromCharCode(fr[1], fr[2], fr[3]).toLowerCase(); p = 4; }
			else { var e = fr.indexOf(0, 1); mime = String.fromCharCode.apply(null, fr.subarray(1, e)).toLowerCase(); p = e + 1; }
			p += 1;
			if (enc === 1 || enc === 2) { while (p + 1 < fr.length && !(fr[p] === 0 && fr[p + 1] === 0)) p += 2; p += 2; }
			else { while (p < fr.length && fr[p] !== 0) p++; p += 1; }
			if (p >= fr.length) return null;
			if (!/^image\/(jpeg|png)$/.test(mime)) mime = 'image/jpeg';
			return new Blob([fr.subarray(p)], { type: mime });
		} catch (e) { return null; }
	}
	// خواندن عنوان، خواننده و جلد از ID3v2 (MP3)
	function readId3(file) {
		var empty = { title: '', artist: '', cover: null };
		if (!file.slice || !file.slice(0, 1).arrayBuffer) return Promise.resolve(empty);
		return file.slice(0, 4194304).arrayBuffer().then(function (buf) {
			var u = new Uint8Array(buf), out = { title: '', artist: '', cover: null };
			if (u.length < 10 || u[0] !== 0x49 || u[1] !== 0x44 || u[2] !== 0x33) return out;
			var ver = u[3];
			var tagSize = ((u[6] & 127) << 21) | ((u[7] & 127) << 14) | ((u[8] & 127) << 7) | (u[9] & 127);
			var end = Math.min(u.length, 10 + tagSize), p = 10;
			if (ver > 2 && (u[5] & 0x40)) {
				p += ver === 4
					? (((u[10] & 127) << 21) | ((u[11] & 127) << 14) | ((u[12] & 127) << 7) | (u[13] & 127))
					: (((u[10] << 24) | (u[11] << 16) | (u[12] << 8) | u[13]) + 4);
			}
			var idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10;
			while (p + hdr <= end && u[p] !== 0) {
				var id = String.fromCharCode.apply(null, u.subarray(p, p + idLen)), sz;
				if (ver === 2) sz = (u[p + 3] << 16) | (u[p + 4] << 8) | u[p + 5];
				else if (ver === 4) sz = ((u[p + 4] & 127) << 21) | ((u[p + 5] & 127) << 14) | ((u[p + 6] & 127) << 7) | (u[p + 7] & 127);
				else sz = ((u[p + 4] << 24) | (u[p + 5] << 16) | (u[p + 6] << 8) | u[p + 7]) >>> 0;
				var body = p + hdr;
				if (sz <= 0 || body + sz > end) break;
				var fr = u.subarray(body, body + sz);
				if (id === 'TIT2' || id === 'TT2') out.title = out.title || id3Text(fr);
				else if (id === 'TPE1' || id === 'TP1') out.artist = out.artist || id3Text(fr);
				else if ((id === 'APIC' || id === 'PIC') && !out.cover) out.cover = id3Pic(fr, ver === 2);
				p = body + sz;
			}
			return out;
		}).catch(function () { return empty; });
	}
	function readMusic(file) {
		return readId3(file).then(function (tags) {
			var out = { title: tags.title || '', artist: tags.artist || '', dur: 0, thumb: '' };
			if (!out.title) out.title = (file.name || '').replace(/\.[^.]+$/, '').slice(0, 100);
			var tasks = [new Promise(function (res) {
				var a = new Audio(), url = URL.createObjectURL(file), t;
				function fin() { clearTimeout(t); URL.revokeObjectURL(url); res(); }
				t = setTimeout(fin, 5000);
				a.preload = 'metadata';
				a.onloadedmetadata = function () { if (isFinite(a.duration)) out.dur = Math.round(a.duration); fin(); };
				a.onerror = fin;
				a.src = url;
			})];
			if (tags.cover) {
				tasks.push(readImage(tags.cover).then(function (r) {
					try { out.thumb = makeThumb(r.el, r.w, r.h, 64); } catch (e) {}
					URL.revokeObjectURL(r.url);
				}).catch(function () {}));
			}
			return Promise.all(tasks).then(function () { return out; });
		});
	}
	function handleMusic(file) {
		if (!state.peer || state.busy || preparing) return;
		if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i.test(file.name || '')) {
			R.err.textContent = 'فقط فایل موزیک (MP3، M4A، AAC، OGG، WAV، FLAC) انتخاب کنید.';
			return;
		}
		R.err.textContent = '';
		preparing = true;
		readMusic(file).then(function (info) {
			preparing = false;
			upload(file, 'music', file.name, info);
		}).catch(function () {
			preparing = false;
			R.err.textContent = 'خواندن فایل انجام نشد.';
		});
	}

	function musicTitle(m) { return m.file.title || (m.file.name || '').replace(/\.[^.]+$/, '') || 'موزیک'; }
	function setSession(m) {
		if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
		try {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: musicTitle(m), artist: m.file.artist || '',
				artwork: m.thumb ? [{ src: m.thumb, sizes: '64x64', type: 'image/jpeg' }] : []
			});
			navigator.mediaSession.setActionHandler('play', function () { musicAudio.play(); });
			navigator.mediaSession.setActionHandler('pause', function () { musicAudio.pause(); });
			navigator.mediaSession.setActionHandler('previoustrack', function () { musicStep(-1); });
			navigator.mediaSession.setActionHandler('nexttrack', function () { musicStep(1); });
		} catch (e) {}
	}
	function updateMini() {
		if (!musicCur) { R.mini.classList.remove('is-on'); return; }
		var m = musicCur.m;
		R.miniTitle.textContent = musicTitle(m);
		R.miniArtist.textContent = m.file.artist || '';
		R.mini.classList.add('is-on');
	}
	function miniState(playing) {
		R.miniPlay.textContent = '';
		R.miniPlay.appendChild(icon(playing ? 'pause' : 'play'));
		R.miniPlay.setAttribute('aria-label', playing ? 'توقف' : 'پخش');
	}
	function musicPlay(ctrl) {
		if (musicCur !== ctrl) {
			if (musicCur) musicCur.reset();
			musicCur = ctrl;
			musicAudio.src = fileUrl(ctrl.m);
			setSession(ctrl.m);
		}
		if (curVoice) curVoice.pause();
		updateMini();
		var p = musicAudio.play();
		if (p && p.catch) p.catch(function () { ctrl.setPlaying(false); miniState(false); });
	}
	function musicStep(d) {
		if (!musicCur) return;
		var i = musicCtrls.indexOf(musicCur);
		if (i < 0) return;
		var n = musicCtrls[i + d];
		if (n) musicPlay(n);
	}
	function musicClose() {
		musicAudio.pause();
		musicAudio.removeAttribute('src');
		try { musicAudio.load(); } catch (e) {}
		if (musicCur) musicCur.reset();
		musicCur = null;
		R.miniFill.style.width = '0';
		updateMini();
	}
	musicAudio.addEventListener('play', function () { if (musicCur) musicCur.setPlaying(true); miniState(true); });
	musicAudio.addEventListener('pause', function () { if (musicCur) musicCur.setPlaying(false); miniState(false); });
	musicAudio.addEventListener('timeupdate', function () {
		if (!musicCur) return;
		var d = isFinite(musicAudio.duration) && musicAudio.duration > 0 ? musicAudio.duration : musicCur.dur;
		musicCur.progress(musicAudio.currentTime, d);
		R.miniFill.style.width = d ? Math.min(100, musicAudio.currentTime / d * 100) + '%' : '0';
	});
	musicAudio.addEventListener('ended', function () {
		if (!musicCur) return;
		var i = musicCtrls.indexOf(musicCur);
		if (i > -1 && musicCtrls[i + 1]) { musicPlay(musicCtrls[i + 1]); return; }
		musicCur.reset();
		R.miniFill.style.width = '0';
		miniState(false);
	});
	musicAudio.addEventListener('error', function () {
		if (!musicCur || !musicAudio.getAttribute('src')) return;
		R.err.textContent = 'پخش موزیک انجام نشد. اتصال یا قالب فایل را بررسی کنید.';
		musicCur.reset();
		miniState(false);
	});

	function musicEl(m) {
		var f = m.file, dur = f.dur || 0;
		var w = el('div', 'smsg-music');
		var cover = el('button', 'smsg-music-cover' + (m.thumb ? '' : ' no-cover'));
		cover.type = 'button';
		cover.setAttribute('aria-label', 'پخش یا توقف');
		if (m.thumb) { var im = el('img'); im.src = m.thumb; im.alt = ''; cover.appendChild(im); }
		var pb = el('span', 'smsg-music-pb');
		cover.appendChild(pb);
		var info = el('div', 'smsg-music-info');
		info.appendChild(el('span', 'smsg-music-title', musicTitle(m)));
		info.appendChild(el('span', 'smsg-music-artist', f.artist || ''));
		var bar = el('input', 'smsg-voice-bar smsg-music-bar');
		bar.type = 'range'; bar.min = 0; bar.max = 1000; bar.value = 0;
		bar.setAttribute('aria-label', 'پیشرفت پخش');
		var tm = el('span', 'smsg-voice-time', mmss(dur));
		var row = el('div', 'smsg-music-row');
		row.appendChild(bar);
		row.appendChild(tm);
		info.appendChild(row);
		var dl = el('a', 'smsg-music-dl');
		dl.href = fileUrl(m) + '&dl=1';
		dl.download = f.name;
		dl.rel = 'noopener';
		dl.setAttribute('aria-label', 'ذخیرهٔ موزیک');
		dl.appendChild(icon('download'));
		w.appendChild(cover);
		w.appendChild(info);
		w.appendChild(dl);

		var ctrl = {
			m: m, dur: dur,
			setPlaying: function (b) {
				pb.textContent = '';
				pb.appendChild(icon(b ? 'pause' : 'play'));
				w.classList.toggle('is-playing', b);
			},
			progress: function (t, d) {
				bar.value = d ? Math.min(1000, t / d * 1000) : 0;
				tm.textContent = mmss(t) + ' / ' + mmss(d || dur);
			},
			reset: function () { ctrl.setPlaying(false); bar.value = 0; tm.textContent = mmss(dur); }
		};
		ctrl.setPlaying(false);
		cover.addEventListener('click', function () {
			if (musicCur === ctrl) {
				if (musicAudio.paused) { var p = musicAudio.play(); if (p && p.catch) p.catch(function () {}); } else musicAudio.pause();
			} else musicPlay(ctrl);
		});
		bar.addEventListener('input', function () {
			if (musicCur !== ctrl) { musicPlay(ctrl); return; }
			var d = isFinite(musicAudio.duration) && musicAudio.duration > 0 ? musicAudio.duration : dur;
			if (d) musicAudio.currentTime = bar.value / 1000 * d;
		});
		musicCtrls.push(ctrl);
		// اگر همین موزیک در حال پخش است (مثلاً پس از برگشت به گفتگو)، کنترل جدید جایگزین می‌شود
		if (musicCur && musicCur.m.id === m.id) {
			musicCur = ctrl;
			ctrl.setPlaying(!musicAudio.paused);
		}
		return w;
	}

	/* ---------- موقعیت مکانی ---------- */
	function mapUrl(l) {
		var tpl = cfg.mapLink;
		if (!/^(https?:\/\/|geo:)/i.test(tpl)) tpl = 'geo:{lat},{lng}';
		return tpl.replace(/\{lat\}/g, String(l.lat)).replace(/\{lng\}/g, String(l.lng));
	}
	function coordText(lat, lng) { return Number(lat).toFixed(5) + '، ' + Number(lng).toFixed(5); }
	function copyText(text) {
		if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
		return new Promise(function (resolve, reject) {
			var t = document.createElement('textarea');
			t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
			document.body.appendChild(t);
			t.select();
			try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
			t.remove();
		});
	}
	function locEl(m) {
		var l = m.loc, w = el('div', 'smsg-loc');
		var map = el('a', 'smsg-loc-map');
		map.href = mapUrl(l);
		map.target = '_blank';
		map.rel = 'noopener';
		map.setAttribute('aria-label', 'مشاهده روی نقشه');
		var ph = el('span', 'smsg-loc-ph');
		ph.appendChild(icon('pin'));
		map.appendChild(ph);
		if (cfg.hasMap) {
			var im = el('img', 'smsg-loc-img');
			im.alt = '';
			im.addEventListener('load', function () { map.classList.add('has-img'); });
			im.addEventListener('error', function () { im.remove(); });
			im.src = cfg.rest + 'map' + (cfg.rest.indexOf('?') > -1 ? '&' : '?') + 'id=' + m.id + '&_wpnonce=' + encodeURIComponent(cfg.nonce);
			map.appendChild(im);
		}
		var info = el('div', 'smsg-loc-info');
		info.appendChild(el('span', 'smsg-loc-title', 'موقعیت مکانی'));
		info.appendChild(el('span', 'smsg-loc-coord', coordText(l.lat, l.lng) + (l.acc ? ' · دقت ≈ ' + fa(l.acc) + ' متر' : '')));
		var acts = el('div', 'smsg-loc-acts');
		var open = el('a', 'smsg-loc-btn');
		open.href = mapUrl(l); open.target = '_blank'; open.rel = 'noopener';
		open.appendChild(icon('open'));
		open.appendChild(el('span', null, 'مشاهده روی نقشه'));
		var cp = el('button', 'smsg-loc-btn');
		cp.type = 'button';
		cp.appendChild(icon('copy'));
		var cpt = el('span', null, 'کپی مختصات');
		cp.appendChild(cpt);
		cp.addEventListener('click', function () {
			copyText(Number(l.lat).toFixed(6) + ',' + Number(l.lng).toFixed(6)).then(function () {
				cpt.textContent = 'کپی شد ✓';
				setTimeout(function () { cpt.textContent = 'کپی مختصات'; }, 1500);
			}).catch(function () {});
		});
		acts.appendChild(open);
		acts.appendChild(cp);
		w.appendChild(map);
		w.appendChild(info);
		w.appendChild(acts);
		return w;
	}
	function openLocation() {
		if (!state.peer || state.busy) return;
		if (!navigator.geolocation) { R.err.textContent = 'مرورگر شما از موقعیت‌یابی پشتیبانی نمی‌کند.'; return; }
		var pos = null, peerId = state.peer.id, iv;
		var c = el('div', 'smsg-locpick');
		var pinw = el('span', 'smsg-locpick-pin');
		pinw.appendChild(icon('pin'));
		var st = el('div', 'smsg-locpick-st', 'در حال یافتن موقعیت شما…');
		c.appendChild(pinw);
		c.appendChild(st);
		c.appendChild(el('div', 'smsg-field-hint', 'موقعیت از GPS یا موقعیت‌یاب مرورگر شما خوانده می‌شود و به هیچ سرویس خارجی ارسال نمی‌شود.'));
		setActivity('sending_location');
		iv = setInterval(function () { setActivity('sending_location'); }, 3200);
		navigator.geolocation.getCurrentPosition(function (p) {
			pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0) };
			pinw.classList.add('is-ok');
			st.textContent = coordText(pos.lat, pos.lng) + (pos.acc ? ' (دقت ≈ ' + fa(pos.acc) + ' متر)' : '');
		}, function (e) {
			st.classList.add('is-bad');
			st.textContent = e && e.code === 1 ? 'دسترسی به موقعیت مکانی داده نشد. اجازهٔ مرورگر را بررسی کنید.'
				: e && e.code === 3 ? 'یافتن موقعیت بیش از حد طول کشید. دوباره تلاش کنید.'
				: 'موقعیت در دسترس نیست. GPS یا موقعیت‌یابی دستگاه را روشن کنید (و صفحه باید HTTPS باشد).';
		}, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
		modal({
			title: 'ارسال موقعیت مکانی', content: c, noAutofocus: true,
			onClose: function () { clearInterval(iv); setActivity('stop'); },
			actions: [{ text: 'انصراف' }, {
				text: 'ارسال موقعیت', kind: 'primary',
				onClick: function () {
					if (!pos) return Promise.reject({ message: 'هنوز موقعیت پیدا نشده است.' });
					var cap = R.input.value.trim();
					return api('location', { body: { to: peerId, lat: pos.lat, lng: pos.lng, acc: pos.acc, caption: cap } }).then(function (m) {
						if (cap) { R.input.value = ''; autosize(); toggleComposer(); }
						lastAct = { kind: '', t: 0 };
						if (state.peer && state.peer.id === peerId) append([m], true);
						loadConvs();
					});
				}
			}]
		});
	}

	/* ---------- تصویر و ویدئو: پیش‌نمایش تار، دانلود با انیمیشن، نمایش در همان جا ---------- */
	var preparing = false;
	var mediaCache = {}, mediaOrder = [];

	function menuItem(ic, text, cb) {
		var b = el('button', 'smsg-menu-item');
		b.type = 'button';
		b.appendChild(icon(ic));
		b.appendChild(el('span', null, text));
		b.addEventListener('click', function () { R.menu.classList.remove('is-open'); cb(); });
		return b;
	}
	function cacheMedia(id, url) {
		if (mediaCache[id]) return;
		mediaCache[id] = url;
		mediaOrder.push(id);
		if (mediaOrder.length > 40) {
			var old = mediaOrder.shift();
			try { URL.revokeObjectURL(mediaCache[old]); } catch (e) {}
			delete mediaCache[old];
		}
	}

	// حلقهٔ پیشرفت دایره‌ای مثل تلگرام (با دکمهٔ لغو در مرکز)
	function ringEl(onCancel) {
		var C = 131.95;
		var b = el('button', 'smsg-ring');
		b.type = 'button';
		b.setAttribute('aria-label', 'لغو');
		b.innerHTML = '<svg class="smsg-ring-svg" viewBox="0 0 48 48" aria-hidden="true"><circle class="smsg-ring-arc" cx="24" cy="24" r="21"/></svg>';
		var arc = b.querySelector('.smsg-ring-arc');
		b.appendChild(icon('close'));
		b.setProgress = function (p) { arc.style.strokeDashoffset = String(C * (1 - Math.max(0.08, Math.min(1, p)))); };
		b.setProgress(0);
		b.addEventListener('click', function (e) { e.stopPropagation(); if (onCancel) onCancel(); });
		return b;
	}

	function mediaBox(f, thumb) {
		var box = el('div', 'smsg-media');
		var ar = (f && f.w && f.h) ? Math.min(1.8, Math.max(0.6, f.w / f.h)) : 1.4;
		box.style.setProperty('--ar', ar);
		var th = el('img', 'smsg-media-thumb');
		th.alt = '';
		if (thumb) th.src = thumb; else box.classList.add('no-thumb');
		box.appendChild(th);
		return box;
	}
	function sendingMedia(extra, onCancel) {
		var box = mediaBox({ w: extra.w, h: extra.h }, extra.thumb);
		var act = el('div', 'smsg-media-act');
		var ring = ringEl(onCancel);
		act.appendChild(ring);
		box.appendChild(act);
		return { box: box, ring: ring };
	}

	function downloadBlob(url, onProgress, holder) {
		var ctrl = window.AbortController ? new AbortController() : null;
		if (holder) holder.abort = function () { if (ctrl) ctrl.abort(); };
		return fetch(url, { credentials: 'same-origin', signal: ctrl ? ctrl.signal : undefined }).then(function (r) {
			if (!r.ok) throw {};
			var total = Number(r.headers.get('Content-Length')) || 0;
			if (!r.body || !r.body.getReader || !total) return r.blob();
			var rd = r.body.getReader(), chunks = [], got = 0, type = r.headers.get('Content-Type') || '';
			return (function pump() {
				return rd.read().then(function (s) {
					if (s.done) return new Blob(chunks, { type: type });
					chunks.push(s.value);
					got += s.value.length;
					onProgress(got / total);
					return pump();
				});
			})();
		}).catch(function (e) {
			if (e && e.name === 'AbortError') throw { aborted: true };
			throw e || {};
		});
	}

	function mediaEl(m) {
		var f = m.file, isVid = m.type === 'video';
		var box = mediaBox(f, m.thumb);
		if (isVid) box.classList.add('is-video');
		var badge = el('span', 'smsg-media-badge', (isVid && f.dur ? mmss(f.dur) + ' · ' : '') + fsize(f.size));
		var act = el('div', 'smsg-media-act');
		box.appendChild(badge);
		box.appendChild(act);
		var dl = null, ready = false;

		function idle() {
			act.textContent = '';
			var b = el('button', 'smsg-dlbtn');
			b.type = 'button';
			b.setAttribute('aria-label', isVid ? 'دانلود و پخش ویدئو' : 'دانلود تصویر');
			b.appendChild(icon('download'));
			act.appendChild(b);
		}
		function sharp(url, auto) {
			ready = true; dl = null;
			box.classList.add('is-ready');
			act.textContent = '';
			badge.remove();
			var node;
			if (isVid) {
				node = el('video', 'smsg-media-full');
				node.src = url;
				node.controls = true;
				node.playsInline = true;
				node.preload = 'auto';
				box.appendChild(node);
				box.classList.add('is-sharp');
				if (auto) { var p = node.play(); if (p && p.catch) p.catch(function () {}); }
			} else {
				node = el('img', 'smsg-media-full');
				node.alt = m.text || '';
				node.addEventListener('load', function () { box.classList.add('is-sharp'); });
				node.addEventListener('click', function () { showPhoto({ avatar: url, name: m.text || f.name }); });
				node.src = url;
				box.appendChild(node);
			}
		}
		function start() {
			var holder = {};
			act.textContent = '';
			var ring = ringEl(function () { if (holder.abort) holder.abort(); });
			act.appendChild(ring);
			dl = holder;
			downloadBlob(fileUrl(m), ring.setProgress, holder).then(function (blob) {
				var url = URL.createObjectURL(blob);
				cacheMedia(m.id, url);
				sharp(url, true);
			}).catch(function (e) {
				dl = null;
				idle();
				if (!e || !e.aborted) badge.textContent = 'دانلود انجام نشد — دوباره بزنید';
			});
		}
		box.addEventListener('click', function () { if (!ready && !dl) start(); });
		if (mediaCache[m.id]) sharp(mediaCache[m.id], false); else idle();
		return box;
	}

	// ساخت پیش‌نمایش بسیار کوچک (حدود ۴۰ پیکسل) که با CSS تار می‌شود
	function makeThumb(src, w, h, max) {
		var s = (max || 40) / Math.max(w, h);
		var c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(w * s));
		c.height = Math.max(1, Math.round(h * s));
		c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
		return c.toDataURL('image/jpeg', 0.5);
	}
	function readImage(file) {
		return new Promise(function (resolve, reject) {
			var url = URL.createObjectURL(file), im = new Image();
			im.onload = function () { resolve({ el: im, w: im.naturalWidth, h: im.naturalHeight, url: url }); };
			im.onerror = function () { URL.revokeObjectURL(url); reject(); };
			im.src = url;
		});
	}
	function readVideo(file) {
		return new Promise(function (resolve) {
			var url = URL.createObjectURL(file), v = document.createElement('video'), fin = false, to;
			function done(ok) {
				if (fin) return;
				fin = true;
				clearTimeout(to);
				resolve(ok ? { el: v, w: v.videoWidth, h: v.videoHeight, dur: Math.round(v.duration) || 0, url: url } : { url: url, w: 0, h: 0, dur: 0 });
			}
			to = setTimeout(function () { done(false); }, 7000);
			v.muted = true; v.playsInline = true; v.preload = 'auto';
			v.onloadedmetadata = function () { try { v.currentTime = Math.min(1, (v.duration || 1) / 10); } catch (e) { done(false); } };
			v.onseeked = function () { done(true); };
			v.onerror = function () { done(false); };
			v.src = url;
		});
	}
	function prepareMedia(file) {
		var isImg = /^image\//.test(file.type);
		return (isImg ? readImage(file) : readVideo(file)).then(function (r) {
			var out = { kind: isImg ? 'image' : 'video', blob: file, name: file.name || (isImg ? 'photo' : 'video'), thumb: '', w: r.w || 0, h: r.h || 0, dur: r.dur || 0 };
			if (r.el && r.w && r.h) { try { out.thumb = makeThumb(r.el, r.w, r.h); } catch (e) {} }
			function finish() { if (r.url) URL.revokeObjectURL(r.url); return out; }
			// تصویرهای بزرگ پیش از ارسال کوچک می‌شوند (به‌جز GIF)
			if (isImg && file.type !== 'image/gif' && (file.size > 2097152 || Math.max(r.w, r.h) > 2560)) {
				return new Promise(function (resolve) {
					try {
						var k = Math.min(1, 2560 / Math.max(r.w, r.h));
						var c = document.createElement('canvas');
						c.width = Math.round(r.w * k); c.height = Math.round(r.h * k);
						var g = c.getContext('2d');
						g.fillStyle = '#fff';
						g.fillRect(0, 0, c.width, c.height);
						g.drawImage(r.el, 0, 0, c.width, c.height);
						c.toBlob(function (b) {
							if (b && b.size < file.size) {
								out.blob = b; out.w = c.width; out.h = c.height;
								out.name = out.name.replace(/\.[^.]+$/, '') + '.jpg';
							}
							resolve(finish());
						}, 'image/jpeg', 0.85);
					} catch (e) { resolve(finish()); }
				});
			}
			return finish();
		});
	}
	function handleMedia(file) {
		if (!state.peer || state.busy || preparing) return;
		var isImg = /^image\//.test(file.type), isVid = /^video\//.test(file.type);
		if (!isImg && !isVid) { R.err.textContent = 'فقط تصویر یا ویدئو انتخاب کنید.'; return; }
		if (isImg && !/^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
			R.err.textContent = 'قالب تصویر پشتیبانی نمی‌شود (JPG، PNG، GIF یا WebP).';
			return;
		}
		R.err.textContent = '';
		preparing = true;
		prepareMedia(file).then(function (p) {
			preparing = false;
			upload(p.blob, p.kind, p.name, p);
		}).catch(function () {
			preparing = false;
			R.err.textContent = 'خواندن فایل انجام نشد.';
		});
	}

	// ارسال با نوار پیشرفت (XHR)
	function xhrPost(route, fd, onProgress, holder) {
		return new Promise(function (resolve, reject) {
			var x = new XMLHttpRequest();
			x.open('POST', cfg.rest + route);
			x.withCredentials = true;
			x.setRequestHeader('X-WP-Nonce', cfg.nonce);
			x.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
			x.onload = function () {
				var d = null;
				try { d = JSON.parse(x.responseText); } catch (e) {}
				if (x.status >= 200 && x.status < 300 && d) resolve(d); else reject(d || {});
			};
			x.onerror = function () { reject({}); };
			x.onabort = function () { reject({ aborted: true }); };
			if (holder) holder.abort = function () { x.abort(); };
			x.send(fd);
		});
	}

	// ارسال فایل / ویس / تصویر / ویدئو
	function upload(blob, kind, name, extra) {
		extra = extra || {};
		if (!state.peer || state.busy) return;
		var limit = kind === 'video' ? cfg.maxVideo : (kind === 'music' ? cfg.maxMusic : cfg.maxFile);
		if (blob.size > limit * 1048576) {
			R.err.textContent = 'حجم فایل نباید بیشتر از ' + fa(limit) + ' مگابایت باشد.';
			return;
		}
		var isMedia = kind === 'image' || kind === 'video';
		var peerId = state.peer.id;
		var fd = new FormData();
		fd.append('to', peerId);
		fd.append('kind', kind);
		fd.append('file', blob, name);
		var cap = '';
		if (kind === 'voice') {
			fd.append('duration', extra.duration || 0);
			fd.append('mime', blob.type || 'audio/webm');
		} else {
			cap = R.input.value.trim();
			if (cap) fd.append('caption', cap);
		}
		if (isMedia) {
			fd.append('thumb', extra.thumb || '');
			fd.append('w', extra.w || 0);
			fd.append('h', extra.h || 0);
			fd.append('duration', extra.dur || 0);
		}
		if (kind === 'music') {
			fd.append('title', extra.title || '');
			fd.append('artist', extra.artist || '');
			fd.append('duration', extra.dur || 0);
			fd.append('thumb', extra.thumb || '');
		}
		state.busy = true;
		R.err.textContent = '';
		var holder = {}, tmp, setPct;
		if (isMedia) {
			tmp = el('div', 'smsg-msg is-mine has-media');
			var sm = sendingMedia(extra, function () { if (holder.abort) holder.abort(); });
			tmp.appendChild(sm.box);
			setPct = sm.ring.setProgress;
		} else {
			tmp = el('div', 'smsg-msg is-mine smsg-uploading');
			var base = kind === 'voice' ? 'در حال ارسال پیام صوتی' : 'در حال ارسال «' + name + '»';
			var tt = el('span', 'smsg-text', base + '…');
			tmp.appendChild(tt);
			setPct = function (p) { tt.textContent = base + ' ' + fa(Math.round(p * 100)) + '٪'; };
		}
		R.msgs.appendChild(tmp);
		R.msgs.scrollTop = R.msgs.scrollHeight;
		var act = kind === 'voice' ? '' : (kind === 'music' ? 'sending_music' : actFor(blob.type));
		var iv = null;
		if (act) { setActivity(act); iv = setInterval(function () { setActivity(act); }, 3200); }
		xhrPost('upload', fd, setPct, holder).then(function (m) {
			tmp.remove();
			if (isMedia && m.id) cacheMedia(m.id, URL.createObjectURL(blob)); // فرستنده بلافاصله تصویر/ویدئوی واضح را می‌بیند
			if (cap) { R.input.value = ''; autosize(); toggleComposer(); }
			lastAct = { kind: '', t: 0 };
			if (state.peer && state.peer.id === peerId) append([m], true);
			loadConvs();
		}).catch(function (e) {
			tmp.remove();
			setActivity('stop');
			if (e && e.aborted) return;
			R.err.textContent = (e && e.code && e.message) || 'ارسال انجام نشد. ممکن است حجم فایل بیش از حد مجاز سرور باشد.';
		}).then(function () { if (iv) clearInterval(iv); state.busy = false; });
	}

	function showRec(on) { R.form.classList.toggle('is-rec', on); }

	function startRec() {
		if (!state.peer || state.busy || rec) return;
		if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)) {
			R.err.textContent = 'مرورگر شما از ضبط صدا پشتیبانی نمی‌کند. (ضبط فقط روی صفحه‌های HTTPS کار می‌کند.)';
			return;
		}
		R.err.textContent = '';
		var token = { dead: false, send: false, stop: function () { token.dead = true; } };
		rec = token;
		navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
			function release() { stream.getTracks().forEach(function (t) { t.stop(); }); }
			if (token.dead) { release(); rec = null; return; }
			var type = '';
			['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].some(function (t) {
				if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) { type = t; return true; }
				return false;
			});
			var mr;
			try { mr = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream); }
			catch (e) { release(); rec = null; R.err.textContent = 'ضبط صدا در این مرورگر ممکن نیست.'; return; }
			var chunks = [], t0 = Date.now(), tiv, aiv;
			mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
			mr.onstop = function () {
				release();
				clearInterval(tiv); clearInterval(aiv);
				var dur = Math.round((Date.now() - t0) / 1000), send = token.send;
				rec = null;
				showRec(false);
				setActivity('stop');
				if (!send) return;
				if (dur < 1) { R.err.textContent = 'پیام صوتی خیلی کوتاه بود.'; return; }
				upload(new Blob(chunks, { type: mr.mimeType || type || 'audio/webm' }), 'voice', 'voice', { duration: dur });
			};
			token.stop = function (send) { token.send = !!send; token.dead = true; if (mr.state !== 'inactive') mr.stop(); };
			mr.start();
			showRec(true);
			R.recTime.textContent = mmss(0);
			tiv = setInterval(function () {
				var s = (Date.now() - t0) / 1000;
				R.recTime.textContent = mmss(s);
				if (s >= MAX_REC) token.stop(true);
			}, 250);
			setActivity('recording_voice');
			aiv = setInterval(function () { setActivity('recording_voice'); }, 3200);
		}).catch(function () {
			if (rec === token) rec = null;
			R.err.textContent = 'دسترسی به میکروفن داده نشد.';
		});
	}

	/* ---------- وضعیت: آنلاین، آخرین بازدید، فعالیت ---------- */
	var ACT = {
		typing: 'در حال تایپ…', recording_voice: 'در حال ضبط صدا…', sending_image: 'در حال ارسال تصویر…',
		sending_file: 'در حال ارسال فایل…', sending_video: 'در حال ارسال ویدئو…',
		sending_location: 'در حال ارسال لوکیشن…', sending_music: 'در حال ارسال موزیک…'
	};
	function lastSeenText(ts) {
		if (Date.now() / 1000 - ts < 60) return 'چند لحظه پیش';
		return dayLabel(ts) + ' ساعت ' + hhmm(ts);
	}
	function renderSub() {
		var s = state.status, n = R.sub;
		n.classList.remove('is-act', 'is-online');
		if (!state.peer) { n.textContent = ''; return; }
		if (!s) { n.textContent = ''; return; }
		if (s.activity && ACT[s.activity]) { n.textContent = ACT[s.activity]; n.classList.add('is-act'); return; }
		if (s.online) { n.textContent = 'آنلاین'; n.classList.add('is-online'); return; }
		if (s.hidden) { n.textContent = 'آخرین بازدید به‌تازگی'; return; }
		n.textContent = s.last_seen ? 'آخرین بازدید: ' + lastSeenText(s.last_seen) : 'آفلاین';
	}
	function pollStatus() {
		if (!state.peer) return;
		var id = state.peer.id;
		api('status', { query: { id: id, vis: document.hidden ? 0 : 1 } }).then(function (s) {
			if (!state.peer || state.peer.id !== id) return;
			state.status = s;
			renderSub();
		}).catch(function () {});
	}
	var statusTimer;
	function statusLoop() {
		clearTimeout(statusTimer);
		if (state.peer && !document.hidden) pollStatus();
		statusTimer = setTimeout(statusLoop, Math.min(cfg.poll, 3000));
	}
	// اعلام فعالیت خودم به طرف مقابل. kind: typing | recording_voice | sending_image | sending_file |
	// sending_video | sending_location | sending_music | stop  (از بیرون: window.SMSGActivity('sending_image'))
	var lastAct = { kind: '', t: 0 };
	function setActivity(kind) {
		if (!state.peer) return;
		var now = Date.now();
		if (kind === 'stop') {
			if (!lastAct.kind) return;
			lastAct = { kind: '', t: 0 };
		} else {
			if (lastAct.kind === kind && now - lastAct.t < 3000) return;
			lastAct = { kind: kind, t: now };
		}
		api('activity', { body: { to: state.peer.id, kind: kind } }).catch(function () {});
	}
	window.SMSGActivity = setActivity;

	var TICK_ONE = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
	var TICK_TWO = 'M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z';
	var TICK_TITLES = ['ارسال شد', 'دریافت شد', 'دیده شد'];
	// ۰: یک تیک (ارسال)، ۱: دو تیک (دریافت توسط گیرنده)، ۲: دو تیک پررنگ (مشاهده)
	function setTick(n, st) {
		n.className = 'smsg-tick st-' + st;
		n.title = TICK_TITLES[st];
		n.setAttribute('aria-label', TICK_TITLES[st]);
		n.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + (st ? TICK_TWO : TICK_ONE) + '"/></svg>';
	}
	function pollReceipts() {
		var ids = Object.keys(pending).map(Number);
		if (!ids.length || !state.peer) return;
		var peer = state.peer.id;
		api('receipts', { query: { 'with': peer, since: Math.min.apply(null, ids) } }).then(function (list) {
			if (!state.peer || state.peer.id !== peer) return;
			list.forEach(function (r) {
				var p = pending[r.id], st = Number(r.st) || 0;
				if (!p) return;
				if (st > p.st) { p.st = st; setTick(p.node, st); }
				if (st >= 2) delete pending[r.id];
			});
		}).catch(function () {});
	}

	function bubble(m) {
		var b = el('div', 'smsg-msg ' + (Number(m.from) === cfg.me ? 'is-mine' : 'is-theirs'));
		if (m.type === 'voice' && m.file) b.appendChild(voiceEl(m));
		else if (m.type === 'file' && m.file) b.appendChild(fileEl(m));
		else if ((m.type === 'image' || m.type === 'video') && m.file) { b.classList.add('has-media'); b.appendChild(mediaEl(m)); }
		else if (m.type === 'music' && m.file) b.appendChild(musicEl(m));
		else if (m.type === 'location' && m.loc) { b.classList.add('has-media'); b.appendChild(locEl(m)); }
		if (!m.type || m.type === 'text' || m.text) b.appendChild(el('span', 'smsg-text', m.text));
		var meta = el('time', 'smsg-meta', hhmm(m.ts));
		if (Number(m.from) === cfg.me) {
			var tk = el('span'), st = Math.min(2, Number(m.st) || 0);
			setTick(tk, st);
			meta.appendChild(tk);
			if (st < 2) pending[m.id] = { node: tk, st: st };
		}
		b.appendChild(meta);
		return b;
	}

	function append(list, force) {
		if (!list.length) return;
		var ph = R.msgs.querySelector('.is-placeholder');
		if (ph) ph.remove();
		var atBottom = R.msgs.scrollHeight - R.msgs.scrollTop - R.msgs.clientHeight < 80;
		list.forEach(function (m) {
			if (m.id <= state.lastId) return;
			var k = dayKey(m.ts);
			if (k !== state.lastDay) {
				var s = el('div', 'smsg-day');
				s.appendChild(el('span', null, dayLabel(m.ts)));
				R.msgs.appendChild(s);
				state.lastDay = k;
			}
			R.msgs.appendChild(bubble(m));
			state.lastId = m.id;
		});
		if (force || atBottom) R.msgs.scrollTop = R.msgs.scrollHeight;
	}

	function fetchMessages(first) {
		if (!state.peer) return;
		var peer = state.peer.id;
		api('messages', { query: { 'with': peer, after: state.lastId } }).then(function (list) {
			if (!state.peer || state.peer.id !== peer) return;
			if (first && !list.length) {
				var n = el('div', 'smsg-pill-note is-placeholder', 'هنوز پیامی نیست. اولین پیام را بفرستید.');
				R.msgs.appendChild(n);
			}
			if (!first && list.some(function (m) { return Number(m.from) !== cfg.me && m.id > state.lastId; })) playSound('in');
			append(list, first);
			if (!first) pollReceipts();
		}).catch(function () {});
	}

	function send() {
		var text = R.input.value.trim();
		if (!text || !state.peer || state.busy) return;
		state.busy = true;
		R.err.textContent = '';
		api('messages', { body: { to: state.peer.id, message: text } }).then(function (m) {
			R.input.value = '';
			lastAct = { kind: '', t: 0 };
			autosize();
			toggleComposer();
			append([m], true);
			loadConvs();
		}).catch(function (e) {
			R.err.textContent = (e && e.message) || 'ارسال انجام نشد. دوباره تلاش کنید.';
		}).then(function () { state.busy = false; });
	}

	function showProfile(u) {
		var c = el('div', 'smsg-profile');
		var ab = el('button', 'smsg-profile-av');
		ab.type = 'button';
		ab.appendChild(avatarEl(u, 96));
		if (u.avatar) {
			ab.setAttribute('aria-label', 'نمایش تمام‌صفحهٔ عکس');
			ab.classList.add('is-zoomable');
			ab.addEventListener('click', function () { showPhoto(u); });
		} else {
			ab.disabled = true;
		}
		c.appendChild(ab);
		c.appendChild(el('div', 'smsg-profile-name', u.name));
		if (u.username) c.appendChild(el('div', 'smsg-profile-user', '@' + u.username));
		if (u.bio) c.appendChild(el('div', 'smsg-profile-bio', u.bio));
		var has = !!state.contactIds[u.id];
		var blk = !!state.blockIds[u.id];
		modal({
			title: '', content: c, noAutofocus: true,
			actions: [{
				text: blk ? 'رفع بلاک' : 'بلاک کردن', kind: blk ? 'primary' : 'danger',
				onClick: function () { return toggleBlock(u); }
			}, { text: 'بستن' }, {
				text: has ? 'حذف از مخاطبین' : 'افزودن به مخاطبین', kind: has ? 'danger' : 'primary',
				onClick: function () { return toggleContact(u); }
			}]
		});
	}

	/* ---------- اعلان‌ها ---------- */
	var sounds = {}, unlocked = false;
	['in', 'out'].forEach(function (k) {
		if (cfg.sounds && cfg.sounds[k]) {
			var a = new Audio(cfg.sounds[k]);
			a.preload = 'auto';
			sounds[k] = a;
		}
	});
	// مرورگرها پخش صدا را تا اولین تعامل کاربر مسدود می‌کنند؛ با اولین کلیک/لمس، صداها «آزاد» می‌شوند.
	function unlockAudio() {
		if (unlocked) return;
		unlocked = true;
		Object.keys(sounds).forEach(function (k) {
			var a = sounds[k];
			a.muted = true;
			var p = a.play();
			if (p && p.then) {
				p.then(function () { a.pause(); a.currentTime = 0; a.muted = false; })
					.catch(function () { a.muted = false; unlocked = false; });
			} else { a.pause(); a.muted = false; }
		});
	}
	['pointerdown', 'click', 'keydown', 'touchstart'].forEach(function (ev) {
		document.addEventListener(ev, unlockAudio, { passive: true });
	});
	function playSound(kind) {
		var a = sounds[kind];
		if (!a) return;
		try {
			a.currentTime = 0;
			var p = a.play();
			if (p && p.catch) p.catch(function () {});
		} catch (e) {}
	}

	function toast(c) {
		var t = el('button', 'smsg-toast');
		t.type = 'button';
		t.appendChild(avatarEl(c.user, 40));
		var b = el('span', 'smsg-toast-body');
		b.appendChild(el('span', 'smsg-toast-name', c.user.name));
		b.appendChild(el('span', 'smsg-toast-text', msgPreview(c.last)));
		t.appendChild(b);
		t.addEventListener('click', function () { t.remove(); closeAll(function () { openChat(c.user); }); });
		R.toasts.appendChild(t);
		setTimeout(function () { t.remove(); }, 6000);
	}

	function notify(c) {
		playSound('out'); // پیام از گفتگوی دیگر یا وقتی چت باز نیست
		var away = document.hidden || !document.hasFocus();
		if (!document.hidden) toast(c);
		if (away && 'Notification' in window && Notification.permission === 'granted') {
			try {
				var n = new Notification(c.user.name, {
					body: msgPreview(c.last).slice(0, 140),
					icon: c.user.avatar || undefined,
					tag: 'smsg-' + c.user.id, dir: 'rtl', lang: 'fa'
				});
				n.onclick = function () { window.focus(); n.close(); closeAll(function () { openChat(c.user); }); };
			} catch (e) {}
		}
	}

	function setupNotice() {
		R.notice.textContent = '';
		if (!('Notification' in window) || Notification.permission !== 'default') {
			R.notice.style.display = 'none';
			return;
		}
		R.notice.style.display = '';
		R.notice.appendChild(el('span', null, 'اعلان پیام‌های جدید را فعال کنید'));
		var yes = el('button', 'smsg-notice-btn', 'فعال‌سازی');
		yes.type = 'button';
		yes.addEventListener('click', function () {
			unlockAudio();
			var p = Notification.requestPermission(setupNotice);
			if (p && p.then) p.then(setupNotice);
		});
		var no = el('button', 'smsg-notice-btn is-ghost', 'بعداً');
		no.type = 'button';
		no.addEventListener('click', function () { R.notice.style.display = 'none'; });
		R.notice.appendChild(yes);
		R.notice.appendChild(no);
	}

	/* ---------- تنظیمات (شبیه تلگرام) ---------- */
	function openPanel() {
		pushLayer('panel', function () {
			R.panel.classList.remove('is-open');
			state.page = null;
		});
		state.page = 'main';
		renderPanel();
		R.panel.classList.add('is-open');
	}
	function openAccount() {
		pushLayer('account', function () { state.page = 'main'; renderPanel(); });
		state.page = 'account';
		renderPanel();
	}
	function panelHead(title, onBack) {
		var h = el('div', 'smsg-panel-head');
		var b = iconBtn('back', 'بازگشت', true);
		b.addEventListener('click', onBack);
		h.appendChild(b);
		h.appendChild(el('span', 'smsg-panel-title', title));
		return h;
	}
	function setRow(label, value, onClick, opts) {
		opts = opts || {};
		var b = el('button', 'smsg-set-row' + (opts.danger ? ' is-danger' : ''));
		b.type = 'button';
		if (opts.icon) b.appendChild(icon(opts.icon));
		var t = el('span', 'smsg-set-txt');
		t.appendChild(el('span', 'smsg-set-label', label));
		if (value) t.appendChild(el('span', 'smsg-set-value', value));
		b.appendChild(t);
		if (opts.chev) b.appendChild(icon('chev', true));
		b.addEventListener('click', onClick);
		return b;
	}

	function renderPanel() {
		R.panel.textContent = '';
		var body = el('div', 'smsg-panel-body');
		if (state.page === 'blocked') {
			R.panel.appendChild(panelHead('لیست بلاکی‌ها', function () { closeLayer('blocked'); }));
			renderBlocked(body);
		} else if (state.page === 'security') {
			R.panel.appendChild(panelHead('امنیت', function () { closeLayer('security'); }));
			var sg = el('div', 'smsg-set-group');
			sg.appendChild(setRow('لیست بلاکی‌ها', state.blocks.length ? fa(state.blocks.length) + ' کاربر' : 'خالی', function () { openPage('blocked', 'security'); }, { icon: 'block', chev: true }));
			body.appendChild(sg);
		} else if (state.page === 'privacy') {
			R.panel.appendChild(panelHead('حریم خصوصی', function () { closeLayer('privacy'); }));
			var pg = el('div', 'smsg-set-group');
			pg.appendChild(privacyStatusRow());
			body.appendChild(pg);
		} else if (state.page === 'sp') {
			R.panel.appendChild(panelHead('امنیت و حریم خصوصی', function () { closeLayer('sp'); }));
			var spg = el('div', 'smsg-set-group');
			spg.appendChild(setRow('امنیت', 'لیست بلاکی‌ها', function () { openPage('security', 'sp'); }, { icon: 'shield', chev: true }));
			spg.appendChild(setRow('حریم خصوصی', 'وضعیت آنلاین و آخرین بازدید', function () { openPage('privacy', 'sp'); }, { icon: 'eye', chev: true }));
			body.appendChild(spg);
		} else if (state.page === 'contacts') {
			R.panel.appendChild(panelHead('مخاطبین', function () { closeLayer('contacts'); }));
			renderContacts(body);
		} else if (state.page === 'account') {
			R.panel.appendChild(panelHead('اکانت', function () { closeLayer('account'); }));
			renderAccount(body);
		} else {
			R.panel.appendChild(panelHead('تنظیمات', function () { closeLayer('panel'); }));
			var me = state.me;
			var card = el('div', 'smsg-me-card');
			card.appendChild(avatarEl(me, 64));
			var t = el('span', 'smsg-me-txt');
			t.appendChild(el('span', 'smsg-me-name', me.name));
			t.appendChild(el('span', 'smsg-me-user', me.username ? '@' + me.username : 'نام کاربری تعیین نشده'));
			card.appendChild(t);
			body.appendChild(card);
			body.appendChild(setRow('مخاطبین', state.contacts.length ? fa(state.contacts.length) + ' مخاطب' : '', openContacts, { icon: 'contacts', chev: true }));
			body.appendChild(setRow('اکانت', '', openAccount, { icon: 'user', chev: true }));
			body.appendChild(setRow('امنیت و حریم خصوصی', '', function () { openPage('sp', 'main'); }, { icon: 'lock', chev: true }));
		}
		R.panel.appendChild(body);
	}

	/* ---------- امنیت و حریم خصوصی / بلاک ---------- */
	function openPage(name, parent) {
		pushLayer(name, function () { state.page = parent; renderPanel(); });
		state.page = name;
		renderPanel();
	}
	function privacyStatusRow() {
		var me = state.me;
		return setRow('وضعیت آنلاین و آخرین بازدید', me.hide_status ? 'مخفی است' : 'برای همه نمایش داده می‌شود', function () {
			var hide = !state.me.hide_status;
			modal({
				title: 'وضعیت آنلاین و آخرین بازدید',
				text: hide
					? 'اگر مخفی کنید، دیگران نه «آنلاین» بودن شما و نه زمان آخرین بازدیدتان را می‌بینند. (وضعیت «در حال تایپ» همچنان در گفتگو نمایش داده می‌شود.)'
					: 'دیگران می‌توانند آنلاین بودن و زمان آخرین بازدید شما را ببینند.',
				noAutofocus: true,
				actions: [{ text: 'انصراف' }, { text: hide ? 'مخفی کردن' : 'نمایش به همه', kind: 'primary', onClick: function () { return saveMe({ hide_status: hide ? 1 : 0 }); } }]
			});
		}, { icon: 'eye', chev: true });
	}

	function setBlocks(list) {
		state.blocks = list.map(function (u) { u.id = Number(u.id); return u; });
		state.blockIds = {};
		state.blocks.forEach(function (u) { state.blockIds[u.id] = true; });
		updateBlockUI();
	}
	function loadBlocks() {
		return api('blocks').then(function (l) {
			var old = state.blocks;
			setBlocks(l);
			if (state.page && !same(old, state.blocks)) renderPanel();
		}).catch(function () {});
	}
	function toggleBlock(u) {
		var has = !!state.blockIds[u.id];
		var p = has ? api('blocks', { method: 'DELETE', query: { id: u.id } }) : api('blocks', { body: { id: u.id } });
		return p.then(function (l) { setBlocks(l); if (state.page) renderPanel(); });
	}
	// وقتی طرف گفتگو بلاک است، به‌جای کادر پیام نوار «رفع بلاک» نمایش داده می‌شود
	function updateBlockUI() {
		if (!R.main) return;
		var b = !!(state.peer && state.blockIds[state.peer.id]);
		R.main.classList.toggle('is-blocked', b);
		if (b && rec) rec.stop(false);
	}
	function confirmBlock(u) {
		modal({
			title: 'بلاک کردن «' + u.name + '»',
			text: 'این کاربر دیگر نمی‌تواند به شما پیام بدهد و وضعیت آنلاین، آخرین بازدید و «در حال تایپ» شما را نمی‌بیند. هر زمان بخواهید می‌توانید از «تنظیمات › امنیت و حریم خصوصی › امنیت › لیست بلاکی‌ها» رفع بلاک کنید.',
			noAutofocus: true,
			actions: [{ text: 'انصراف' }, { text: 'بلاک', kind: 'danger', onClick: function () { return toggleBlock(u); } }]
		});
	}
	function blockRow(u, blocked) {
		var w = el('div', 'smsg-crow');
		var b = el('button', 'smsg-row');
		b.type = 'button';
		b.appendChild(avatarEl(u, 44));
		var body = el('span', 'smsg-row-body');
		body.appendChild(el('span', 'smsg-row-name', u.name));
		body.appendChild(el('span', 'smsg-row-sub', u.username ? '@' + u.username : (u.bio || '')));
		b.appendChild(body);
		b.addEventListener('click', function () { closeAll(function () { openChat(u); }); });
		var a = el('button', 'smsg-dbtn' + (blocked ? '' : ' is-danger'), blocked ? 'رفع بلاک' : 'بلاک');
		a.type = 'button';
		a.addEventListener('click', function () {
			if (blocked) { a.disabled = true; toggleBlock(u).catch(function () { a.disabled = false; }); }
			else confirmBlock(u);
		});
		w.appendChild(b);
		w.appendChild(a);
		return w;
	}
	function renderBlocked(body) {
		var wrap = el('div', 'smsg-contacts');
		wrap.appendChild(el('div', 'smsg-set-note', 'کاربران بلاک‌شده نمی‌توانند به شما پیام بدهند و وضعیت آنلاین، آخرین بازدید و «در حال تایپ» شما را نمی‌بینند.'));
		var inp = el('input', 'smsg-search smsg-contacts-search');
		inp.type = 'search';
		inp.placeholder = 'افزودن به بلاکی‌ها: جستجوی نام یا @نام‌کاربری';
		inp.setAttribute('aria-label', 'جستجوی کاربر برای بلاک');
		inp.value = state.blockTerm;
		var list = el('div', 'smsg-contacts-list');
		wrap.appendChild(inp);
		wrap.appendChild(list);
		body.appendChild(wrap);
		var tm, seq = 0;
		function norm(s) { return s.trim().replace(/^@/, '').toLowerCase(); }
		function paint(found) {
			var term = norm(inp.value);
			list.textContent = '';
			var mine = state.blocks.filter(function (u) {
				return !term || (u.name || '').toLowerCase().indexOf(term) > -1 || (u.username || '').indexOf(term) > -1;
			});
			if (mine.length) {
				list.appendChild(el('div', 'smsg-section-title', term ? 'بلاک‌شده‌های یافت‌شده' : 'بلاک‌شده‌ها (' + fa(mine.length) + ')'));
				mine.forEach(function (u) { list.appendChild(blockRow(u, true)); });
			}
			if (found && found.length) {
				list.appendChild(el('div', 'smsg-section-title', 'سایر اعضا'));
				found.forEach(function (u) { list.appendChild(blockRow(u, false)); });
			}
			if (!list.firstChild) {
				list.appendChild(el('div', 'smsg-empty-small', term
					? (term.length < 2 || found ? 'موردی پیدا نشد.' : 'در حال جستجو…')
					: 'لیست بلاکی‌ها خالی است.'));
			}
		}
		function trigger() {
			clearTimeout(tm);
			var my = ++seq, term = norm(inp.value);
			state.blockTerm = inp.value;
			paint(null);
			if (term.length < 2) return;
			tm = setTimeout(function () {
				api('users', { query: { search: inp.value.trim() } }).then(function (users) {
					if (my !== seq) return;
					paint(users.map(function (u) { u.id = Number(u.id); return u; })
						.filter(function (u) { return !state.blockIds[u.id]; }));
				}).catch(function () {});
			}, 300);
		}
		inp.addEventListener('input', trigger);
		trigger();
	}

	/* ---------- مخاطبین ---------- */
	function setContacts(list) {
		state.contacts = list.map(function (u) { u.id = Number(u.id); return u; });
		state.contactIds = {};
		state.contacts.forEach(function (u) { state.contactIds[u.id] = true; });
	}
	function loadContacts() {
		return api('contacts').then(function (l) {
			var old = state.contacts;
			setContacts(l);
			if (state.page && !same(old, state.contacts)) renderPanel();
		}).catch(function () {});
	}
	function toggleContact(u) {
		var has = !!state.contactIds[u.id];
		var p = has ? api('contacts', { method: 'DELETE', query: { id: u.id } }) : api('contacts', { body: { id: u.id } });
		return p.then(function (l) { setContacts(l); if (state.page) renderPanel(); });
	}
	function openContacts() {
		pushLayer('contacts', function () { state.page = 'main'; state.contactTerm = ''; renderPanel(); });
		state.page = 'contacts';
		renderPanel();
		loadContacts();
	}
	function contactRow(u, inContact) {
		var w = el('div', 'smsg-crow');
		var b = el('button', 'smsg-row');
		b.type = 'button';
		b.appendChild(avatarEl(u, 44));
		var body = el('span', 'smsg-row-body');
		body.appendChild(el('span', 'smsg-row-name', u.name));
		body.appendChild(el('span', 'smsg-row-sub', u.username ? '@' + u.username : (u.bio || '')));
		b.appendChild(body);
		b.addEventListener('click', function () { closeAll(function () { openChat(u); }); });
		var a = iconBtn(inContact ? 'close' : 'plus', inContact ? 'حذف از مخاطبین' : 'افزودن به مخاطبین');
		a.addEventListener('click', function () {
			if (inContact) {
				modal({
					title: 'حذف مخاطب',
					text: '«' + u.name + '» از مخاطبین حذف شود؟ گفتگوهای شما حذف نمی‌شود.',
					noAutofocus: true,
					actions: [{ text: 'انصراف' }, { text: 'حذف', kind: 'danger', onClick: function () { return toggleContact(u); } }]
				});
			} else {
				a.disabled = true;
				toggleContact(u).catch(function () { a.disabled = false; });
			}
		});
		w.appendChild(b);
		w.appendChild(a);
		return w;
	}
	function renderContacts(body) {
		var wrap = el('div', 'smsg-contacts');
		var inp = el('input', 'smsg-search smsg-contacts-search');
		inp.type = 'search';
		inp.placeholder = 'جستجوی مخاطب یا عضو جدید (نام یا @نام‌کاربری)';
		inp.setAttribute('aria-label', 'جستجوی مخاطبین');
		inp.value = state.contactTerm;
		var list = el('div', 'smsg-contacts-list');
		wrap.appendChild(inp);
		wrap.appendChild(list);
		body.appendChild(wrap);
		var tm, seq = 0;
		function norm(s) { return s.trim().replace(/^@/, '').toLowerCase(); }
		function paint(found) {
			var term = norm(inp.value);
			list.textContent = '';
			var mine = state.contacts.filter(function (u) {
				return !term || (u.name || '').toLowerCase().indexOf(term) > -1 || (u.username || '').indexOf(term) > -1;
			});
			if (mine.length) {
				list.appendChild(el('div', 'smsg-section-title', term ? 'مخاطبین یافت‌شده' : 'مخاطبین (' + fa(mine.length) + ')'));
				mine.forEach(function (u) { list.appendChild(contactRow(u, true)); });
			}
			if (found && found.length) {
				list.appendChild(el('div', 'smsg-section-title', 'سایر اعضا'));
				found.forEach(function (u) { list.appendChild(contactRow(u, false)); });
			}
			if (!list.firstChild) {
				list.appendChild(el('div', 'smsg-empty-small', term
					? (term.length < 2 || found ? 'موردی پیدا نشد.' : 'در حال جستجو…')
					: 'هنوز مخاطبی ندارید. با جستجوی نام یا @نام‌کاربری، عضو جدید اضافه کنید.'));
			}
		}
		function trigger() {
			clearTimeout(tm);
			var my = ++seq, term = norm(inp.value);
			state.contactTerm = inp.value;
			paint(null);
			if (term.length < 2) return;
			tm = setTimeout(function () {
				api('users', { query: { search: inp.value.trim() } }).then(function (users) {
					if (my !== seq) return;
					paint(users.map(function (u) { u.id = Number(u.id); return u; })
						.filter(function (u) { return !state.contactIds[u.id]; }));
				}).catch(function () {});
			}, 300);
		}
		inp.addEventListener('input', trigger);
		trigger();
	}

	function saveMe(vals) {
		return api('me', { body: vals }).then(function (card) {
			state.me = card;
			if (state.page) renderPanel();
		});
	}

	function renderAccount(body) {
		var me = state.me;
		var top = el('div', 'smsg-acc-top');
		var avWrap = el('div', 'smsg-acc-av');
		var avBtn = el('button', 'smsg-profile-av' + (me.avatar ? ' is-zoomable' : ''));
		avBtn.type = 'button';
		avBtn.setAttribute('aria-label', 'مشاهدهٔ عکس پروفایل');
		avBtn.appendChild(avatarEl(me, 104));
		if (me.avatar) avBtn.addEventListener('click', function () { showPhoto(me); }); else avBtn.disabled = true;
		avWrap.appendChild(avBtn);
		var cam = el('button', 'smsg-cam');
		cam.type = 'button';
		cam.setAttribute('aria-label', 'تغییر عکس پروفایل');
		cam.appendChild(icon('camera'));
		var file = el('input');
		file.type = 'file';
		file.accept = 'image/jpeg,image/png,image/gif,image/webp';
		file.hidden = true;
		cam.addEventListener('click', function () { file.click(); });
		file.addEventListener('change', function () {
			var f = file.files[0];
			file.value = '';
			if (f) openCropper(f);
		});
		avWrap.appendChild(cam);
		avWrap.appendChild(file);
		top.appendChild(avWrap);
		var note = el('div', 'smsg-acc-note');
		top.appendChild(note);
		if (me.avatar) {
			var rm = el('button', 'smsg-link-btn', 'حذف عکس');
			rm.type = 'button';
			rm.addEventListener('click', function () {
				api('me/avatar', { method: 'DELETE' }).then(function (card) { state.me = card; renderPanel(); }).catch(function () {});
			});
			top.appendChild(rm);
		}
		body.appendChild(top);

		var group = el('div', 'smsg-set-group');
		group.appendChild(setRow('نام و نام نمایشی', me.name, function () {
			modal({
				title: 'نام و نام نمایشی',
				fields: [
					{ name: 'first_name', label: 'نام', value: state.me.first_name, max: 40 },
					{ name: 'display_name', label: 'نام نمایشی', value: state.me.name, max: 40, hint: 'این نام به دیگران نمایش داده می‌شود.' }
				],
				actions: [{ text: 'انصراف' }, { text: 'ذخیره', kind: 'primary', onClick: saveMe }]
			});
		}));
		group.appendChild(setRow('بیوگرافی', me.bio || 'چند کلمه دربارهٔ خودتان بنویسید', function () {
			modal({
				title: 'بیوگرافی',
				fields: [{ name: 'bio', label: 'بیوگرافی', value: state.me.bio, max: 140, multiline: true, hint: 'حداکثر ۱۴۰ نویسه' }],
				actions: [{ text: 'انصراف' }, { text: 'ذخیره', kind: 'primary', onClick: saveMe }]
			});
		}));
		group.appendChild(setRow('نام کاربری', me.username ? '@' + me.username : 'تنظیم نشده', function () {
			modal({
				title: 'نام کاربری',
				fields: [{
					name: 'username', label: 'نام کاربری', value: state.me.username, max: 32, dir: 'ltr', prefix: '@',
					normalize: function (v) { return v.trim().replace(/^@/, '').toLowerCase(); },
					check: function (v) {
						if (!/^[a-z][a-z0-9_]{4,31}$/.test(v)) {
							return Promise.resolve({ available: false, message: 'نام کاربری باید ۵ تا ۳۲ نویسه باشد، با حرف انگلیسی شروع شود و فقط شامل حروف انگلیسی، عدد و _ باشد.' });
						}
						return api('username-check', { query: { username: v } });
					},
					hint: 'دیگران با @نام‌کاربری شما را پیدا می‌کنند. ۵ تا ۳۲ نویسه؛ فقط حروف انگلیسی، عدد و _ ؛ با حرف شروع شود.'
				}],
				actions: [{ text: 'انصراف' }, { text: 'ذخیره', kind: 'primary', onClick: saveMe }]
			});
		}));
		body.appendChild(group);

		var out = el('div', 'smsg-set-group');
		out.appendChild(setRow('خارج شدن از اکانت', '', function () {
			modal({
				title: 'خروج از اکانت',
				text: 'آیا مطمئن هستید که می‌خواهید از اکانت خود خارج شوید؟',
				actions: [{ text: 'انصراف' }, {
					text: 'خروج', kind: 'danger',
					onClick: function () { window.location.href = cfg.logoutUrl; return new Promise(function () {}); }
				}]
			});
		}, { danger: true, icon: 'logout' }));
		body.appendChild(out);
	}

	/* ---------- برش عکس پروفایل ---------- */
	function openCropper(file) {
		var url = URL.createObjectURL(file);
		var img = new Image();
		img.onerror = function () {
			URL.revokeObjectURL(url);
			modal({ title: 'خطا', text: 'این تصویر قابل خواندن نیست. یک فایل JPG، PNG یا WebP انتخاب کنید.', noAutofocus: true, actions: [{ text: 'بستن' }] });
		};
		img.onload = function () {
			var nw = img.naturalWidth, nh = img.naturalHeight;
			var V = Math.max(200, Math.min(300, Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.65)));
			var box = el('div', 'smsg-crop');
			box.style.width = V + 'px';
			box.style.height = V + 'px';
			var im = el('img', 'smsg-crop-img');
			im.src = url; im.alt = ''; im.draggable = false;
			box.appendChild(im);
			var zoom = el('input', 'smsg-crop-zoom');
			zoom.type = 'range'; zoom.min = 0; zoom.max = 100; zoom.value = 0;
			zoom.setAttribute('aria-label', 'بزرگنمایی');
			var wrap = el('div', 'smsg-crop-wrap');
			wrap.appendChild(box);
			wrap.appendChild(zoom);
			wrap.appendChild(el('div', 'smsg-field-hint', 'تصویر را بکشید و با اسلایدر (یا دو انگشت) اندازه را تنظیم کنید.'));

			var min = V / Math.min(nw, nh), max = min * 4, s = min;
			var tx = (V - nw * s) / 2, ty = (V - nh * s) / 2;
			function paint() {
				s = Math.max(min, Math.min(max, s));
				tx = Math.min(0, Math.max(V - nw * s, tx));
				ty = Math.min(0, Math.max(V - nh * s, ty));
				im.style.width = nw * s + 'px';
				im.style.height = nh * s + 'px';
				im.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
				zoom.value = max > min ? ((s - min) / (max - min)) * 100 : 0;
			}
			function zoomTo(ns, cx, cy) {
				ns = Math.max(min, Math.min(max, ns));
				var k = ns / s;
				tx = cx - (cx - tx) * k;
				ty = cy - (cy - ty) * k;
				s = ns;
				paint();
			}
			zoom.addEventListener('input', function () { zoomTo(min + (max - min) * zoom.value / 100, V / 2, V / 2); });
			box.addEventListener('wheel', function (e) {
				e.preventDefault();
				var r = box.getBoundingClientRect();
				zoomTo(s * (e.deltaY < 0 ? 1.08 : 0.92), e.clientX - r.left, e.clientY - r.top);
			}, { passive: false });
			var pts = {}, lastDist = 0;
			box.addEventListener('pointerdown', function (e) {
				try { box.setPointerCapture(e.pointerId); } catch (x) {}
				pts[e.pointerId] = { x: e.clientX, y: e.clientY };
				lastDist = 0;
			});
			box.addEventListener('pointermove', function (e) {
				var p = pts[e.pointerId];
				if (!p) return;
				var ids = Object.keys(pts);
				if (ids.length === 1) {
					tx += e.clientX - p.x; ty += e.clientY - p.y;
					p.x = e.clientX; p.y = e.clientY;
					paint();
				} else if (ids.length === 2) {
					p.x = e.clientX; p.y = e.clientY;
					var a = pts[ids[0]], b = pts[ids[1]];
					var d = Math.hypot(a.x - b.x, a.y - b.y), r = box.getBoundingClientRect();
					if (lastDist) zoomTo(s * d / lastDist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
					lastDist = d;
				}
			});
			function up(e) { delete pts[e.pointerId]; lastDist = 0; }
			box.addEventListener('pointerup', up);
			box.addEventListener('pointercancel', up);
			paint();

			modal({
				title: 'برش عکس پروفایل',
				content: wrap,
				noAutofocus: true,
				onClose: function () { URL.revokeObjectURL(url); },
				actions: [{ text: 'انصراف' }, {
					text: 'ذخیره', kind: 'primary',
					onClick: function () {
						return new Promise(function (resolve, reject) {
							var c = document.createElement('canvas');
							c.width = c.height = 512;
							var g = c.getContext('2d');
							g.fillStyle = '#fff';
							g.fillRect(0, 0, 512, 512);
							g.imageSmoothingQuality = 'high';
							g.drawImage(img, -tx / s, -ty / s, V / s, V / s, 0, 0, 512, 512);
							c.toBlob(function (blob) {
								if (!blob) { reject({ message: 'پردازش تصویر انجام نشد.' }); return; }
								var fd = new FormData();
								fd.append('avatar', blob, 'avatar.jpg');
								api('me/avatar', { form: fd }).then(function (card) {
									state.me = card;
									if (state.page) renderPanel();
									resolve();
								}).catch(reject);
							}, 'image/jpeg', 0.9);
						});
					}
				}]
			});
		};
		img.src = url;
	}

	/* ---------- همگام‌سازی اطلاعات پروفایل بدون رفرش ---------- */
	var lastSync = 0;
	function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
	function syncProfiles(force) {
		var now = Date.now();
		if (!force && now - lastSync < 20000) return;
		lastSync = now;
		api('me').then(function (c) {
			if (!same(c, state.me)) { state.me = c; if (state.page) renderPanel(); }
		}).catch(function () {});
		if (state.peer) {
			var id = state.peer.id;
			api('user', { query: { id: id } }).then(function (c) {
				if (!state.peer || state.peer.id !== id) return;
				c.id = Number(c.id);
				if (!same(c, state.peer)) { state.peer = c; updateHeader(); }
			}).catch(function () {});
		}
	}

	/* ---------- شروع و بروزرسانی دوره‌ای ---------- */
	var timer;
	function schedule() {
		clearTimeout(timer);
		timer = setTimeout(tick, document.hidden ? Math.max(cfg.poll, 15000) : cfg.poll);
	}
	function tick() {
		if (!document.hidden) { fetchMessages(false); syncProfiles(false); }
		loadConvs().then(schedule);
	}
	document.addEventListener('visibilitychange', function () {
		if (!document.hidden) { clearTimeout(timer); syncProfiles(true); tick(); pollStatus(); loadBlocks(); }
	});

	build();
	statusLoop();
	loadContacts();
	loadBlocks();
	loadConvs().then(schedule);
})();
