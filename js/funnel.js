/* Creator Hustle AI funnel: shared behaviour for the mini app funnel pages.
   PREVIEW MODE: payments are not connected yet. Pay / one-click buttons move to the
   next page so the flow can be reviewed. When the Lovable payment endpoints exist,
   set FUNNEL.api to the app's base URL and the real calls in pay() and oneClick() take over. */
(function () {
  var FUNNEL = {
    api: null, // e.g. "https://creatorhustlehub.lovable.app/api/funnel"
    products: {
      tripwire: { name: "Interactive Mini Apps", price: 19 },
      bump: { name: "7 Claude Skills for Small Business Owners", price: 7 },
      upsell: { name: "Canva AI Prompt Library + Workshop", price: 27 },
      downsell: { name: "Mini Courses with AI Clone", price: 19 }
    }
  };
  window.FUNNEL = FUNNEL;

  // Every funnel page opens at the top (unless the link points to a section on purpose)
  try { history.scrollRestoration = "manual"; } catch (e) {}
  function toTop() { if (!location.hash) window.scrollTo(0, 0); }
  toTop();
  window.addEventListener("load", toTop);
  window.addEventListener("pageshow", toTop);

  function store(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; }
  }
  function bought() { try { return JSON.parse(store("ch_bought") || "[]"); } catch (e) { return []; } }
  function addBought(keys) { var b = bought(); keys.forEach(function (k) { if (b.indexOf(k) < 0) b.push(k); }); store("ch_bought", JSON.stringify(b)); }

  // First name: from ?first_name=, else remembered from the opt-in
  var params = new URLSearchParams(location.search);
  var name = (params.get("first_name") || store("ch_first_name") || "").trim();
  if (params.get("first_name")) store("ch_first_name", name);
  document.querySelectorAll("[data-first-name]").forEach(function (el) {
    if (name) el.textContent = el.getAttribute("data-first-name").replace("{name}", name);
  });

  // Show the right note on one-click pages: card already saved, or card form needed
  var hasCard = store("ch_card") === "1";
  document.querySelectorAll("[data-if-card]").forEach(function (el) { el.hidden = !hasCard; });
  document.querySelectorAll("[data-if-no-card]").forEach(function (el) { el.hidden = hasCard; });

  function go(page) {
    location.href = page + (name ? "?first_name=" + encodeURIComponent(name) : "");
  }
  window.funnelGo = go;
  document.querySelectorAll("a[data-next]").forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); go(a.getAttribute("data-next")); });
  });

  // Opt-in form
  var optin = document.querySelector("form[data-optin]");
  if (optin) {
    optin.addEventListener("submit", function (e) {
      e.preventDefault();
      var n = (optin.querySelector("[name=first_name]").value || "").trim();
      var em = optin.querySelector("[name=email]");
      name = n; store("ch_first_name", n); store("ch_bought", "[]");
      if (em && em.value) store("ch_email", em.value.trim());
      addBought(["freebie"]);
      // LIVE: POST { first_name, email } to FUNNEL.api + "/optin" (creates the account, adds to Kit, sends login email)
      go(optin.getAttribute("data-next"));
    });
  }

  // Tripwire checkout with order bump
  var co = document.querySelector("form[data-checkout]");
  if (co) {
    var bump = co.querySelector("#bump");
    var totalEls = document.querySelectorAll("[data-total]");
    var bumpRow = co.querySelector("[data-bump-row]");
    function total() {
      var base = +co.getAttribute("data-price") || FUNNEL.products.tripwire.price; // sales page sells at full price, funnel at the one-time price
      var t = base + (bump && bump.checked ? FUNNEL.products.bump.price : 0);
      totalEls.forEach(function (el) { el.textContent = "$" + t; });
      if (bumpRow) bumpRow.hidden = !(bump && bump.checked);
      co.classList.toggle("bump-on", !!(bump && bump.checked));
    }
    // Prefill the email from the opt-in so buyers only type their name
    var emailIn = co.querySelector("[name=email]");
    if (emailIn && !emailIn.value && store("ch_email")) emailIn.value = store("ch_email");
    if (bump) bump.addEventListener("change", total);
    total();
    co.addEventListener("submit", function (e) {
      e.preventDefault();
      var missing = Array.prototype.filter.call(co.querySelectorAll("input[required]"), function (i) { return !i.checkValidity(); });
      if (missing.length) { missing[0].reportValidity(); missing[0].focus(); return; }
      if (emailIn) store("ch_email", emailIn.value.trim());
      var btn = co.querySelector("button[type=submit]");
      btn.disabled = true; btn.textContent = "Processing…";
      // LIVE: confirm the Stripe Payment Element here (card saved for one-click offers), then continue
      var keys = ["tripwire"]; if (bump && bump.checked) keys.push("bump");
      addBought(keys); store("ch_card", "1");
      setTimeout(function () { go(co.getAttribute("data-next")); }, 700);
    });
  }

  // One-click offers (upsell / downsell)
  document.querySelectorAll("[data-oneclick]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.disabled = true; btn.textContent = "Adding to your order…";
      // LIVE: POST to FUNNEL.api + "/one-click" with the product key; the saved card is charged
      addBought([btn.getAttribute("data-oneclick")]);
      setTimeout(function () { go(btn.getAttribute("data-next")); }, 700);
    });
  });

  // Welcome page: list what they got
  var list = document.querySelector("[data-bought-list]");
  if (list) {
    var b = bought(); if (b.indexOf("freebie") < 0) b.unshift("freebie");
    var names = { freebie: "PDF to Interactive Workbook Claude Skill (free)" };
    Object.keys(FUNNEL.products).forEach(function (k) { names[k] = FUNNEL.products[k].name; });
    list.innerHTML = "";
    b.forEach(function (k) { if (!names[k]) return; var li = document.createElement("li"); li.textContent = names[k]; list.appendChild(li); });
  }
})();
