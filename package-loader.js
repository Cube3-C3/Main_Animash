/* IHub remote package loader.
 * Infrastructure only: it does not render, mutate platform state, or dispatch
 * platform signals. The host window decides how to consume the loaded package.
 */
(function (global) {
  "use strict";

  const DEFAULT_BASE =
    "https://raw.githubusercontent.com/Cube3-C3/Packages/main/Fis_data/";

  const DEFAULT_FILES = {
    ast: "AST.json",
    cards: "card_manifests.json",
    domains: "domains.json",
    filterOntology: "filter_ontology.json",
    formulas: "physi_formulas.json",
    quantities: "physi_quant.json",
    presentation: "presentation_ontology.json",
    units: "units.json",
    usages: "usages.json"
  };

  const cache = new Map();

  function normalizeBase(base) {
    return String(base || DEFAULT_BASE).replace(/\/+$/, "") + "/";
  }

  async function loadJson(base, file, options) {
    const url = normalizeBase(base) + file;
    const useCache = !(options && options.cache === false);

    if (useCache && cache.has(url)) return cache.get(url);

    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error("Package file unavailable: " + response.status + " " + url);
    }

    const value = await response.json();
    if (useCache) cache.set(url, value);
    return value;
  }

  async function loadPackage(options) {
    options = options || {};
    const base = normalizeBase(options.base || DEFAULT_BASE);
    const files = Object.assign({}, DEFAULT_FILES, options.files || {});
    const names = options.names || Object.keys(files);

    const entries = await Promise.all(
      names.map(async function (name) {
        const file = files[name] || name;
        return [name, await loadJson(base, file, options)];
      })
    );

    return {
      base: base,
      files: Object.fromEntries(entries)
    };
  }

  function clearCache() {
    cache.clear();
  }

  global.IHubPackageLoader = {
    DEFAULT_BASE: DEFAULT_BASE,
    DEFAULT_FILES: Object.assign({}, DEFAULT_FILES),
    loadJson: loadJson,
    loadPackage: loadPackage,
    clearCache: clearCache
  };
})(window);
