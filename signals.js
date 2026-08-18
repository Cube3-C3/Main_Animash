/**
 * Signal system — закрытый реестр типов сигналов платформы + фабрика dispatch.
 * Пакет не слушает DOM: отвечает handlers'ами; платформа диспетчеризует.
 *
 * SIGNAL_TYPES:
 *   card_type_change | filter_change | search_change | list_select | slot_action | lang_change
 *
 * Вложенные slot_action.payload.type (семантика от пакета):
 *   navigate | external_link | custom
 */
(function (global) {
  "use strict";

  const SIGNAL_TYPES = Object.freeze({
    CARD_TYPE_CHANGE: "card_type_change",
    FILTER_CHANGE: "filter_change",
    SEARCH_CHANGE: "search_change",
    LIST_SELECT: "list_select",
    SLOT_ACTION: "slot_action",
    LANG_CHANGE: "lang_change"
  });

  /**
   * @param {object} ctx
   * @param {object} ctx.state
   * @param {function} ctx.idField (cardType) → state key
   * @param {function} ctx.refreshAll
   * @param {function} ctx.refreshList
   * @param {object}   ctx.els  — DOM refs (cardType, search)
   * @param {function} [ctx.setLang]
   */
  function createDispatcher(ctx) {
    function dispatch(signal) {
      if (!signal || !signal.type) return;

      switch (signal.type) {
        case SIGNAL_TYPES.LANG_CHANGE:
          if (typeof ctx.setLang === "function") {
            ctx.setLang((signal.payload && signal.payload.lang) || "ru");
          }
          ctx.refreshAll();
          break;

        case SIGNAL_TYPES.CARD_TYPE_CHANGE: {
          const ct = signal.payload && signal.payload.cardType;
          ctx.state.card_type = ct;
          ctx.state.quantity_id = null;
          ctx.state.law_id = null;
          if (ctx.els && ctx.els.cardType && ct) ctx.els.cardType.value = ct;
          ctx.refreshAll();
          break;
        }

        case SIGNAL_TYPES.FILTER_CHANGE:
        case SIGNAL_TYPES.SEARCH_CHANGE:
          ctx.refreshList();
          break;

        case SIGNAL_TYPES.LIST_SELECT: {
          const id = signal.payload && signal.payload.id;
          const ct = (signal.payload && signal.payload.cardType) || ctx.state.card_type;
          ctx.state.quantity_id = null;
          ctx.state.law_id = null;
          ctx.state[ctx.idField(ct)] = id;
          ctx.refreshList();
          break;
        }

        case SIGNAL_TYPES.SLOT_ACTION: {
          const inner = signal.payload;
          if (!inner || !inner.type) break;
          if (inner.type === "navigate") {
            const p = inner.payload || {};
            const cardType = p.cardType;
            const id = p.id;
            if (!cardType || !id) break;
            ctx.state.card_type = cardType;
            ctx.state.quantity_id = null;
            ctx.state.law_id = null;
            ctx.state[ctx.idField(cardType)] = id;
            if (ctx.els && ctx.els.cardType) ctx.els.cardType.value = cardType;
            if (ctx.els && ctx.els.search) ctx.els.search.value = "";
            ctx.refreshAll();
          } else if (inner.type === "external_link") {
            const p = inner.payload || {};
            if (p.href) window.open(p.href, p.target || "_self");
          } else if (inner.type === "custom") {
            window.dispatchEvent(
              new CustomEvent("fis-custom-action", { detail: inner.payload || {} })
            );
          }
          break;
        }

        default:
          break;
      }
    }

    return { dispatch: dispatch, TYPES: SIGNAL_TYPES };
  }

  global.FisSignals = {
    TYPES: SIGNAL_TYPES,
    createDispatcher: createDispatcher
  };
})(typeof window !== "undefined" ? window : globalThis);
