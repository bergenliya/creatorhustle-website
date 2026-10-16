/* ============================================================
   MAIN.JS — shared behavior for every page of the template
   1. Light/dark theme toggle (persisted in localStorage)
   2. Sticky header state on scroll
   3. Mobile navigation (hamburger)
   4. Scroll-in animations (IntersectionObserver)
============================================================ */

(function () {
  "use strict";

  const prefersReducedMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. Theme toggle ---------- */
  const root = document.documentElement;
  const themeToggle = document.getElementById("theme-toggle");
  const THEME_KEY = "site-theme";

  // Apply saved theme, or fall back to the OS preference
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) {
    root.setAttribute("data-theme", savedTheme);
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    root.setAttribute("data-theme", "dark");
  }

  function syncThemeToggle() {
    if (!themeToggle) return;
    themeToggle.setAttribute(
      "aria-pressed",
      String(root.getAttribute("data-theme") === "dark")
    );
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem(THEME_KEY, next);
      syncThemeToggle();
    });
    syncThemeToggle();
  }

  /* ---------- 2. Smart sticky header ----------
     Frosted once scrolled; hides scrolling down, returns on the
     first scroll up. Never hides while the mobile menu is open. */
  const header = document.getElementById("site-header");
  let lastScrollY = window.scrollY;

  function updateHeader() {
    if (!header) return;
    const y = window.scrollY;
    header.classList.toggle("scrolled", y > 50);

    const navIsOpen = document.querySelector(".site-nav.open");
    if (!navIsOpen) {
      if (y > lastScrollY + 4 && y > 200) {
        header.classList.add("hide");
      } else if (y < lastScrollY - 4) {
        header.classList.remove("hide");
      }
    }
    lastScrollY = y;
  }

  window.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();

  /* ---------- 3. Mobile navigation ---------- */
  const navToggle = document.getElementById("nav-toggle");
  const siteNav = document.getElementById("site-nav");

  function closeNav() {
    if (!navToggle || !siteNav) return;
    navToggle.classList.remove("open");
    siteNav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open menu");
  }

  if (navToggle && siteNav) {
    navToggle.addEventListener("click", () => {
      const isOpen = siteNav.classList.toggle("open");
      navToggle.classList.toggle("open", isOpen);
      navToggle.setAttribute("aria-expanded", String(isOpen));
      navToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
    });

    // Close the menu when a link inside it is clicked
    siteNav.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeNav();
    });

    // Close on Escape
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeNav();
    });
  }

  /* ---------- 4. Slider (reviews) ----------
     Generic crossfade carousel: works for any .slider containing a
     .slider-track, .slider-btn[data-dir] buttons and a .slider-dots
     container. Slides are stacked; the .active one fades in and its
     children cascade (see CSS). Looping is inherently seamless. */
  document.querySelectorAll(".slider").forEach((slider) => {
    const track = slider.querySelector(".slider-track");
    const slides = track ? Array.from(track.children) : [];
    const dotsWrap = slider.querySelector(".slider-dots");
    if (!track || slides.length < 2) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const AUTOPLAY_MS = 10000;
    let index = 0;
    let timer = null;

    // Carousel semantics for assistive tech
    slides.forEach((slide, i) => {
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "slide");
      slide.setAttribute("aria-label", (i + 1) + " of " + slides.length);
    });

    const dots = slides.map((_, i) => {
      const dot = document.createElement("button");
      dot.className = "slider-dot";
      dot.setAttribute("aria-label", "Go to review " + (i + 1));
      dot.addEventListener("click", () => {
        goTo(i);
        restartAutoplay();
      });
      if (dotsWrap) dotsWrap.appendChild(dot);
      return dot;
    });

    function goTo(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach((slide, s) => {
        slide.classList.toggle("active", s === index);
        slide.setAttribute("aria-hidden", String(s !== index));
      });
      dots.forEach((dot, d) => dot.classList.toggle("active", d === index));
    }

    slider.querySelectorAll(".slider-btn[data-dir]").forEach((btn) => {
      btn.addEventListener("click", () => {
        goTo(index + Number(btn.dataset.dir));
        restartAutoplay();
      });
    });

    // Swipe support
    let startX = null;
    track.addEventListener("pointerdown", (e) => { startX = e.clientX; });
    track.addEventListener("pointerup", (e) => {
      if (startX === null) return;
      const delta = e.clientX - startX;
      if (Math.abs(delta) > 40) goTo(index + (delta < 0 ? 1 : -1));
      startX = null;
      restartAutoplay();
    });

    // Autoplay — skipped for reduced-motion users, paused on hover/focus
    function startAutoplay() {
      if (reduceMotion || timer) return;
      timer = setInterval(() => goTo(index + 1), AUTOPLAY_MS);
    }

    function stopAutoplay() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    function restartAutoplay() {
      stopAutoplay();
      startAutoplay();
    }

    slider.addEventListener("mouseenter", stopAutoplay);
    slider.addEventListener("mouseleave", startAutoplay);
    slider.addEventListener("focusin", stopAutoplay);
    slider.addEventListener("focusout", startAutoplay);

    goTo(0);
    startAutoplay();
  });

  /* ---------- 5. FAQ accordion ----------
     One item open at a time; height animates in CSS via the
     0fr -> 1fr grid trick. */
  document.querySelectorAll(".faq-list").forEach((list) => {
    const items = Array.from(list.querySelectorAll(".faq-item"));

    items.forEach((item) => {
      const question = item.querySelector(".faq-question");
      if (!question) return;

      question.addEventListener("click", () => {
        const isOpen = item.classList.contains("open");

        items.forEach((other) => {
          other.classList.remove("open");
          const btn = other.querySelector(".faq-question");
          if (btn) btn.setAttribute("aria-expanded", "false");
        });

        if (!isOpen) {
          item.classList.add("open");
          question.setAttribute("aria-expanded", "true");
        }
      });
    });
  });

  /* ---------- 6. Scroll-in animations ---------- */
  const animated = document.querySelectorAll(".animate-on-scroll");

  if ("IntersectionObserver" in window && animated.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target); // animate once
          }
        });
      },
      { threshold: 0.15 }
    );

    animated.forEach((el) => observer.observe(el));
  } else {
    // Fallback: show everything immediately
    animated.forEach((el) => el.classList.add("visible"));
  }

  /* ---------- 7. Count-up stats ----------
     Any element with data-count (and optional data-suffix) ticks up
     from 0 when it enters the viewport. Markup already contains the
     final value, so this is purely progressive enhancement. */
  const counters = document.querySelectorAll("[data-count]");

  if (counters.length && "IntersectionObserver" in window && !prefersReducedMotion) {
    const DURATION = 1600;

    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          counterObserver.unobserve(entry.target);

          const el = entry.target;
          const target = parseFloat(el.dataset.count);
          const suffix = el.dataset.suffix || "";
          if (isNaN(target)) return;

          // Stepped mode (data-start): 1K+, 2K+, 3K+ ... one whole number at a time
          if (el.dataset.start) {
            let n = parseInt(el.dataset.start, 10);
            const stepMs = parseInt(el.dataset.stepMs || "170", 10);
            el.textContent = n + suffix;
            setTimeout(function step() {
              n += 1;
              el.textContent = n + suffix;
              if (n < target) setTimeout(step, n >= target - 2 ? stepMs * 1.8 : stepMs);
            }, parseInt(el.dataset.delay || "500", 10));
            return;
          }

          const startTime = performance.now();
          function tick(now) {
            const progress = Math.min((now - startTime) / DURATION, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            el.textContent = Math.round(target * eased) + suffix;
            if (progress < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.6 }
    );

    counters.forEach((el) => counterObserver.observe(el));
  }

  /* ---------- 8. Hero parallax ----------
     The hero background layer (.hero::before) drifts at ~35% of
     scroll speed via the --parallax custom property. */
  const hero = document.querySelector(".hero");

  if (hero && !prefersReducedMotion) {
    let parallaxQueued = false;

    function updateParallax() {
      const y = window.scrollY;
      if (y <= window.innerHeight * 1.2) {
        hero.style.setProperty("--parallax", (y * 0.35).toFixed(1) + "px");
      }
      parallaxQueued = false;
    }

    window.addEventListener(
      "scroll",
      () => {
        if (parallaxQueued) return;
        parallaxQueued = true;
        requestAnimationFrame(updateParallax);
      },
      { passive: true }
    );

    updateParallax();
  }

  /* ---------- 9. Logo marquee ----------
     JS-driven so hovering eases the strip to a stop instead of
     freezing it; leaving eases it back up to speed. Without JS the
     CSS keyframe animation still runs as a fallback. */
  document.querySelectorAll(".marquee").forEach((marquee) => {
    if (prefersReducedMotion) return;

    const track = marquee.querySelector(".marquee-track");
    const group = marquee.querySelector(".marquee-group");
    if (!track || !group) return;

    marquee.classList.add("js"); // disables the CSS fallback animation

    const LOOP_SECONDS = 32; // one full loop, matches the CSS fallback
    let offset = 0;
    let speed = 0;      // current px/s
    let running = true; // hover sets this to false
    let onScreen = true; // IntersectionObserver sets this
    let lastTime = null;
    let rafId = null;

    marquee.addEventListener("mouseenter", () => { running = false; });
    marquee.addEventListener("mouseleave", () => { running = true; });

    function frame(now) {
      if (lastTime === null) lastTime = now;
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const width = group.offsetWidth; // live: survives resizes
      const baseSpeed = width / LOOP_SECONDS;
      const goal = running ? baseSpeed : 0;

      // Ease the speed toward its goal for a soft stop and start
      speed += (goal - speed) * Math.min(1, dt * 3);

      offset += speed * dt;
      if (width > 0 && offset >= width) offset -= width;

      track.style.transform = "translate3d(-" + offset.toFixed(2) + "px, 0, 0)";
      rafId = requestAnimationFrame(frame);
    }

    function startLoop() {
      if (rafId === null) {
        lastTime = null;
        rafId = requestAnimationFrame(frame);
      }
    }

    function stopLoop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    // Only run the loop while the strip is on screen
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        onScreen = entries[0].isIntersecting;
        if (onScreen) startLoop();
        else stopLoop();
      }).observe(marquee);
    } else {
      startLoop();
    }
  });
})();
