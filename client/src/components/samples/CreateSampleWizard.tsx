import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import gsap from "gsap";
import {
  createSample, getBlockAtPoint, getNextSampleCode, getFarms,
  getVineyardBlocks, getCampaigns, addSampleToCampaign, getCommunes,
} from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import SampleLocationMap from "./SampleLocationMap";
import { SampleQRDisplay } from "./SampleQRCode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MapPin, ChevronRight, ChevronLeft, Check, Building2, Hexagon,
  Target, X, FlaskConical, Grape, Search,
} from "lucide-react";

interface CreateSampleWizardProps {
  open: boolean;
  onClose: () => void;
}

type WizardStep = 1 | 2 | 3 | 4;

const SOIL_CONDITIONS = ["dry", "moist", "wet", "saturated", "frozen", "rocky", "compacted"];
const WEATHER_OPTIONS = ["sunny", "partly_cloudy", "overcast", "light_rain", "heavy_rain", "post_rain", "windy", "frost"];

const STEP_LABELS = ["Location", "Context", "Details", "Complete"];

export default function CreateSampleWizard({ open, onClose }: CreateSampleWizardProps) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [step, setStep] = useState<WizardStep>(1);
  const stepRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  const [location, setLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [detectedBlock, setDetectedBlock] = useState<any>(null);
  const [detectedError, setDetectedError] = useState("");
  const [sampleCode, setSampleCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mapFlyTo, setMapFlyTo] = useState<[number, number] | undefined>();
  const [formData, setFormData] = useState({
    farmId: "", blockId: "", campaignId: "",
    depthCm: "30", soilCondition: "", weather: "",
    collectedBy: user?.name || "", collectedAt: new Date().toISOString().slice(0, 16),
    labName: "", labReference: "", notes: "",
  });
  const [createdSample, setCreatedSample] = useState<any>(null);

  const { data: farms } = useQuery({ queryKey: ["farms"], queryFn: getFarms, enabled: open });
  const { data: blocks } = useQuery({ queryKey: ["vineyard-blocks"], queryFn: () => getVineyardBlocks(), enabled: open });
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: () => getCampaigns(), enabled: open });
  const { data: communes } = useQuery({ queryKey: ["communes"], queryFn: getCommunes, enabled: open });

  const handleLocationSelect = useCallback(async (lng: number, lat: number) => {
    setLocation({ lng, lat });
    setDetectedError("");
    try {
      const block = await getBlockAtPoint(lng, lat);
      setDetectedBlock(block);
      setFormData(f => ({ ...f, blockId: block.id, farmId: block.farm_id || "" }));
      const codeResult = await getNextSampleCode(block.id);
      setSampleCode(codeResult.code);
    } catch {
      setDetectedBlock(null);
      setDetectedError("No vineyard block at this location. Click inside a block boundary (orange outline).");
    }
  }, []);

  useEffect(() => {
    if (formData.blockId && step === 2) {
      getNextSampleCode(formData.blockId).then(r => setSampleCode(r.code)).catch(() => {});
    }
  }, [formData.blockId, step]);

  // Animate step content
  useEffect(() => {
    if (stepRef.current) {
      gsap.fromTo(stepRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }
      );
    }
  }, [step]);

  // Animate step indicator
  useEffect(() => {
    if (indicatorRef.current) {
      const dots = indicatorRef.current.querySelectorAll(".step-dot");
      const lines = indicatorRef.current.querySelectorAll(".step-line");
      dots.forEach((dot, i) => {
        gsap.to(dot, {
          scale: i + 1 === step ? 1.15 : 1,
          duration: 0.3, ease: "back.out(2)",
        });
      });
      lines.forEach((line, i) => {
        gsap.to(line, {
          scaleX: i + 1 < step ? 1 : 0,
          duration: 0.4, ease: "power2.out", delay: 0.1,
        });
      });
    }
  }, [step]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        sampleCode, vineyardBlockId: formData.blockId,
        campaignId: formData.campaignId || undefined,
        lng: location?.lng, lat: location?.lat,
        depthCm: Number(formData.depthCm), sampleType: "soil",
        collectedBy: formData.collectedBy,
        collectedAt: formData.collectedAt || undefined,
        labName: formData.labName || undefined,
        labReference: formData.labReference || undefined,
      };
      return formData.campaignId
        ? addSampleToCampaign(formData.campaignId, payload)
        : createSample(payload);
    },
    onSuccess: (data) => {
      setCreatedSample({
        ...data, sampleCode,
        farmName: detectedBlock?.farm_name || farms?.find((f: any) => f.id === formData.farmId)?.name,
        blockName: detectedBlock?.name || blocks?.find((b: any) => b.id === formData.blockId)?.name,
        h3Index: data.h3_index || detectedBlock?.h3_index,
      });
      qc.invalidateQueries({ queryKey: ["samples"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setStep(4);
    },
  });

  const goNext = () => setStep(s => Math.min(s + 1, 4) as WizardStep);
  const goBack = () => setStep(s => Math.max(s - 1, 1) as WizardStep);

  const handleReset = () => {
    setStep(1); setLocation(null); setDetectedBlock(null); setDetectedError("");
    setSampleCode(""); setCreatedSample(null); setSearchQuery(""); setMapFlyTo(undefined);
    setFormData({ farmId: "", blockId: "", campaignId: "", depthCm: "30", soilCondition: "", weather: "",
      collectedBy: user?.name || "", collectedAt: new Date().toISOString().slice(0, 16),
      labName: "", labReference: "", notes: "" });
  };

  if (!open) return null;

  const filteredBlocks = blocks?.filter((b: any) => !formData.farmId || b.farm_id === formData.farmId);
  const filteredCampaigns = campaigns?.filter((c: any) =>
    (!formData.blockId || c.vineyard_block_id === formData.blockId) && ["planned", "in_progress"].includes(c.status));
  const filteredCommunes = communes?.filter((c: any) => c.commune_name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">

        {/* ─── Header ─── */}
        <div className="px-6 pt-5 pb-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Create Soil Sample</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{STEP_LABELS[step - 1]}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* ─── Step Indicator (animated) ─── */}
          <div ref={indicatorRef} className="flex items-center justify-center gap-0">
            {[1, 2, 3, 4].map((s, idx) => (
              <div key={s} className="flex items-center">
                {/* Dot */}
                <div className="step-dot relative flex items-center justify-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                    s < step ? "bg-primary text-white shadow-md shadow-primary/30" :
                    s === step ? "bg-primary text-white shadow-lg shadow-primary/40 ring-[3px] ring-primary/20" :
                    "bg-muted/80 text-muted-foreground"
                  }`}>
                    {s < step ? <Check className="w-4.5 h-4.5" strokeWidth={3} /> : s}
                  </div>
                  {/* Step label below dot */}
                  <span className={`absolute -bottom-5 text-[9px] font-medium whitespace-nowrap transition-colors duration-300 ${
                    s <= step ? "text-primary" : "text-muted-foreground/60"
                  }`}>
                    {STEP_LABELS[idx]}
                  </span>
                </div>

                {/* Connecting line */}
                {idx < 3 && (
                  <div className="w-14 h-[2px] bg-muted/60 mx-1 relative overflow-hidden rounded-full">
                    <div className="step-line absolute inset-0 bg-primary origin-left" style={{ transform: `scaleX(${s < step ? 1 : 0})` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="h-5" /> {/* Space for labels */}
        </div>

        {/* ─── Step Content ─── */}
        <div ref={stepRef} className="flex-1 overflow-auto">

          {/* STEP 1: Location */}
          {step === 1 && (
            <div className="p-6 space-y-4">
              {/* Search bar for commune navigation */}
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search commune to navigate..." className="pl-9 h-9 text-sm" />
                </div>
              </div>
              {searchQuery && filteredCommunes && filteredCommunes.length > 0 && (
                <div className="border rounded-lg max-h-32 overflow-auto divide-y bg-white shadow-sm">
                  {filteredCommunes.slice(0, 8).map((c: any) => (
                    <button key={c.commune_name} className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors"
                      onClick={async () => {
                        setSearchQuery("");
                        try {
                          const res = await fetch(`/api/parcels?commune=${encodeURIComponent(c.commune_name)}&limit=1`, { credentials: "include" });
                          const data = await res.json();
                          if (data.length && data[0].lng && data[0].lat) {
                            setMapFlyTo([data[0].lng, data[0].lat]);
                          }
                        } catch {}
                      }}>
                      <span className="font-medium">{c.commune_name}</span>
                      <span className="text-muted-foreground ml-1">({c.parcel_count} parcels)</span>
                    </button>
                  ))}
                </div>
              )}

              <p className="text-sm text-muted-foreground">Click on the map to select the sample collection point.</p>
              <SampleLocationMap onLocationSelect={handleLocationSelect}
                selectedLng={location?.lng} selectedLat={location?.lat}
                flyToCenter={mapFlyTo} height={320} />

              {/* Location result card */}
              {location && (
                <div className={`rounded-xl p-4 border transition-all duration-300 ${
                  detectedBlock ? "bg-green-50/50 border-green-200" : detectedError ? "bg-amber-50/50 border-amber-200" : "bg-muted/30"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        detectedBlock ? "bg-green-100" : "bg-amber-100"
                      }`}>
                        <MapPin className={`w-5 h-5 ${detectedBlock ? "text-green-600" : "text-amber-600"}`} />
                      </div>
                      <div>
                        <p className="text-sm font-mono font-medium">
                          {location.lat.toFixed(6)}°N, {location.lng.toFixed(6)}°E
                        </p>
                        {detectedBlock && (
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                            <Building2 className="w-3 h-3" /> {detectedBlock.farm_name}
                            <span className="text-muted-foreground/50">→</span>
                            <Hexagon className="w-3 h-3" /> {detectedBlock.name}
                            <span className="font-mono text-[10px] text-muted-foreground/50 ml-1">({detectedBlock.h3_index?.slice(-8)})</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {detectedBlock && <Badge variant="success" className="shrink-0">Block Detected</Badge>}
                  </div>
                </div>
              )}
              {detectedError && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs flex items-start gap-2">
                  <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{detectedError}</span>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Context */}
          {step === 2 && (
            <div className="p-6 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Farm</label>
                  <select value={formData.farmId} onChange={e => setFormData(f => ({ ...f, farmId: e.target.value, blockId: "" }))}
                    className="mt-1.5 w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
                    <option value="">All farms</option>
                    {farms?.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Block *</label>
                  <select value={formData.blockId} onChange={e => setFormData(f => ({ ...f, blockId: e.target.value }))}
                    required className="mt-1.5 w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
                    <option value="">Select block</option>
                    {filteredBlocks?.map((b: any) => (
                      <option key={b.id} value={b.id}>{b.farm_name ? `${b.farm_name} → ` : ""}{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campaign</label>
                  <select value={formData.campaignId} onChange={e => setFormData(f => ({ ...f, campaignId: e.target.value }))}
                    className="mt-1.5 w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
                    <option value="">Standalone (no campaign)</option>
                    {filteredCampaigns?.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sample Code</label>
                  <Input value={sampleCode} onChange={e => setSampleCode(e.target.value)}
                    className="mt-1.5 font-mono h-[42px] rounded-xl" />
                </div>
              </div>

              {formData.blockId && detectedBlock && (
                <div className="bg-gradient-to-r from-orange-50 to-amber-50/30 border border-orange-100 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Hexagon className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-orange-900">{detectedBlock.name}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-0.5">
                        {detectedBlock.variety && <span className="flex items-center gap-1"><Grape className="w-3 h-3" />{detectedBlock.variety}</span>}
                        {detectedBlock.h3_cell_count && <span>{detectedBlock.h3_cell_count} hex cells</span>}
                        {detectedBlock.h3_index && <span className="font-mono text-[10px]">H3: ...{detectedBlock.h3_index?.slice(-8)}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Collection Details */}
          {step === 3 && (
            <div className="p-6 space-y-5">
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Depth (cm) *</label>
                  <Input type="number" value={formData.depthCm} onChange={e => setFormData(f => ({ ...f, depthCm: e.target.value }))}
                    className="mt-1.5 h-[42px] rounded-xl" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Soil Condition</label>
                  <select value={formData.soilCondition} onChange={e => setFormData(f => ({ ...f, soilCondition: e.target.value }))}
                    className="mt-1.5 w-full border rounded-xl px-3 py-2.5 text-sm bg-white">
                    <option value="">Select</option>
                    {SOIL_CONDITIONS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Weather</label>
                  <select value={formData.weather} onChange={e => setFormData(f => ({ ...f, weather: e.target.value }))}
                    className="mt-1.5 w-full border rounded-xl px-3 py-2.5 text-sm bg-white">
                    <option value="">Select</option>
                    {WEATHER_OPTIONS.map(w => <option key={w} value={w}>{w.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Collected By</label>
                  <Input value={formData.collectedBy} onChange={e => setFormData(f => ({ ...f, collectedBy: e.target.value }))}
                    className="mt-1.5 h-[42px] rounded-xl" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Collected At</label>
                  <Input type="datetime-local" value={formData.collectedAt} onChange={e => setFormData(f => ({ ...f, collectedAt: e.target.value }))}
                    className="mt-1.5 h-[42px] rounded-xl" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sample Type</label>
                  <select className="mt-1.5 w-full border rounded-xl px-3 py-2.5 text-sm bg-white">
                    <option value="soil">Soil</option><option value="sap">Sap</option>
                    <option value="tissue">Tissue</option><option value="water">Water</option>
                  </select>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Lab Information</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">Lab Name</label>
                    <Input value={formData.labName} onChange={e => setFormData(f => ({ ...f, labName: e.target.value }))}
                      className="mt-1 h-[42px] rounded-xl" placeholder="Sol-Conseil SA" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Lab Reference</label>
                    <Input value={formData.labReference} onChange={e => setFormData(f => ({ ...f, labReference: e.target.value }))}
                      className="mt-1 h-[42px] rounded-xl" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</label>
                <textarea value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                  className="mt-1.5 w-full border rounded-xl px-3 py-2.5 text-sm min-h-[70px] focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="Field observations, soil color, moisture level..." />
              </div>

              {createMutation.isError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs">
                  {(createMutation.error as Error).message}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Confirmation */}
          {step === 4 && createdSample && (
            <div className="p-8 flex flex-col items-center text-center space-y-5">
              {/* Animated success */}
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </div>
              <div>
                <h3 className="text-2xl font-bold tracking-tight">{createdSample.sampleCode}</h3>
                <p className="text-sm text-muted-foreground mt-1">Sample created successfully</p>
                {createdSample.farmName && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {createdSample.farmName} → {createdSample.blockName}
                  </p>
                )}
              </div>
              <SampleQRDisplay
                sampleCode={createdSample.sampleCode} sampleId={createdSample.id}
                farmName={createdSample.farmName} blockName={createdSample.blockName}
                date={new Date().toISOString().split("T")[0]}
                depth={`${formData.depthCm}cm`} h3Index={createdSample.h3Index}
                size={150}
              />
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={handleReset}>Create Another</Button>
                <Button onClick={onClose}>Done</Button>
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer Navigation ─── */}
        {step < 4 && (
          <div className="px-6 py-4 border-t bg-muted/10 flex items-center justify-between">
            <Button variant="ghost" onClick={step === 1 ? onClose : goBack} className="text-muted-foreground">
              {step === 1 ? "Cancel" : <><ChevronLeft className="w-4 h-4" /> Back</>}
            </Button>
            {step < 3 ? (
              <Button onClick={goNext} disabled={step === 1 && !location} className="min-w-[120px]">
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={() => createMutation.mutate()}
                disabled={!formData.blockId || !sampleCode || createMutation.isPending}
                className="min-w-[160px]">
                {createMutation.isPending ? "Creating..." : <><FlaskConical className="w-4 h-4" /> Create Sample</>}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
