import { useCallback, useEffect, useRef, useState } from "react";
import "./KeyframeGen.css";

type Point = {
  x: number;
  y: number;
};

type Frame = {
  scale: string;
};

export function KeyframeGen() {
  const [image, setImage] = useState<HTMLImageElement | null>();
  const [message, setMessage] = useState("");
  const [sampleCount, setSampleCount] = useState(5);
  const [threshold, setThreshold] = useState(127);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [samples, setSamples] = useState<Point[]>([]);

  const updateSamples = useCallback(function updateSamples(
    canvas: HTMLCanvasElement,
    sampleCount: number,
    threshold: number
  ) {
    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    })!;

    ctx.strokeStyle = ctx.fillStyle = "red";
    ctx.lineWidth = 3;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height, data } = imageData;

    const newSamples: Point[] = [];
    const step = width / (sampleCount - 1);

    function isBlack(r: number, g: number, b: number, a: number) {
      // If all RGB values are close to 0, consider it black (enough)
      return r < threshold && g < threshold && b < threshold && a === 255;
    }

    for (let x = 0; x <= width; x += step) {
      const xFloor = Math.min(width - 1, Math.floor(x));
      for (let y = 0; y < height; y++) {
        const index = (y * width + xFloor) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const a = data[index + 3];
        if (isBlack(r, g, b, a)) {
          newSamples.push({ x: xFloor, y: height - y });

          // Vertical red line
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();

          // Red intersection dot with white outline
          ctx.beginPath();
          ctx.fillStyle = "white";
          ctx.arc(x, y, 12, 0, 2 * Math.PI);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = "red";
          ctx.arc(x, y, 10, 0, 2 * Math.PI);
          ctx.fill();

          break;
        }
      }
    }

    setSamples(newSamples);
    return newSamples;
  },
  []);

  useEffect(
    /**
     * Fires whenever the image or samples change. That means we get two renders when changing
     * samples, first to set the samples, then this, then render the new frames. Good enough. We
     * must render after setting the image to get the canvas rendered first (otherwise we could
     * create canvas outside the and only update change it if the image size changes).
     */
    function drawImageAndUpdateSamples() {
      if (!image || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);

      updateSamples(canvas, sampleCount, threshold);
    },
    [image, sampleCount, updateSamples, threshold]
  );

  useEffect(function initPasteListener() {
    document.addEventListener("paste", (e: ClipboardEvent) => {
      if (!e.clipboardData) return;

      const items = e.clipboardData.items;

      for (const item of items) {
        if (item.type.startsWith("image")) {
          const blob = item.getAsFile();
          if (!blob) continue;

          const newImage = new Image();
          newImage.onload = function () {
            setMessage("");
            setImage(newImage);
          };
          newImage.onerror = (error) => {
            setImage(undefined);
            setMessage(error.toString());
          };

          newImage.src = URL.createObjectURL(blob);
          return;
        }
      }

      setMessage("Copy an image and try pasting again.");
    });
  }, []);

  function samplesAsFrames() {
    const frames: Frame[] = [];
    if (!image) return frames;

    for (const sample of samples) {
      const frame: Frame = {
        scale: `1 ${Math.round((sample.y / image?.height) * 100) / 100}`,
      };
      frames.push(frame);
    }

    return frames;
  }

  function framesAsJson() {
    return JSON.stringify(samplesAsFrames(), null, 2);
  }

  async function copyFrames() {
    try {
      await navigator.clipboard.writeText(framesAsJson());
      setMessage("Copied");
      setTimeout(() => {
        setMessage("");
      }, 1000);
    } catch (e) {
      setMessage((e as object).toString());
    }
  }

  return (
    <div className="container">
      <div>
        This will generate the JSON for JavaScript animation keyframes that scale an element over time to follow the
        curve of a graph.
      </div>
      {image && <canvas className="canvas" width={image.width} height={image.height} ref={canvasRef} />}

      {!image && <div className="placeholder">Paste an image anywhere</div>}

      <div className="control-row">
        <label>Samples:</label>
        <input
          type="range"
          value={sampleCount}
          min={2}
          max={100}
          onChange={(e) => setSampleCount(parseInt(e.target.value))}
        />
        <code>{sampleCount}</code>

        <label>Threshold:</label>
        <input
          type="range"
          value={threshold}
          min={0}
          max={255}
          onChange={(e) => setThreshold(parseInt(e.target.value))}
        />
        <code>{threshold}</code>

        <button disabled={!samples.length} onClick={copyFrames}>
          Copy Keyframes
        </button>
        {message && <div>{message}</div>}
      </div>

      {samples.length !== 0 && <pre className="frame-list">{framesAsJson()}</pre>}
    </div>
  );
}
