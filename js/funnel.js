/* Creator Hustle AI funnel (v2): shared behaviour for the funnel pages and sales-page checkouts.
   Two modes:
   - PREVIEW (FUNNEL.api is null): no payments, buttons just move to the next page so the flow can be reviewed.
   - LIVE (FUNNEL.api + FUNNEL.publishableKey set): Stripe Payment Element card form, one-click upsells
     charged to the saved card, and a personal "Create my password" link on the welcome page.
   Each checkout form says which funnel it belongs to with data-funnel="…" (rows in the course platform's
   funnel_items table decide the products and prices, never this file). */
(function () {
  var FUNNEL = {
    api: "https://learn.creatorhustle.ai/api/funnel",
    publishableKey: "pk_test_51LeZ9wKEZQS4gtal0pt1BYNe2sNf1Kv7K4tel4zDb7LCm5y39sl2RGQUVotMbpCyErDEcYDVjUnMEObYJYgGP0mD00eYvZgQHR", // TEST key: swap for pk_live_… before going live
    // Display only (preview mode and the summary box). Real prices come from the server.
    products: {
      tripwire: { name: "Interactive Mini Apps", price: 19 },
      bump: { name: "7 Claude Skills for Small Business Owners", price: 7 },
      upsell: { name: "Canva AI Prompt Library + Workshop", price: 27 },
      downsell: { name: "Mini Courses with AI Clone", price: 19 }
    }
  };
  window.FUNNEL = FUNNEL;
  var LIVE = !!(FUNNEL.api && FUNNEL.publishableKey);

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

  function api(path, body) {
    return fetch(FUNNEL.api + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {})
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
  }

  var stripePromise = null;
  function loadStripe() {
    if (stripePromise) return stripePromise;
    stripePromise = new Promise(function (resolve, reject) {
      if (window.Stripe) return resolve(window.Stripe(FUNNEL.publishableKey));
      var s = document.createElement("script"); s.src = "https://js.stripe.com/v3/"; s.async = true;
      s.onload = function () { resolve(window.Stripe(FUNNEL.publishableKey)); };
      s.onerror = function () { reject(new Error("Stripe failed to load")); };
      document.head.appendChild(s);
    });
    return stripePromise;
  }

  function showError(anchor, msg) {
    var el = anchor.querySelector(".pay-error");
    if (!el) { el = document.createElement("p"); el.className = "pay-error"; el.setAttribute("role", "alert");
      el.style.cssText = "color:#B42318;background:#FEF3F2;border-radius:10px;padding:10px 12px;font-size:14px;margin:12px 0;text-align:center";
      anchor.appendChild(el); }
    el.textContent = msg; el.hidden = !msg;
  }

  // First name: from ?first_name=, else remembered from the opt-in
  var params = new URLSearchParams(location.search);
  var name = (params.get("first_name") || store("ch_first_name") || "").trim();
  if (params.get("first_name")) store("ch_first_name", name);
  function personalise() {
    document.querySelectorAll("[data-first-name]").forEach(function (el) {
      if (name) el.textContent = el.getAttribute("data-first-name").replace("{name}", name);
    });
  }
  personalise();

  // One-click pages: only offer one-click when we know there's a saved card
  var hasCard = store("ch_card") === "1";
  document.querySelectorAll("[data-if-card]").forEach(function (el) { el.hidden = !hasCard; });

  function go(page) {
    location.href = page + (name ? "?first_name=" + encodeURIComponent(name) : "");
  }
  window.funnelGo = go;
  document.querySelectorAll("a[data-next]").forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); go(a.getAttribute("data-next")); });
  });

  // Opt-in form (Kit handles the email; we remember name + email for the checkout)
  var optin = document.querySelector("form[data-optin]");
  if (optin) {
    // Common email typos: suggest the fix once, then let them continue either way
    var TYPOS = { "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gmai.com": "gmail.com", "gnail.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gamil.com": "gmail.com",
      "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmail.con": "hotmail.com", "hotmail.co": "hotmail.com",
      "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.con": "yahoo.com", "outlok.com": "outlook.com", "outlook.con": "outlook.com",
      "iclod.com": "icloud.com", "icloud.con": "icloud.com", "icoud.com": "icloud.com" };
    var hint = optin.querySelector(".email-hint"), warned = "";
    function typoFix(v) {
      var at = v.lastIndexOf("@"); if (at < 1) return null;
      var d = v.slice(at + 1).toLowerCase(), fix = TYPOS[d];
      if (!fix && /\.con$/.test(d)) fix = d.replace(/\.con$/, ".com");
      return fix ? v.slice(0, at + 1) + fix : null;
    }
    optin.addEventListener("submit", function (e) {
      e.preventDefault();
      var n = (optin.querySelector("[name=first_name]").value || "").trim();
      var em = optin.querySelector("[name=email]");
      var trap = optin.querySelector("[name=website]");
      var suggestion = em && typoFix(em.value.trim());
      if (suggestion && warned !== em.value.trim() && hint) {
        warned = em.value.trim();
        hint.innerHTML = 'Did you mean <a href="#" style="color:inherit;font-weight:700">' + suggestion.replace(/[<>&"]/g, "") + "</a>? Tap it to fix, or press the button again if your email is right.";
        hint.hidden = false;
        hint.querySelector("a").onclick = function (ev) { ev.preventDefault(); em.value = suggestion; hint.hidden = true; warned = ""; em.focus(); };
        return;
      }
      if (hint) hint.hidden = true;
      name = n; store("ch_first_name", n); store("ch_bought", "[]");
      try { sessionStorage.removeItem("ch_order"); sessionStorage.removeItem("ch_card"); } catch (x) {}
      if (em && em.value) store("ch_email", em.value.trim());
      addBought(["freebie"]);
      if (trap && trap.value) { // a bot filled the hidden field: carry on as normal, but don't subscribe it
        return go(optin.getAttribute("data-next"));
      }
      var btn = optin.querySelector("button[type=submit]"); if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      var next = function () { go(optin.getAttribute("data-next")); };
      var kitId = optin.getAttribute("data-kit-form");
      if (!kitId || !em || !em.value) return next();
      // Subscribe them to the Kit form (Kit sends the freebie email), then move on.
      // Never keep someone waiting: continue after 4 seconds even if Kit is slow.
      var fd = new FormData();
      fd.append("email_address", em.value.trim());
      fd.append("fields[first_name]", n);
      var done = false, finish = function () { if (!done) { done = true; next(); } };
      setTimeout(finish, 4000);
      fetch("https://app.kit.com/forms/" + kitId + "/subscriptions", { method: "POST", body: fd, headers: { Accept: "application/json" } })
        .then(finish, finish);
    });
  }

  // Checkout: card form + order bump
  var co = document.querySelector("form[data-checkout]");
  if (co) {
    var bump = co.querySelector("#bump");
    var totalEls = document.querySelectorAll("[data-total]");
    var bumpRow = co.querySelector("[data-bump-row]");
    var base = +co.getAttribute("data-price") || FUNNEL.products.tripwire.price;
    var elements = null, stripe = null;
    function amount() { return base + (bump && bump.checked ? FUNNEL.products.bump.price : 0); }
    function total() {
      var t = amount();
      totalEls.forEach(function (el) { el.textContent = "$" + t; });
      if (bumpRow) bumpRow.hidden = !(bump && bump.checked);
      co.classList.toggle("bump-on", !!(bump && bump.checked));
      if (elements) elements.update({ amount: t * 100 });
    }
    var emailIn = co.querySelector("[name=email]");
    var nameIn = co.querySelector("[name=name]");
    if (emailIn && !emailIn.value && store("ch_email")) emailIn.value = store("ch_email");
    if (bump) bump.addEventListener("change", total);
    total();

    // LIVE: swap the placeholder card boxes for Stripe's secure card form
    if (LIVE) {
      var box = co.querySelector("#payment-element");
      if (box) { box.innerHTML = '<div id="stripe-card"></div>'; box.style.background = "#fff"; }
      loadStripe().then(function (s) {
        stripe = s;
        elements = stripe.elements({
          mode: "payment", currency: "usd", amount: amount() * 100, setupFutureUsage: "off_session",
          appearance: { theme: "stripe", variables: { colorPrimary: "#00868C", fontFamily: "Inter, system-ui, sans-serif", borderRadius: "10px" } },
          fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" }]
        });
        elements.create("payment", { fields: { billingDetails: { name: "never", email: "never" } }, wallets: { link: "never" } }).mount("#stripe-card");
      }).catch(function () { showError(co, "The card form didn't load. Please refresh the page."); });
    }

    co.addEventListener("submit", function (e) {
      e.preventDefault();
      var missing = Array.prototype.filter.call(co.querySelectorAll("input[required]"), function (i) { return !i.checkValidity(); });
      if (missing.length) { missing[0].reportValidity(); missing[0].focus(); return; }
      var email = emailIn ? emailIn.value.trim() : "";
      var fullName = nameIn ? nameIn.value.trim() : "";
      store("ch_email", email);
      if (!name && fullName) { name = fullName.split(/\s+/)[0]; store("ch_first_name", name); }
      var btn = co.querySelector("button[type=submit]");
      var label = btn.innerHTML;
      btn.disabled = true; btn.textContent = "Processing…";
      showError(co, "");
      var keys = ["tripwire"]; if (bump && bump.checked) keys.push("bump");

      if (!LIVE) { // preview
        addBought(keys); store("ch_card", "1");
        return setTimeout(function () { go(co.getAttribute("data-next")); }, 700);
      }
      if (!elements) { btn.disabled = false; btn.innerHTML = label; return showError(co, "The card form is still loading. Try again in a moment."); }

      var orderToken;
      elements.submit().then(function (r) {
        if (r.error) throw r.error;
        return api("/checkout", { funnel: co.getAttribute("data-funnel"), email: email, full_name: fullName, first_name: name, bump: !!(bump && bump.checked) });
      }).then(function (res) {
        if (!res.clientSecret) throw new Error(res.error || "We couldn't start your order. Please try again.");
        orderToken = res.orderToken; store("ch_order", orderToken);
        return stripe.confirmPayment({
          elements: elements, clientSecret: res.clientSecret, redirect: "if_required",
          confirmParams: {
            return_url: location.href.split("#")[0],
            payment_method_data: { billing_details: { name: fullName, email: email } }
          }
        });
      }).then(function (r) {
        if (r.error) throw r.error;
        return api("/confirm", { orderToken: orderToken });
      }).then(function (res) {
        if (!res.ok) throw new Error("Your payment didn't go through. Please check your card and try again.");
        addBought(keys); store("ch_card", "1");
        go(co.getAttribute("data-next"));
      }).catch(function (err) {
        btn.disabled = false; btn.innerHTML = label;
        showError(co, (err && err.message) || "Something went wrong. Please try again.");
      });
    });
  }

  // One-click offers (upsell / downsell), charged to the card saved at checkout
  document.querySelectorAll("[data-oneclick]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var role = btn.getAttribute("data-oneclick");
      var next = btn.getAttribute("data-next");
      var label = btn.innerHTML;
      var card = btn.closest(".card") || btn.parentNode;
      btn.disabled = true; btn.textContent = "Adding to your order…";
      showError(card, "");
      if (!LIVE) { addBought([role]); return setTimeout(function () { go(next); }, 700); }
      var orderToken = store("ch_order");
      if (!orderToken) { btn.disabled = false; btn.innerHTML = label; return showError(card, "We couldn't find your order. Please use the button below to go to your access."); }
      api("/one-click", { orderToken: orderToken, role: role }).then(function (res) {
        if (res.ok) return true;
        if (res.requiresAction && res.clientSecret) {
          return loadStripe().then(function (s) { return s.handleNextAction({ clientSecret: res.clientSecret }); })
            .then(function (r) { if (r.error) throw r.error; return api("/one-click-confirm", { orderToken: orderToken, role: role }); })
            .then(function (r2) { if (!r2.ok) throw new Error("Your bank didn't approve this payment."); return true; });
        }
        throw new Error("We couldn't add this to your order. Your card wasn't charged.");
      }).then(function () {
        addBought([role]); go(next);
      }).catch(function (err) {
        btn.disabled = false; btn.innerHTML = label;
        showError(card, (err && err.message) || "Something went wrong. Your card wasn't charged.");
      });
    });
  });

  // Welcome page: list what they got and set up the "Create My Password" button
  var list = document.querySelector("[data-bought-list]");
  function renderList(namesArr) {
    if (!list) return;
    list.innerHTML = "";
    namesArr.forEach(function (n) { var li = document.createElement("li"); li.textContent = n; list.appendChild(li); });
  }
  if (list) {
    var b = bought(); if (b.indexOf("freebie") < 0) b.unshift("freebie");
    var names = { freebie: "PDF to Interactive Workbook Claude Skill (free)" };
    Object.keys(FUNNEL.products).forEach(function (k) { names[k] = FUNNEL.products[k].name; });
    renderList(b.filter(function (k) { return names[k]; }).map(function (k) { return names[k]; }));
  }
  // Welcome page for freebie-only visitors (no purchase): show the "check your inbox" note instead of the password box
  if (document.querySelector("[data-freebie]")) {
    var paid = bought().some(function (k) { return k !== "freebie"; }) || !!store("ch_order");
    document.querySelectorAll("[data-freebie]").forEach(function (el) { el.hidden = paid; });
    document.querySelectorAll("[data-buyer]").forEach(function (el) { el.hidden = !paid; });
  }
  var setupLink = document.getElementById("setup-link");
  if (setupLink && LIVE && store("ch_order")) {
    api("/finish", { orderToken: store("ch_order") }).then(function (res) {
      if (res.firstName && !name) { name = res.firstName; personalise(); }
      if (res.purchased && res.purchased.length) renderList(["PDF to Interactive Workbook Claude Skill (free)"].concat(res.purchased.filter(function (n) { return !/PDF to Interactive Workbook/i.test(n); })));
      if (res.passwordUrl) setupLink.href = res.passwordUrl;
      else if (res.loginUrl) { setupLink.href = res.loginUrl; setupLink.textContent = "Go to My Course Library →"; }
    }).catch(function () {});
  }
})();
