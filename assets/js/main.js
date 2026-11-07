/* ==========================================================================
   Lumen — 交互脚本
   1. 主题切换  2. 移动端菜单  3. 滚动状态  4. 滚动入场
   5. 数字动画  6. 计费周期切换  7. 年份
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. 主题切换 ---------- */
  var themeToggle = document.getElementById('theme-toggle');
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var THEME_KEY = 'lumen-theme';

  function applyTheme(theme, persist) {
    root.setAttribute('data-theme', theme);
    if (themeMeta) {
      themeMeta.setAttribute('content', theme === 'dark' ? '#0b0c11' : '#f6f7fb');
    }
    if (themeToggle) {
      themeToggle.setAttribute(
        'aria-label',
        theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'
      );
    }
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (e) {
        /* 隐私模式下忽略 */
      }
    }
  }

  applyTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
    });
  }

  // 用户未手动选择时，跟随系统主题变化
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  var onSystemChange = function (event) {
    var saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {}
    if (!saved) {
      applyTheme(event.matches ? 'dark' : 'light', false);
    }
  };
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onSystemChange);
  } else if (typeof media.addListener === 'function') {
    media.addListener(onSystemChange);
  }

  /* ---------- 2. 移动端菜单 ---------- */
  var menuToggle = document.getElementById('menu-toggle');
  var nav = document.getElementById('primary-nav');

  function setMenu(open) {
    if (!nav || !menuToggle) return;
    nav.classList.toggle('is-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
  }

  if (menuToggle && nav) {
    menuToggle.addEventListener('click', function () {
      setMenu(!nav.classList.contains('is-open'));
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        setMenu(false);
        menuToggle.focus();
      }
    });

    document.addEventListener('click', function (event) {
      if (
        nav.classList.contains('is-open') &&
        !nav.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {
        setMenu(false);
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 960) setMenu(false);
    });
  }

  /* ---------- 3. 滚动状态 ---------- */
  var header = document.getElementById('site-header');
  var ticking = false;

  function updateHeader() {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
    ticking = false;
  }

  window.addEventListener(
    'scroll',
    function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateHeader);
      }
    },
    { passive: true }
  );
  updateHeader();

  /* ---------- 4. 滚动入场 ---------- */
  var revealItems = Array.prototype.slice.call(
    document.querySelectorAll('[data-reveal]')
  );

  if (!('IntersectionObserver' in window) || reduceMotion) {
    revealItems.forEach(function (el) {
      el.classList.add('is-visible');
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );
    revealItems.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* ---------- 5. 数字动画 ---------- */
  var counters = Array.prototype.slice.call(
    document.querySelectorAll('[data-count]')
  );

  function formatNumber(value, decimals) {
    if (decimals > 0) return value.toFixed(decimals);
    return Math.round(value).toLocaleString('en-US');
  }

  function runCounter(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var suffix = el.getAttribute('data-suffix') || '';

    if (reduceMotion) {
      el.textContent = formatNumber(target, decimals) + suffix;
      return;
    }

    var duration = 1400;
    var start = null;

    function step(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = formatNumber(target * eased, decimals) + suffix;
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        el.textContent = formatNumber(target, decimals) + suffix;
      }
    }

    window.requestAnimationFrame(step);
  }

  if (counters.length) {
    if (!('IntersectionObserver' in window)) {
      counters.forEach(runCounter);
    } else {
      var counterObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              runCounter(entry.target);
              counterObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.5 }
      );
      counters.forEach(function (el) {
        counterObserver.observe(el);
      });
    }
  }

  /* ---------- 6. 计费周期切换 ---------- */
  var billingButtons = Array.prototype.slice.call(
    document.querySelectorAll('[data-billing]')
  );
  var amounts = Array.prototype.slice.call(
    document.querySelectorAll('.amount[data-monthly]')
  );

  billingButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var mode = button.getAttribute('data-billing');

      billingButtons.forEach(function (item) {
        var active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });

      amounts.forEach(function (el) {
        var value = el.getAttribute(mode === 'yearly' ? 'data-yearly' : 'data-monthly');
        if (value !== null) el.textContent = value;
      });
    });
  });

  /* ---------- 7. 年份 ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
