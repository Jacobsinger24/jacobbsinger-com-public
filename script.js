/* =========================================================
   jacobbsinger.com — script
   - Theme toggle with localStorage + prefers-color-scheme
   - Active nav blade highlight on scroll
   - Contact form with Turnstile
   ========================================================= */

(function () {
  const root = document.documentElement;
  const toggle =
    document.getElementById("theme-toggle") ||
    document.querySelector(".theme-toggle");
  const stored = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = stored || (prefersDark ? "dark" : "light");
  root.setAttribute("data-theme", initial);

  if (toggle) {
    toggle.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    });
  }

  const sectionIds = ["musings", "about", "contact"];
  const sections = sectionIds
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    const navLinks = document.querySelectorAll(".blades a");
    const linkFor = (id) =>
      Array.from(navLinks).find((a) => a.getAttribute("href") === `#${id}`);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            navLinks.forEach((a) => a.classList.remove("is-active"));
            const link = linkFor(entry.target.id);
            if (link) link.classList.add("is-active");
          }
        });
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );

    sections.forEach((s) => observer.observe(s));
  }

  /* ---------- Contact form ---------- */
  const form = document.getElementById("contact-form");
  if (!form) return;

  const messageEl = document.getElementById("cf-message");
  const counterEl = document.getElementById("cf-counter");
  const statusEl = document.getElementById("cf-status");
  const submitBtn = form.querySelector(".cf-submit");

  let turnstileToken = "";
  window.onTurnstileSuccess = (t) => { turnstileToken = t; };
  window.onTurnstileExpired = () => { turnstileToken = ""; };
  window.onTurnstileError = () => { turnstileToken = ""; };

  const countWords = (s) => (String(s || "").trim().match(/\S+/g) || []).length;
  const updateCounter = () => {
    const n = countWords(messageEl.value);
    counterEl.textContent = `${n} / 150 words · min 10`;
    counterEl.classList.toggle("over", n > 150 || (n > 0 && n < 10));
  };
  messageEl.addEventListener("input", updateCounter);

  const setStatus = (text, kind) => {
    statusEl.textContent = text || "";
    statusEl.classList.remove("success", "error");
    if (kind) statusEl.classList.add(kind);
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");

    if (!form.reportValidity()) return;
    const wordCount = countWords(messageEl.value);
    if (wordCount < 10) {
      setStatus("Message must be at least 10 words.", "error");
      messageEl.focus();
      return;
    }
    if (wordCount > 150) {
      setStatus("Message exceeds 150 words. Please shorten and try again.", "error");
      return;
    }
    if (!turnstileToken) {
      setStatus("Please complete the security check below and try again.", "error");
      return;
    }

    submitBtn.disabled = true;
    const originalLabel = submitBtn.innerHTML;
    submitBtn.innerHTML = "Sending…";

    const payload = Object.fromEntries(new FormData(form).entries());
    payload.turnstileToken = turnstileToken;

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
      setStatus("Sent. I'll be in touch.", "success");
      form.reset();
      updateCounter();
      if (window.turnstile) {
        try { window.turnstile.reset(); } catch (_) { /* noop */ }
      }
      turnstileToken = "";
    } catch (err) {
      setStatus(
        err.message || "Something went wrong. Please try again or reach out on LinkedIn.",
        "error"
      );
      if (window.turnstile) {
        try { window.turnstile.reset(); } catch (_) { /* noop */ }
      }
      turnstileToken = "";
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalLabel;
    }
  });
})();


/* ============================================================
   Musings archive — tag filter (OR logic) with ?tags= URL sync
   ============================================================ */
(function () {
  var bar = document.querySelector(".filter-bar");
  var list = document.getElementById("archive-list");
  if (!bar || !list) return;

  var pills = Array.prototype.slice.call(bar.querySelectorAll(".tag-pill"));
  var cards = Array.prototype.slice.call(list.querySelectorAll(".archive-card"));
  var clearBtn = document.getElementById("filter-clear");
  var clearCta = document.getElementById("filter-clear-cta");
  var emptyEl = document.getElementById("archive-empty");
  var countEl = document.getElementById("filter-count");
  var dividerEl = document.getElementById("archive-divider");
  var total = cards.length;

  function getActiveTags() {
    return pills.filter(function (p) { return p.classList.contains("active"); })
                .map(function (p) { return p.dataset.tag; });
  }

  function applyFilters() {
    var active = getActiveTags();
    var shown = 0;
    var shownPublished = 0;
    var shownComingSoon = 0;
    cards.forEach(function (card) {
      var cardTags = (card.dataset.tags || "").split(",").filter(Boolean);
      var match = active.length === 0 || active.some(function (t) { return cardTags.indexOf(t) !== -1; });
      if (match) {
        card.hidden = false;
        shown++;
        if (card.dataset.status === "published") shownPublished++;
        else shownComingSoon++;
      } else { card.hidden = true; }
    });

    if (emptyEl) emptyEl.hidden = shown !== 0;
    if (clearBtn) clearBtn.hidden = active.length === 0;
    if (dividerEl) dividerEl.hidden = shownPublished === 0 || shownComingSoon === 0;
    if (countEl) {
      countEl.textContent = active.length === 0
        ? "Showing all " + total + " articles"
        : "Showing " + shown + " of " + total + " articles";
    }
    syncUrl(active);
  }

  function syncUrl(active) {
    var url = new URL(window.location.href);
    if (active.length === 0) url.searchParams.delete("tags");
    else url.searchParams.set("tags", active.join(","));
    var next = url.pathname + (url.search || "") + url.hash;
    window.history.replaceState({}, "", next);
  }

  function readUrlTags() {
    var params = new URLSearchParams(window.location.search);
    var raw = params.get("tags");
    if (!raw) return [];
    return raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function init() {
    var initial = readUrlTags();
    pills.forEach(function (p) {
      if (initial.indexOf(p.dataset.tag) !== -1) p.classList.add("active");
      p.addEventListener("click", function () {
        p.classList.toggle("active");
        applyFilters();
      });
    });
    if (clearBtn) clearBtn.addEventListener("click", clearAll);
    if (clearCta) clearCta.addEventListener("click", clearAll);
    applyFilters();
  }

  function clearAll() {
    pills.forEach(function (p) { p.classList.remove("active"); });
    applyFilters();
  }

  init();
})();