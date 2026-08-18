/**
 * Platform bootstrap — связывает signals + render + package handlers.
 * Владеет state; пакет только вычисляет payload.
 */
(function () {
  "use strict";

  const $ = function (sel) {
    return document.querySelector(sel);
  };
  const status = function (msg) {
    const el = $("#status");
    if (el) el.textContent = msg;
  };

  let data = {};
  let lang = "ru";
  let symbolMode = false;
  let handlers = null;
  const state = { card_type: null, quantity_id: null, law_id: null };
  const els = {
    main: null,
    cardType: null,
    search: null,
    btnSymbol: null,
    btnClear: null,
    filters: null,
    listTitle: null,
    listCount: null,
    qList: null,
    content: null
  };

  function packageApi() {
    return window.FisPackage || null;
  }

  function bindHandlers() {
    const api = packageApi();
    handlers = api && typeof api.handlers === "function" ? api.handlers(data) : null;
  }

  function idField(cardType) {
    if (handlers && typeof handlers.id_field === "function") {
      return handlers.id_field(cardType);
    }
    if (packageApi() && packageApi().idFieldForCardType) {
      return packageApi().idFieldForCardType(cardType);
    }
    return "quantity_id";
  }

  // forward declarations filled after createRenderer / createDispatcher
  let refreshAll = function () {};
  let refreshList = function () {};
  let dispatch = function () {};

  function onContentPointer(e) {
    if (!handlers || typeof handlers.resolve_slot_action !== "function") return;
    const signal = handlers.resolve_slot_action(e.target);
    if (!signal) return;
    if (e.type === "keydown") e.preventDefault();
    dispatch({
      type: window.FisSignals.TYPES.SLOT_ACTION,
      payload: signal
    });
  }

  const renderApi = window.FisRender.createRenderer({
    els: els,
    getHandlers: function () { return handlers; },
    getState: function () { return state; },
    getLang: function () { return lang; },
    getData: function () { return data; },
    getSymbolMode: function () { return symbolMode; },
    setSymbolMode: function (v) { symbolMode = !!v; },
    idField: idField,
    status: status,
    onContentPointer: onContentPointer,
    dispatch: function (s) { return dispatch(s); }
  });

  refreshAll = renderApi.refreshAll;
  refreshList = renderApi.refreshList;

  const bus = window.FisSignals.createDispatcher({
    state: state,
    els: els,
    idField: idField,
    refreshAll: function () { refreshAll(); },
    refreshList: function () { refreshList(); },
    setLang: function (l) { lang = l || "ru"; }
  });
  dispatch = bus.dispatch;

  function setData(pack, label) {
    data = pack || {};
    bindHandlers();
    renderApi.ensureWorkspace();
    const sum =
      handlers && typeof handlers.summarize === "function" ? handlers.summarize() : null;
    if (sum) {
      status(
        (label || "pack") +
          " · quant " +
          sum.nQ +
          " · usages " +
          sum.nU +
          " · formulas " +
          sum.nF +
          " · [" +
          sum.keys.join(", ") +
          "]"
      );
      const badge = $("#pkgBadge");
      if (badge) badge.textContent = sum.keys.length ? sum.keys.length + " slices" : "empty";
    } else {
      status((label || "pack") + " loaded");
    }
    refreshAll();
  }

  // top bar
  document.querySelectorAll(".lang-toggle button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".lang-toggle button").forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      dispatch({
        type: window.FisSignals.TYPES.LANG_CHANGE,
        payload: { lang: btn.getAttribute("data-lang") || "ru" }
      });
    });
  });

  $("#fileInput") &&
    $("#fileInput").addEventListener("change", async function (e) {
      const files = [...e.target.files];
      if (!files.length) return;
      const api = packageApi();
      if (!api || typeof api.ingestFile !== "function") {
        status("FisPackage.ingestFile отсутствует (подключите code.js пакета)");
        return;
      }
      status("Читаю " + files.length + " файл(ов)…");
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const json = JSON.parse(await file.text());
          api.ingestFile(file.name, json, data);
        } catch (err) {
          status("Ошибка " + file.name + ": " + err.message);
        }
      }
      setData(data, "files");
    });

  window.FisPlatform = {
    SIGNAL_TYPES: window.FisSignals.TYPES,
    StyleRegistry: window.FisStyleRegistry,
    dispatch: dispatch,
    setData: setData,
    getState: function () { return Object.assign({}, state); },
    getData: function () { return data; },
    getLang: function () { return lang; }
  };

  status("Готов · platform modular · package: code.js");
})();
