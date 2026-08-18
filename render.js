/**
 * Render — монтирование layout-слотов и обновление UI-компонентов платформы.
 * COMPONENTS: CardTypeSelect | SearchBox | FilterBar | EntityList | PassportCanvas
 *
 * Данные для заполнения приходят только из package handlers.
 */
(function (global) {
  "use strict";

  function createRenderer(ctx) {
    const els = ctx.els;

    function $(sel) {
      return document.querySelector(sel);
    }

    function ensureWorkspace() {
      const root = $("#workspace");
      if (!root) return;
      if (els.main && root.contains(els.main)) return;

      root.innerHTML =
        '<main class="fis-main">' +
        '<aside class="sidebar">' +
        '<label class="card-type"><span id="fisCardTypeLabel">Type</span>' +
        '<select id="fisCardType"></select></label>' +
        '<div class="search-wrap">' +
        '<input type="text" class="search" id="fisSearch" autocomplete="off" />' +
        '<button type="button" class="search-btn" id="fisBtnSymbol" title="symbol">|X|</button>' +
        '<button type="button" class="search-btn" id="fisBtnClear" title="clear">×</button>' +
        "</div>" +
        '<div class="filters" id="fisFilters"></div>' +
        '<h2 id="fisListTitle"></h2>' +
        '<div class="list-count" id="fisListCount"></div>' +
        '<ul class="q-list" id="fisQList"></ul>' +
        "</aside>" +
        '<div class="content" id="fisContent"></div>' +
        "</main>";

      els.main = root.querySelector("main.fis-main");
      els.cardType = $("#fisCardType");
      els.search = $("#fisSearch");
      els.btnSymbol = $("#fisBtnSymbol");
      els.btnClear = $("#fisBtnClear");
      els.filters = $("#fisFilters");
      els.listTitle = $("#fisListTitle");
      els.listCount = $("#fisListCount");
      els.qList = $("#fisQList");
      els.content = $("#fisContent");

      const ST = global.FisSignals.TYPES;
      els.cardType.addEventListener("change", function () {
        ctx.dispatch({ type: ST.CARD_TYPE_CHANGE, payload: { cardType: els.cardType.value } });
      });
      els.search.addEventListener("input", function () {
        ctx.dispatch({ type: ST.SEARCH_CHANGE, payload: { search: els.search.value } });
      });
      els.btnSymbol.addEventListener("click", function () {
        ctx.setSymbolMode(!ctx.getSymbolMode());
        els.btnSymbol.classList.toggle("active", ctx.getSymbolMode());
        ctx.dispatch({
          type: ST.SEARCH_CHANGE,
          payload: { search: els.search.value, symbolMode: ctx.getSymbolMode() }
        });
      });
      els.btnClear.addEventListener("click", function () {
        els.search.value = "";
        ctx.dispatch({ type: ST.SEARCH_CHANGE, payload: { search: "" } });
      });
      els.content.addEventListener("click", ctx.onContentPointer);
      els.content.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") ctx.onContentPointer(e);
      });
    }

    function activeFilters() {
      const out = {};
      if (!els.filters) return out;
      els.filters.querySelectorAll("select[data-criterion]").forEach(function (sel) {
        if (sel.value) {
          out[sel.dataset.criterion] = {
            value: sel.value,
            collect: sel.dataset.collect || ""
          };
        }
      });
      return out;
    }

    function refreshPassport() {
      const handlers = ctx.getHandlers();
      if (!handlers || !els.content) return;
      if (typeof handlers.render_passport !== "function") {
        els.content.innerHTML = '<div class="empty">No passport handler</div>';
        return;
      }
      const state = ctx.getState();
      handlers.render_passport({
        container: els.content,
        lang: ctx.getLang(),
        data: ctx.getData(),
        cardType: state.card_type,
        state: {
          quantity_id: state.quantity_id,
          law_id: state.law_id,
          card_type: state.card_type
        }
      });
    }

    function refreshList() {
      const handlers = ctx.getHandlers();
      if (!handlers || !els.qList) return;
      const state = ctx.getState();
      const lang = ctx.getLang();
      const data = ctx.getData();
      const ST = global.FisSignals.TYPES;

      if (typeof handlers.list_title === "function" && els.listTitle) {
        els.listTitle.textContent =
          handlers.list_title({ lang: lang, data: data, cardType: state.card_type }) || "";
      }

      const items =
        typeof handlers.list_items === "function"
          ? handlers.list_items({
              lang: lang,
              data: data,
              cardType: state.card_type,
              filters: activeFilters(),
              search: els.search ? els.search.value : "",
              symbolMode: ctx.getSymbolMode()
            }) || []
          : [];

      if (els.listCount) els.listCount.textContent = String(items.length);

      const field = ctx.idField(state.card_type);
      const activeId = state[field];
      els.qList.innerHTML = "";
      items.forEach(function (item) {
        const li = document.createElement("li");
        li.innerHTML = item.html || "";
        if (activeId === item.id) li.classList.add("active");
        li.addEventListener("click", function () {
          ctx.dispatch({
            type: ST.LIST_SELECT,
            payload: { id: item.id, cardType: state.card_type }
          });
        });
        els.qList.appendChild(li);
      });

      refreshPassport();
    }

    function refreshAll() {
      const handlers = ctx.getHandlers();
      if (!handlers) {
        ctx.status("Пакет не дал handlers");
        return;
      }
      ensureWorkspace();

      const lang = ctx.getLang();
      const data = ctx.getData();
      const state = ctx.getState();
      const ST = global.FisSignals.TYPES;

      const label = $("#fisCardTypeLabel");
      if (label) label.textContent = lang === "ru" ? "Тип" : "Type";
      if (els.search) els.search.placeholder = lang === "ru" ? "Поиск…" : "Search…";

      // CardTypeSelect
      if (typeof handlers.card_types === "function" && els.cardType) {
        const types = handlers.card_types({ lang: lang, data: data }) || [];
        const prev = state.card_type || (types[0] && types[0].id) || "";
        els.cardType.innerHTML = "";
        types.forEach(function (t) {
          const opt = document.createElement("option");
          opt.value = t.id;
          opt.textContent = t.label;
          els.cardType.appendChild(opt);
        });
        if ([].some.call(els.cardType.options, function (o) { return o.value === prev; })) {
          els.cardType.value = prev;
        } else if (els.cardType.options.length) {
          els.cardType.value = els.cardType.options[0].value;
        }
        state.card_type = els.cardType.value || null;
      }

      // FilterBar
      if (els.filters) {
        els.filters.innerHTML = "";
        if (typeof handlers.filter_schema === "function" && state.card_type) {
          const schema =
            handlers.filter_schema({
              lang: lang,
              data: data,
              cardType: state.card_type
            }) || [];
          schema.forEach(function (c) {
            const lab = document.createElement("label");
            const title = document.createElement("div");
            title.textContent = c.label;
            lab.appendChild(title);
            const sel = document.createElement("select");
            sel.dataset.criterion = c.id;
            sel.dataset.collect = c.collect || "";
            const opt0 = document.createElement("option");
            opt0.value = "";
            opt0.textContent = "—";
            sel.appendChild(opt0);
            (c.options || []).forEach(function (o) {
              const opt = document.createElement("option");
              opt.value = o.value;
              opt.textContent = o.label;
              sel.appendChild(opt);
            });
            sel.addEventListener("change", function () {
              ctx.dispatch({
                type: ST.FILTER_CHANGE,
                payload: { filters: activeFilters() }
              });
            });
            lab.appendChild(sel);
            els.filters.appendChild(lab);
          });
        }
      }

      refreshList();
    }

    return {
      ensureWorkspace: ensureWorkspace,
      refreshAll: refreshAll,
      refreshList: refreshList,
      refreshPassport: refreshPassport,
      activeFilters: activeFilters
    };
  }

  global.FisRender = {
    createRenderer: createRenderer
  };
})(typeof window !== "undefined" ? window : globalThis);
