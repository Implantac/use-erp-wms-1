import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
// Import the public component modules, not Drei's entire re-export graph.
// This keeps the same implementations and declarations without loading every
// unrelated 3D helper into the app's typecheck and production build.
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { Grid } from "@react-three/drei/core/Grid";
import { Html } from "@react-three/drei/web/Html";
import { PerspectiveCamera } from "@react-three/drei/core/PerspectiveCamera";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Button } from "@/ui/base/button";
import { EmptyState } from "@/shared/components/EmptyState";
import { Box } from "lucide-react";

interface LocationRow {
  id: string;
  code: string;
  zone: string | null;
  aisle: string | null;
  rack: string | null;
  level: string | null;
  capacity: number | null;
  occupied: number | null;
  abc_class: string | null;
}
interface MovementRow {
  to_location: string | null;
}
interface Rec {
  location?: string;
  title: string;
  severity: string;
}

type Layer = "occupancy" | "congestion" | "abc" | "recommendations";

const LAYERS: { key: Layer; label: string; shortcut: string }[] = [
  { key: "occupancy", label: "Ocupação", shortcut: "1" },
  { key: "congestion", label: "Congestionamento", shortcut: "2" },
  { key: "abc", label: "Classe ABC", shortcut: "3" },
  { key: "recommendations", label: "Recomendações", shortcut: "4" },
];

function heatColor(pct: number) {
  if (pct >= 95) return new THREE.Color("#dc2626");
  if (pct >= 80) return new THREE.Color("#f59e0b");
  if (pct >= 50) return new THREE.Color("#10b981");
  if (pct > 0) return new THREE.Color("#3b82f6");
  return new THREE.Color("#1f2937");
}
function congestionColor(n: number) {
  if (n >= 30) return new THREE.Color("#dc2626");
  if (n >= 15) return new THREE.Color("#f59e0b");
  if (n >= 5) return new THREE.Color("#10b981");
  if (n > 0) return new THREE.Color("#3b82f6");
  return new THREE.Color("#1f2937");
}
function abcColor(c: string | null) {
  if (c === "A") return new THREE.Color("#facc15");
  if (c === "B") return new THREE.Color("#10b981");
  if (c === "C") return new THREE.Color("#3b82f6");
  return new THREE.Color("#1f2937");
}

interface CellData {
  loc: LocationRow;
  x: number;
  z: number;
  pct: number;
  movN: number;
  hasRec: boolean;
}

function Bins({
  cells,
  layer,
  onHover,
}: {
  cells: CellData[];
  layer: Layer;
  onHover: (c: CellData | null) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tmpObj = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    cells.forEach((c, i) => {
      const h = Math.max(0.15, (c.pct / 100) * 2.5 + 0.15);
      tmpObj.position.set(c.x, h / 2, c.z);
      tmpObj.scale.set(0.85, h, 0.85);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      let col: THREE.Color;
      if (layer === "occupancy") col = heatColor(c.pct);
      else if (layer === "congestion") col = congestionColor(c.movN);
      else if (layer === "abc") col = abcColor(c.loc.abc_class);
      else col = c.hasRec ? tmpColor.set("#dc2626") : tmpColor.set("#1f2937");
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cells, layer, tmpObj, tmpColor]);

  // Subtle pulse for recommendations
  useFrame(({ clock }) => {
    if (layer !== "recommendations" || !meshRef.current) return;
    const t = (Math.sin(clock.elapsedTime * 3) + 1) / 2;
    const mesh = meshRef.current;
    cells.forEach((c, i) => {
      if (!c.hasRec) return;
      const col = new THREE.Color().lerpColors(
        new THREE.Color("#7f1d1d"),
        new THREE.Color("#ef4444"),
        t,
      );
      mesh.setColorAt(i, col);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, cells.length]}
      castShadow
      receiveShadow
      onPointerMove={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        if (id != null) onHover(cells[id] ?? null);
      }}
      onPointerOut={() => onHover(null)}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.6} metalness={0.1} />
    </instancedMesh>
  );
}

