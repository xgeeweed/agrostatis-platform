import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getVineyardBlocks, getHexagonsByBlock, getHexObservations } from "@/lib/api";

const PARAMETERS = [
  { value: "pH", label: "pH", unit: "pH" },
  { value: "N_ppm", label: "Nitrogen", unit: "ppm" },
  { value: "P_ppm", label: "Phosphorus", unit: "ppm" },
  { value: "K_ppm", label: "Potassium", unit: "ppm" },
  { value: "organic_matter_pct", label: "Organic Matter", unit: "%" },
  { value: "NDVI", label: "NDVI", unit: "" },
];

export default function HexAnalyticsPage() {
  const [selectedBlock, setSelectedBlock] = useState<string>("");
  const [selectedParam, setSelectedParam] = useState("pH");

  const { data: blocks } = useQuery({
    queryKey: ["vineyard-blocks"],
    queryFn: getVineyardBlocks,
  });

  const { data: hexagons } = useQuery({
    queryKey: ["hexagons", selectedBlock],
    queryFn: () => getHexagonsByBlock(selectedBlock),
    enabled: !!selectedBlock,
  });

  const { data: hexObs } = useQuery({
    queryKey: ["hex-observations", selectedBlock, selectedParam],
    queryFn: () =>
      getHexObservations({
        ...(selectedBlock ? { blockId: selectedBlock } : {}),
        parameter: selectedParam,
      }),
    enabled: !!selectedParam,
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">H3 Hex Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Spatial analysis of soil parameters aggregated by H3 hexagonal cells (~25m resolution)
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Vineyard Block</label>
          <select
            value={selectedBlock}
            onChange={(e) => setSelectedBlock(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm min-w-[200px]"
          >
            <option value="">All blocks</option>
            {blocks?.map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.h3_cell_count ?? 0} hexes)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Parameter</label>
          <select
            value={selectedParam}
            onChange={(e) => setSelectedParam(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm min-w-[200px]"
          >
            {PARAMETERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} {p.unit ? `(${p.unit})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Hex grid overview */}
        <div className="border rounded-xl">
          <div className="px-5 py-3 bg-muted/50 border-b">
            <h2 className="text-sm font-semibold">
              H3 Grid {selectedBlock ? "" : "(All Blocks)"}
              {hexagons ? ` — ${hexagons.length} cells` : ""}
            </h2>
          </div>

          {!selectedBlock && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Select a vineyard block to view its H3 hexagonal grid
            </div>
          )}

          {selectedBlock && hexagons && hexagons.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No hexagons generated for this block. Go to Vineyard Blocks and click "Gen H3".
            </div>
          )}

          {hexagons && hexagons.length > 0 && (
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <MiniStat
                  label="Total Cells"
                  value={String(hexagons.length)}
                />
                <MiniStat
                  label="Resolution"
                  value={`H3 Res ${hexagons[0]?.h3_resolution ?? 11}`}
                />
              </div>
              <div className="border rounded-lg divide-y max-h-80 overflow-auto">
                {hexagons.map((h: any) => (
                  <div key={h.id} className="px-3 py-2 text-xs flex items-center justify-between hover:bg-muted/30">
                    <div>
                      <p className="font-mono text-[10px] text-muted-foreground">{h.h3_index}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {h.lat ? `${Number(h.lat).toFixed(5)}, ${Number(h.lng).toFixed(5)}` : "—"}
                      </p>
                    </div>
                    <div className="text-right text-muted-foreground">
                      {h.elevation_m && <span className="block">↑ {Number(h.elevation_m).toFixed(0)}m</span>}
                      {h.slope_deg && <span className="block">∠ {Number(h.slope_deg).toFixed(1)}°</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Observations by hex */}
        <div className="border rounded-xl">
          <div className="px-5 py-3 bg-muted/50 border-b">
            <h2 className="text-sm font-semibold">
              {PARAMETERS.find((p) => p.value === selectedParam)?.label ?? selectedParam} by Hex
            </h2>
          </div>

          {(!hexObs || hexObs.length === 0) && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No observations for this parameter yet. Add observations on the Observations page.
            </div>
          )}

          {hexObs && hexObs.length > 0 && (
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <MiniStat label="Hexes with Data" value={String(hexObs.length)} />
                <MiniStat
                  label="Avg Value"
                  value={`${(hexObs.reduce((s: number, h: any) => s + Number(h.avg_value), 0) / hexObs.length).toFixed(2)}`}
                />
                <MiniStat
                  label="Total Obs"
                  value={String(hexObs.reduce((s: number, h: any) => s + Number(h.obs_count), 0))}
                />
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">H3 Index</th>
                      <th className="px-3 py-2 text-right font-medium">Avg</th>
                      <th className="px-3 py-2 text-right font-medium">Min</th>
                      <th className="px-3 py-2 text-right font-medium">Max</th>
                      <th className="px-3 py-2 text-right font-medium">Obs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {hexObs.map((h: any) => (
                      <tr key={h.h3_index} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{h.h3_index}</td>
                        <td className="px-3 py-2 text-right font-semibold">{Number(h.avg_value).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{Number(h.min_value).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{Number(h.max_value).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{h.obs_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}
