/**
 * Style registry — платформенные style_kind токены → CSS-классы.
 * Пакет ссылается только на id (symbol, title, chip.math…), не на hex/inline.
 */
(function (global) {
  "use strict";

  const STYLE_KINDS = Object.freeze({
    symbol: {
      label: ["Symbol token", "Символ"],
      css: "pres-symbol"
    },
    title: {
      label: ["Title / name", "Имя"],
      css: "pres-title"
    },
    muted: {
      label: ["Secondary text", "Вторичный текст"],
      css: "pres-muted"
    },
    algebra: {
      label: ["Formula algebra", "Алгебра"],
      css: "pres-algebra"
    },
    block: {
      label: ["Structured block", "Блок"],
      css: "pres-block"
    },
    chip: {
      label: ["Facet chip", "Плашка"],
      css: "chip",
      variants: Object.freeze({
        default: { css: "chip" },
        math: { css: "chip math" },
        dim: { css: "chip dim" },
        cat: { css: "chip cat" },
        inv: { css: "chip inv" },
        status: { css: "chip status" },
        type: { css: "chip type" }
      })
    }
  });

  function cssFor(styleId, variant) {
    const sk = STYLE_KINDS[styleId];
    if (!sk) return "pres-muted";
    if (styleId === "chip" && sk.variants) {
      const v = sk.variants[variant] || sk.variants.default || {};
      return v.css || sk.css || "chip";
    }
    return sk.css || "pres-muted";
  }

  function listKinds() {
    return Object.keys(STYLE_KINDS);
  }

  global.FisStyleRegistry = {
    kinds: STYLE_KINDS,
    cssFor: cssFor,
    listKinds: listKinds
  };
})(typeof window !== "undefined" ? window : globalThis);