export default function WarehouseMap3D() {
  const [locs, setLocs] = useState<LocationRow[]>([]);
  const [moves, setMoves] = useState<MovementRow[]>([]);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState<Layer>("occupancy");
  const [hover, setHover] = useState<CellData | null>(null);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 3600000).toISOString();
      const [{ data: l }, { data: m }, { data: r }] = await Promise.all([
        supabase
          .from("wms_storage_locations")
          .select("id, code, zone, aisle, rack, level, capacity, occupied, active, abc_class")
          .eq("active", true)
          .limit(2000),
        supabase
          .from("wms_movements")
          .select("to_location")
          .gte("created_at", since)
          .not("to_location", "is", null)
          .limit(5000),
        supabase
          .from("wms_recommendations")
          .select("title, severity, evidence")
          .eq("status", "open")
          .limit(200),
      ]);
      setLocs((l ?? []) as LocationRow[]);
      setMoves((m ?? []) as MovementRow[]);
      setRecs(
        ((r ?? []) as Array<{ title: string; severity: string; evidence: Record<string, unknown> | null }>).map((row) => ({
          title: row.title,
          severity: row.severity,
          location: (row.evidence?.location as string | undefined) ?? (row.evidence?.zone as string | undefined),
        })),
      );
      setLoading(false);
    })();
  }, []);

  const congestionByLoc = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of moves) if (m.to_location) c[m.to_location] = (c[m.to_location] ?? 0) + 1;
    return c;
  }, [moves]);

  const recsByLoc = useMemo(() => {
    const c: Record<string, Rec[]> = {};
    for (const r of recs) if (r.location) (c[r.location] ||= []).push(r);
    return c;
  }, [recs]);

  const cells = useMemo<CellData[]>(() => {
    if (locs.length === 0) return [];
    const aisles = [...new Set(locs.map((l) => l.aisle ?? "?"))].sort();
    const racks = [...new Set(locs.map((l) => l.rack ?? "?"))].sort();
    const aIdx: Record<string, number> = {};
    aisles.forEach((a, i) => (aIdx[a] = i));
    const rIdx: Record<string, number> = {};
    racks.forEach((r, i) => (rIdx[r] = i));
    const cx = aisles.length / 2;
    const cz = racks.length / 2;
    return locs.map((loc) => {
      const pct =
        loc.capacity && loc.capacity > 0
          ? Math.min(100, ((loc.occupied ?? 0) / loc.capacity) * 100)
          : 0;
      return {
        loc,
        x: (aIdx[loc.aisle ?? "?"] ?? 0) - cx,
        z: (rIdx[loc.rack ?? "?"] ?? 0) - cz,
        pct,
        movN: congestionByLoc[loc.code] ?? 0,
        hasRec: !!recsByLoc[loc.code]?.length,
      };
    });
  }, [locs, congestionByLoc, recsByLoc]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    const map: Record<string, Layer> = { "1": "occupancy", "2": "congestion", "3": "abc", "4": "recommendations" };
    if (map[e.key]) setLayer(map[e.key]);
  }, []);
  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">Carregando Digital Twin 3D…</CardContent>
      </Card>
    );
  }
  if (cells.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Box}
            title="Nenhum endereço para renderizar"
            description="Cadastre endereços de armazenagem para visualizar o Digital Twin 3D."
          />
        </CardContent>
      </Card>
    );
  }

  const size = Math.max(20, Math.sqrt(cells.length) * 1.5);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Digital Twin 3D — Armazém</CardTitle>
            <p className="text-xs text-muted-foreground">
              Altura = ocupação · Cor = camada ativa · Arraste para girar · scroll para zoom · 1–4 alterna camadas.
            </p>
          </div>
          <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Camadas 3D">
            {LAYERS.map((lyr) => (
              <Button
                key={lyr.key}
                size="sm"
                variant={layer === lyr.key ? "default" : "outline"}
                role="tab"
                aria-selected={layer === lyr.key}
                aria-label={`Camada ${lyr.label}, atalho ${lyr.shortcut}`}
                onClick={() => setLayer(lyr.key)}
              >
                <span className="text-[10px] opacity-60 mr-1">{lyr.shortcut}</span>
                {lyr.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative h-[560px] rounded-md overflow-hidden border bg-slate-950">
          <Canvas shadows dpr={[1, 2]}>
            <PerspectiveCamera makeDefault position={[size * 0.9, size * 0.9, size * 0.9]} fov={45} />
            <OrbitControls enableDamping makeDefault target={[0, 0, 0]} />
            <ambientLight intensity={0.45} />
            <directionalLight
              position={[size, size * 1.5, size]}
              intensity={1.1}
              castShadow
              shadow-mapSize={[1024, 1024]}
            />
            <Grid
              args={[size * 2, size * 2]}
              cellSize={1}
              cellThickness={0.5}
              cellColor="#1e293b"
              sectionSize={5}
              sectionThickness={1}
              sectionColor="#334155"
              fadeDistance={size * 2}
              infiniteGrid={false}
              position={[0, 0, 0]}
            />
            <Suspense fallback={null}>
              <Bins cells={cells} layer={layer} onHover={setHover} />
            </Suspense>
            {hover && (
              <Html
                position={[hover.x, Math.max(0.5, (hover.pct / 100) * 2.5) + 0.6, hover.z]}
                center
                distanceFactor={size * 0.4}
                style={{ pointerEvents: "none" }}
              >
                <div className="rounded-md bg-slate-900/95 border border-slate-700 px-2 py-1 text-[11px] text-white whitespace-nowrap shadow-lg">
                  <strong>{hover.loc.code}</strong> · {hover.pct.toFixed(0)}% · {hover.movN} mov/h
                  {hover.hasRec ? " · ⚠" : ""}
                </div>
              </Html>
            )}
          </Canvas>
        </div>
        {hover && (
          <div className="mt-3 text-sm" role="status" aria-live="polite">
            <strong>{hover.loc.code}</strong> — Zona {hover.loc.zone ?? "—"} · Classe{" "}
            {hover.loc.abc_class ?? "—"} · Ocupado {hover.loc.occupied ?? 0}/{hover.loc.capacity ?? 0} ·{" "}
            {hover.movN} mov/h
            {hover.hasRec ? ` · ${recsByLoc[hover.loc.code].length} recomendação(ões)` : ""}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
