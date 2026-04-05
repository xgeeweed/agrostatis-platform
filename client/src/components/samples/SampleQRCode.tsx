import { QRCodeSVG } from "qrcode.react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface SampleQRProps {
  sampleCode: string;
  sampleId?: string;
  farmName?: string;
  blockName?: string;
  date?: string;
  depth?: string;
  h3Index?: string;
  size?: number;
}

export function SampleQRDisplay({ sampleCode, sampleId, farmName, blockName, date, depth, h3Index, size = 140 }: SampleQRProps) {
  const qrData = JSON.stringify({
    id: sampleId,
    code: sampleCode,
    farm: farmName,
    block: blockName,
    date,
    depth,
    h3: h3Index,
  });

  const handlePrintLabel = () => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [50, 25],
    });

    // QR code as data URL
    const svgEl = document.getElementById("sample-qr-svg");
    if (svgEl) {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        ctx?.drawImage(img, 0, 0, 200, 200);
        const imgData = canvas.toDataURL("image/png");

        doc.addImage(imgData, "PNG", 1, 1, 15, 15);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text(sampleCode, 18, 5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5);
        if (farmName) doc.text(farmName, 18, 8);
        if (blockName) doc.text(blockName, 18, 11);
        if (date) doc.text(date, 18, 14);
        if (depth) doc.text(`Depth: ${depth}`, 18, 17);
        if (h3Index) doc.text(h3Index, 18, 20);

        doc.save(`label-${sampleCode}.pdf`);
      };
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white p-3 rounded-lg border shadow-sm">
        <QRCodeSVG id="sample-qr-svg" value={qrData} size={size} level="M"
          bgColor="white" fgColor="#0f172a" />
      </div>
      <p className="text-xs text-muted-foreground font-mono">{sampleCode}</p>
      <Button variant="outline" size="sm" onClick={handlePrintLabel}>
        <Printer className="w-3.5 h-3.5" /> Print Label
      </Button>
    </div>
  );
}
