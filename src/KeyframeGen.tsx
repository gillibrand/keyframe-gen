import { useCallback, useEffect, useId, useRef, useState } from "react";
import "./KeyframeGen.css";

type Point = {
  x: number;
  y: number;
};

type Frame = {
  scale: string;
};

function unreachable(value: never): never {
  throw new Error(`unknown value: ${value}`);
}

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

    ctx.lineWidth = 3;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height, data } = imageData;

    const newSamples: Point[] = [];
    const step = width / (sampleCount - 1);

    function isBlack(r: number, g: number, b: number, a: number) {
      // If all RGB values are close to 0, consider it black (enough)
      return r < threshold && g < threshold && b < threshold && a === 255;
    }

    for (let x = 0; x < width + 1; x += step) {
      const xFloor = Math.min(width - 1, Math.floor(x));
      for (let y = 0; y < height; y++) {
        const index = (y * width + xFloor) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const a = data[index + 3];
        if (isBlack(r, g, b, a) || y === height - 1) {
          newSamples.push({ x: xFloor, y: height - y });

          break;
        }
      }
    }

    // Draw a line graph through each point just approximate the final curve.
    let prevPoint: Point | undefined;
    ctx.strokeStyle = "red";
    for (const { x, y } of newSamples) {
      const dy = height - y;

      if (prevPoint) {
        ctx.beginPath();
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineTo(x, dy);
        ctx.stroke();
      }
      prevPoint = { x, y: dy };
    }

    // Draw each intersection point. It's important to ensure there is one at all the peaks and
    // valleys.
    ctx.strokeStyle = "red";
    for (const { x, y } of newSamples) {
      // XXX: Draw on the canvas we're reading to keep it simple. This means we need to redraw
      // the image every time we sample it. It'd better to draw on a second overlaid canvas if
      // we need this faster.

      const dy = height - y;
      // Vertical red line
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, dy);
      ctx.stroke();

      // Red intersection dot with white outline
      ctx.beginPath();
      ctx.fillStyle = "white";
      ctx.arc(x, dy, 12, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = "red";
      ctx.arc(x, dy, 10, 0, 2 * Math.PI);
      ctx.fill();
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

  function samplesAsJsScaleYFrames() {
    const frames: Frame[] = [];
    if (!image) return "";

    for (const sample of samples) {
      const frame: Frame = {
        scale: `1 ${Math.round((sample.y / image?.height) * 100) / 100}`,
      };
      frames.push(frame);
    }

    return JSON.stringify(frames, null, 2);
  }

  function samplesAsCssTranslateY() {
    if (!image) return "";

    let percent = 0;
    const step = Math.floor(100 / (samples.length - 1));

    const parts: string[] = [];

    for (const sample of samples) {
      parts.push(`${percent}% { translate: 0 ${Math.round((sample.y / image?.height) * 100) / 100} }`);
      percent += step;
    }

    return parts.join("\n");
  }

  function framesAsText() {
    switch (output) {
      case "cssScaleY":
        return samplesAsCssTranslateY();

      case "jsScaleY":
        return samplesAsJsScaleYFrames();

      default:
        return unreachable(output);
    }
  }

  async function copyFrames() {
    try {
      await navigator.clipboard.writeText(framesAsText());
      setMessage("Copied");
      setTimeout(() => {
        setMessage("");
      }, 1000);
    } catch (e) {
      setMessage((e as object).toString());
    }
  }

  type Outputs = "jsScaleY" | "cssScaleY";

  const [output, setOutput] = useState<Outputs>("jsScaleY");

  const samplesId = useId();
  const thresholdId = useId();
  const typeId = useId();

  return (
    <div className="container">
      <div>
        This will generate the JSON for JavaScript animation keyframes that scale an element over time to follow the
        curve of a graph.
      </div>
      {image && <canvas className="canvas" width={image.width} height={image.height} ref={canvasRef} />}

      {!image && <div className="placeholder">Paste an image anywhere</div>}

      <div className="control-row">
        <label htmlFor={samplesId}>Samples:</label>
        <input
          id={samplesId}
          type="range"
          value={sampleCount}
          min={2}
          max={100}
          onChange={(e) => setSampleCount(parseInt(e.target.value))}
        />
        <code>{sampleCount}</code>

        <label htmlFor={thresholdId}>Threshold:</label>
        <input
          id={thresholdId}
          type="range"
          value={threshold}
          min={0}
          max={255}
          onChange={(e) => setThreshold(parseInt(e.target.value))}
        />
        <code>{threshold}</code>

        <label htmlFor={typeId}>Output:</label>
        <select id="typeId" value={output} onChange={(e) => setOutput(e.target.value as Outputs)}>
          <option value="jsScaleY">JS: Scale Y</option>
          <option value="cssScaleY">CSS: Transform Y</option>
        </select>

        <button disabled={!samples.length} onClick={copyFrames}>
          Copy Keyframes
        </button>
        {message && <div>{message}</div>}
      </div>

      {samples.length !== 0 && <pre className="frame-list">{framesAsText()}</pre>}
    </div>
  );
}
