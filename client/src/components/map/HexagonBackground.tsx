import { useRef, useEffect } from 'react';

const HexagonBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    const hexRadius = 45;
    const hexWidth = Math.sqrt(3) * hexRadius;
    const hexHeight = 2 * hexRadius;
    const xOffset = hexWidth;
    const yOffset = hexHeight * 0.75;

    let mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.targetX = e.clientX - rect.left;
      mouse.targetY = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.targetX = -1000;
      mouse.targetY = -1000;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseout', handleMouseLeave);

    const drawHexagon = (x: number, y: number, radius: number, glow: number, time: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const distortion = Math.sin(time * 2 + x * 0.01 + y * 0.01) * 2;
        const r = radius + distortion;
        const px = x + r * Math.cos(angle);
        const py = y + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      const baseOpacity = 0.03;
      const glowOpacity = Math.min(glow, 0.6);

      ctx.strokeStyle = `rgba(34, 197, 94, ${baseOpacity + glowOpacity})`;
      ctx.lineWidth = 1 + glow * 2.5;
      ctx.stroke();

      if (glow > 0.05) {
        ctx.fillStyle = `rgba(34, 197, 94, ${glow * 0.1})`;
        ctx.fill();
      }

      if (glow > 0.2) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + glow * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(167, 243, 208, ${glow})`;
        ctx.fill();
      }
    };

    let animationFrameId: number;
    let time = 0;

    const render = () => {
      time += 0.005;

      mouse.x += (mouse.targetX - mouse.x) * 0.1;
      mouse.y += (mouse.targetY - mouse.y) * 0.1;

      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = '#0B1320';
      ctx.fillRect(0, 0, width, height);

      if (mouse.x > -500) {
        const gradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 400);
        gradient.addColorStop(0, 'rgba(20, 83, 45, 0.15)');
        gradient.addColorStop(1, 'rgba(11, 19, 32, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      const cols = Math.ceil(width / hexWidth) + 2;
      const rows = Math.ceil(height / yOffset) + 2;

      for (let row = -1; row < rows; row++) {
        for (let col = -1; col < cols; col++) {
          let x = col * hexWidth;
          let y = row * yOffset;

          if (row % 2 !== 0) {
            x += hexWidth / 2;
          }

          const driftX = Math.sin(time + row * 0.2) * 15;
          const driftY = Math.cos(time + col * 0.2) * 15;

          const finalX = x + driftX;
          const finalY = y + driftY;

          const dx = mouse.x - finalX;
          const dy = mouse.y - finalY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          const maxDistance = 300;
          let glow = 0;
          if (distance < maxDistance) {
            glow = 1 - distance / maxDistance;
            glow = Math.pow(glow, 1.5);
          }

          drawHexagon(finalX, finalY, hexRadius * 0.85, glow, time);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseout', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
};

export default HexagonBackground;
