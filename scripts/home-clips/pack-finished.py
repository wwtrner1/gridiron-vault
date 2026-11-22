"""Packs a finished 1080p social video (the Designer v2 set, 2026-11-21) for the home page: 1280x720 H.264 + AAC, the closing
end card cut off, a poster and one still per step.

   python3 scripts/home-clips/pack-finished.py <name> <source.mp4> [--end-card 2.4] [--reel]

--reel packs the every-tool video as the home page reel instead (public/clips/home-reel.mp4, .webm and .jpg)."""
import sys, os, json, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
name, src = sys.argv[1], sys.argv[2]
cut = float(sys.argv[sys.argv.index("--end-card") + 1]) if "--end-card" in sys.argv else 2.4
reel = "--reel" in sys.argv
OUT = os.path.join(REPO, "public", "clips") if reel else os.path.join(REPO, "public", "clips", "home")
os.makedirs(OUT, exist_ok=True)
lines = json.load(open(os.path.join(HERE, "source", "timings.json")))[name]
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src]).decode())
T = round(dur - cut, 2)
stem = "home-reel" if reel else name
mp4 = os.path.join(OUT, f"{stem}.mp4")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-t", str(T), "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow",
  "-crf", "26", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "128k", "-af", f"afade=t=out:st={T-0.6:.2f}:d=0.6", "-movflags", "+faststart", mp4], check=True)
if reel:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-t", str(T), "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0",
      "-row-mt", "1", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "libopus", "-b:a", "96k", "-af", f"afade=t=out:st={T-0.6:.2f}:d=0.6", os.path.join(OUT, "home-reel.webm")], check=True)

def still(sec, path, w, fmt):
    args = ["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, sec):.2f}", "-i", src, "-frames:v", "1", "-vf", f"scale={w}:-1:flags=lanczos"]
    args += ["-q:v", "4", path] if fmt == "jpg" else ["-quality", "78", path]
    subprocess.run(args, check=True)
poster_at = lines[min(2, len(lines) - 1)]["end"] - 0.3
still(poster_at, os.path.join(OUT, f"{stem}.jpg"), 1280, "jpg")
if not reel:
    for i, ln in enumerate(lines):
        nxt = lines[i + 1]["start"] if i + 1 < len(lines) else T
        sec = min(ln["end"], nxt) - 0.2 if i + 1 < len(lines) else min(ln["end"], T) - 0.5
        still(sec, os.path.join(OUT, f"{name}-s{i + 1}.webp"), 640, "webp")
print(stem, f"{T}s", os.path.getsize(mp4) // 1024, "KB")
