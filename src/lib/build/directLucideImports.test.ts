// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst } from "rollup/parseAst";
import { build, type Plugin } from "vite";
import { describe, expect, it } from "vitest";
import { directLucideImports } from "../../../scripts/vite-direct-lucide-imports";

const project = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const icon = (name: string) => path.join(project, "node_modules/lucide-react/dist/esm/icons", name).replace(/\\/g, "/");

function invoke(hook: unknown, context: object, args: unknown[]) {
  if (typeof hook !== "function") throw new Error("Expected a function hook in the plugin under test");
  return Reflect.apply(hook, context, args);
}

function prepared(sourceMaps = false) {
  const plugin = directLucideImports();
  const context = {
    parse: parseAst,
    error(message: string) { throw new Error(message); },
  };
  invoke(plugin.configResolved, context, [{ root: project, build: { sourcemap: sourceMaps } }]);
  invoke(plugin.buildStart, context, []);
  return {
    plugin,
    context,
    transform(code: string) {
      const result: unknown = invoke(plugin.transform, context, [code, "/fixture.js"]);
      if (result === null) return null;
      if (!result || typeof result !== "object" || !("code" in result) || typeof result.code !== "string") throw new Error("Invalid transform result");
      return result.code;
    },
  };
}

describe("direct Lucide build imports", () => {
  it("retains exactly the installed re-export target and the local binding", () => {
    const code = prepared().transform('import { Plus as Add, Pencil } from "lucide-react"; export { Add, Pencil };');
    expect(code).toBe(`import { default as Add } from ${JSON.stringify(icon("plus.js"))};\nimport { default as Pencil } from ${JSON.stringify(icon("pencil.js"))}; export { Add, Pencil };`);
  });

  it("uses the package's alias mapping instead of guessing a filename", () => {
    const code = prepared().transform('import { ArrowUpAZ, AlarmCheck } from "lucide-react";');
    expect(code).toContain(JSON.stringify(icon("arrow-up-a-z.js")));
    expect(code).toContain(JSON.stringify(icon("alarm-clock-check.js")));
  });

  it("preserves Unicode and offsets across multiple import declarations", () => {
    const code = 'const text = "Ação 🧶";\nimport { Plus } from "lucide-react";\nimport { X as Close } from "lucide-react";\nconsole.log(text, Plus, Close);';
    const rewritten = prepared().transform(code);
    expect(rewritten).toContain('const text = "Ação 🧶";');
    expect(rewritten).toContain('console.log(text, Plus, Close);');
    expect(rewritten).toContain(`default as Plus } from ${JSON.stringify(icon("plus.js"))}`);
    expect(rewritten).toContain(`default as Close } from ${JSON.stringify(icon("x.js"))}`);
    expect(() => parseAst(rewritten!)).not.toThrow();
  });

  it("keeps namespace/default imports untouched, including mixed forms", () => {
    for (const code of [
      'import * as Icons from "lucide-react";',
      'import Default from "lucide-react";',
      'import Default, { Plus } from "lucide-react";',
    ]) expect(prepared().transform(code)).toBeNull();
  });

  it("does not invent exports or replace an intentional full-library namespace", () => {
    expect(prepared().transform('import { NotAnInstalledIcon } from "lucide-react";')).toBeNull();
    const code = prepared().transform('import { Plus, icons as allIcons } from "lucide-react";');
    expect(code).toContain(`default as Plus } from ${JSON.stringify(icon("plus.js"))}`);
    expect(code).toContain('import { icons as allIcons } from "lucide-react";');
  });

  it("leaves dynamic imports, side effects and re-exports unchanged", () => {
    for (const code of [
      'import "lucide-react";',
      'const icons = import("lucide-react");',
      'export { Plus } from "lucide-react";',
      'const label = "lucide-react";',
    ]) expect(prepared().transform(code)).toBeNull();
  });

  it("opts out for requested source maps rather than returning an incorrect map", () => {
    expect(prepared(true).transform('import { Plus } from "lucide-react";')).toBeNull();
  });

  it("refuses missing parser offsets rather than corrupting the module", () => {
    const p = prepared();
    const context = {
      ...p.context,
      parse(code: string) {
        const ast = parseAst(code);
        return { ...ast, body: ast.body.map((node) => ({ ...node, start: undefined, end: undefined })) };
      },
    };
    expect(() => invoke(p.plugin.transform, context, ['import { Plus } from "lucide-react";', "/fixture.js"]))
      .toThrow("valid import offsets");
  });

  it("runs only for production builds and does not invent application externals", () => {
    const p = directLucideImports();
    expect(p.apply).toBe("build");
    expect(p.enforce).toBe("post");
    expect(p).not.toHaveProperty("resolveId");
    expect(p).not.toHaveProperty("load");
  });

  it("Drei imports are the exact modules re-exported by its installed barrel", () => {
    const source = readFileSync(path.join(project, "src/modules/wms/twin/WarehouseMap3D.tsx"), "utf8");
    const barrel = readFileSync(path.join(project, "node_modules/@react-three/drei/index.js"), "utf8");
    for (const [name, module] of [
      ["OrbitControls", "core/OrbitControls"],
      ["Grid", "core/Grid"],
      ["Html", "web/Html"],
      ["PerspectiveCamera", "core/PerspectiveCamera"],
    ]) {
      expect(source).toContain(`import { ${name} } from "@react-three/drei/${module}";`);
      expect(barrel).toContain(`export { ${name} } from './${module}.js';`);
    }
    expect(source).not.toMatch(/from ["']@react-three\/drei["']/);
  });

  it("a real Vite bundle includes the requested icon but not the full Lucide barrel", async () => {
    const loaded: string[] = [];
    const entry = "\0direct-lucide-test-entry";
    const fixture: Plugin = {
      name: "direct-lucide-test-fixture",
      resolveId(id) { if (id === entry) return entry; },
      load(id) { if (id === entry) return 'import { Plus } from "lucide-react"; export const Icon = Plus;'; },
      generateBundle(_options, bundle) {
        for (const value of Object.values(bundle)) {
          if (value.type === "chunk") loaded.push(...Object.keys(value.modules));
        }
      },
    };
    await build({
      root: project,
      configFile: false,
      logLevel: "silent",
      plugins: [fixture, directLucideImports()],
      build: {
        write: false,
        minify: false,
        reportCompressedSize: false,
        rollupOptions: { input: entry, external: ["react"], output: { format: "es" } },
      },
    });
    expect(loaded.some((id) => id.endsWith("/lucide-react/dist/esm/icons/plus.js"))).toBe(true);
    expect(loaded.some((id) => id.endsWith("/lucide-react/dist/esm/lucide-react.js"))).toBe(false);
    expect(loaded.some((id) => id.endsWith("/lucide-react/dist/esm/icons/index.js"))).toBe(false);
    expect(loaded.filter((id) => /\/lucide-react\/dist\/esm\/icons\//.test(id))).toHaveLength(1);
  });
});
