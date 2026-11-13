import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { normalizePath, type Plugin } from "vite";

/**
 * Rollup traverses Lucide's entire barrel (including its `icons` namespace)
 * before tree shaking. Rewrite named value imports to the exact ESM modules
 * re-exported by the installed package. No guessed name-to-filename mapping,
 * external dependency, placeholder icon or skipped application module.
 *
 * Runs after SWC/esbuild, so type-only imports are already erased. Namespace,
 * default, dynamic, side-effect and unknown imports keep their normal meaning.
 * Production source maps opt out rather than receive an incorrect mapping.
 */
export function directLucideImports(): Plugin {
  let root = "";
  let withSourceMaps = false;
  const targets = new Map<string, string>();

  return {
    name: "use-erp:direct-lucide-imports",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      root = config.root;
      withSourceMaps = Boolean(config.build.sourcemap);
    },
    buildStart() {
      targets.clear();
      const require = createRequire(path.join(root, "package.json"));
      const packageFile = require.resolve("lucide-react/package.json");
      const metadata: unknown = JSON.parse(readFileSync(packageFile, "utf8"));
      if (!metadata || typeof metadata !== "object" || !("module" in metadata) || typeof metadata.module !== "string") {
        this.error("lucide-react does not declare an ESM entry; refusing to guess icon modules");
      }
      const entry = path.resolve(path.dirname(packageFile), metadata.module);
      const ast = this.parse(readFileSync(entry, "utf8"));
      for (const node of ast.body) {
        if (node.type !== "ExportNamedDeclaration" || typeof node.source?.value !== "string") continue;
        const source = node.source.value;
        if (!source.startsWith("./")) continue;
        const target = normalizePath(path.resolve(path.dirname(entry), source));
        for (const specifier of node.specifiers) {
          if (specifier.local.type !== "Identifier" || specifier.local.name !== "default") continue;
          const exported = specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value;
          if (typeof exported === "string") targets.set(exported, target);
        }
      }
      if (!targets.size) this.error("No Lucide default re-exports found; refusing an empty optimization");
    },
    transform(code) {
      if (withSourceMaps || !code.includes("lucide-react")) return null;
      const ast = this.parse(code);
      const replacements: Array<{ start: number; end: number; code: string }> = [];
      for (const node of ast.body) {
        if (node.type !== "ImportDeclaration" || node.source.value !== "lucide-react" || !node.specifiers.length) continue;
        // Mixed/default/namespace forms are not rewritten. A namespace really
        // requests the full library, so reducing it would change the API.
        if (node.specifiers.some((specifier) => specifier.type !== "ImportSpecifier")) continue;
        const direct: string[] = [];
        const unchanged: string[] = [];
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") continue;
          const imported = specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
          const target = typeof imported === "string" ? targets.get(imported) : undefined;
          if (target) {
            direct.push(`import { default as ${specifier.local.name} } from ${JSON.stringify(target)};`);
          } else {
            const name = specifier.imported.type === "Identifier" ? specifier.imported.name : JSON.stringify(imported);
            unchanged.push(`${name} as ${specifier.local.name}`);
          }
        }
        if (!direct.length) continue;
        if (unchanged.length) direct.push(`import { ${unchanged.join(", ")} } from "lucide-react";`);
        // Rollup adds source offsets to ESTree nodes at runtime, but its
        // public ESTree type does not promise them. Validate, do not assert.
        if (!("start" in node) || typeof node.start !== "number" || !("end" in node) || typeof node.end !== "number" || node.start < 0 || node.end < node.start || node.end > code.length) {
          this.error("Rollup parser did not provide valid import offsets");
        }
        replacements.push({ start: node.start, end: node.end, code: direct.join("\n") });
      }
      if (!replacements.length) return null;
      let rewritten = code;
      for (const replacement of replacements.reverse()) {
        rewritten = rewritten.slice(0, replacement.start) + replacement.code + rewritten.slice(replacement.end);
      }
      return { code: rewritten, map: null };
    },
  };
}
