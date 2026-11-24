"""Builds one home page clip (1280x720 mp4 + poster + one still per step) from its recorded frames.

   python3 scripts/home-clips/compose.py <name> [--poster SECONDS]

Needs (environment, with these defaults):
   BASE    http://localhost:4173            a running build (fonts and logo for the caption bar)
   FRAMES  /tmp/home-clips/frames           where rec/<name>.mjs wrote the frames
   WORK    /tmp/home-clips/compose          scratch
   VOICE   <repo>/../voice  (VOICE_DIR)     <name>.mp3, the Glenn take for this clip
   BEDS    music-beds folder                only the eight kept beds, named in source/headlines.json ("bed")
   OUT     <repo>/public/clips/home         where the mp4, jpg and webp stills go

The footage is cropped to the recorder's focus keyframes, a caption bar (the line's short title over its words) is drawn
on, Glenn's take sits over the kept music bed (ducked), and everything is encoded for the web: H.264 + AAC, 1280x720."""
import sys, os, json, re, html, subprocess, shutil
from multiprocessing import Pool
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
name = sys.argv[1]
poster_at = float(sys.argv[sys.argv.index("--poster") + 1]) if "--poster" in sys.argv else None
FRAMES = os.environ.get("FRAMES", "/tmp/home-clips/frames")
WORKROOT = os.environ.get("WORK", "/tmp/home-clips/compose")
VOICE = os.environ.get("VOICE_DIR", "/mnt/project-files/launch/site/home-refresh-2026-11-22/voice")
BEDS = os.environ.get("BEDS", "/mnt/project-files/launch/social/music-beds-2026-11-21")
OUT = os.environ.get("OUT", os.path.join(REPO, "public", "clips", "home"))
BASE = os.environ.get("BASE", "http://localhost:4173")
FR = os.path.join(FRAMES, name)
meta = json.load(open(os.path.join(FR, "meta.json")))
lines = json.load(open(os.path.join(HERE, "source", "timings.json")))[name]
heads = json.load(open(os.path.join(HERE, "source", "headlines.json")))[name]
FPS = meta["fps"]; N = meta["frames"]; T = N / FPS
work = os.path.join(WORKROOT, name); shutil.rmtree(work, ignore_errors=True)
for d in ("ov", "wide", "clean"): os.makedirs(os.path.join(work, d))
os.makedirs(OUT, exist_ok=True)

def hl(s): return re.sub(r"\*(.+?)\*", r'<em>\1</em>', html.escape(s))
CSS = "em{font-style:normal;color:#16C8E8}"
specs = []
for i, ln in enumerate(lines):
    text = html.escape(ln["text"].replace("Grid Iron Vault dot com", "gridiron-vault.com").replace("Grid Iron Vault", "GridIronVault").replace("five on five", "5-on-5").replace("seven on seven", "7-on-7"))
    specs.append({"file": f"{work}/ov/w{i}.png", "w": 1920, "h": 1080, "html": f"""<style>{CSS}
      .cap{{position:absolute;left:50%;bottom:54px;transform:translateX(-50%);max-width:1560px;padding:20px 34px 22px 28px;
      border-left:12px solid #16C8E8;border-radius:16px;background:rgba(1,18,34,.94);box-shadow:0 18px 50px rgba(0,0,0,.55);
      color:#fff;font:700 50px/1.12 'Barlow';text-align:left}}
      .k{{display:block;margin-bottom:6px;font:800 30px 'Saira Condensed';letter-spacing:.14em;text-transform:uppercase;color:#5fd6ea}}</style>
      <div class="cap"><span class="k">{hl(heads['lines'][i])}</span>{text}</div>"""})
json.dump(specs, open(f"{work}/specs.json", "w"))
subprocess.run(["node", os.path.join(HERE, "rec", "render.mjs"), f"{work}/specs.json"], check=True, env={**os.environ, "BASE": BASE})

S = meta["css"]["scale"]; CW, CH = meta["css"]["w"], meta["css"]["h"]
full = (0, 0, CW, CH); keys = meta["focus"]
def box_at(i):
    cur = full
    for k in keys:
        if k["frame"] > i: break
        tgt = full if k["rect"] is None else (k["rect"]["x"], k["rect"]["y"], k["rect"]["w"], k["rect"]["h"])
        dur = max(1, round(k["sec"] * FPS)); f = min(1, (i - k["frame"]) / dur)
        e = f * f * (3 - 2 * f)
        start = cur
        cur = tuple(a + (b - a) * e for a, b in zip(start, tgt)) if f < 1 else tgt
    return cur
def line_at(t):
    idx = 0
    for j, ln in enumerate(lines):
        if t >= ln["start"] - 0.12: idx = j
    return idx

def frame(i):
    im = Image.open(f"{FR}/f{i:05d}.jpg").convert("RGB")
    x, y, w, h = box_at(i)
    im = im.crop((round(x * S), round(y * S), round((x + w) * S), round((y + h) * S))).resize((1920, 1080), Image.LANCZOS)
    im.save(f"{work}/clean/{i:05d}.jpg", quality=92)
    wide = im.copy(); ov = Image.open(f"{work}/ov/w{line_at(i / FPS)}.png"); wide.paste(ov, (0, 0), ov)
    wide.save(f"{work}/wide/{i:05d}.jpg", quality=92)
with Pool(int(os.environ.get("POOL", "3"))) as pool: pool.map(frame, range(N), chunksize=8)

# Sound: Glenn's take over the kept bed (ducked), then -14 LUFS.
bed_name = heads.get("bed")
mix = f"{work}/mix.m4a"
voice = os.path.join(VOICE, f"{name}.mp3")
if bed_name:
    bed = os.path.join(BEDS, f"{bed_name}.mp3")
    graph = (f"[0:a]aresample=44100,apad,asplit=2[vo][sc];[1:a]aresample=44100,volume=0.42,afade=t=in:d=0.6,afade=t=out:st={T-1.6:.2f}:d=1.6[m];"
             "[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=320[duck];"
             f"[vo][duck]amix=inputs=2:normalize=0:duration=longest,atrim=0:{T:.3f},loudnorm=I=-14:TP=-1.5:LRA=11[a]")
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", voice, "-stream_loop", "-1", "-i", bed, "-filter_complex", graph]
else:
    graph = f"[0:a]aresample=44100,apad,atrim=0:{T:.3f},loudnorm=I=-14:TP=-1.5:LRA=11[a]"
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", voice, "-filter_complex", graph]
subprocess.run(cmd + ["-map", "[a]", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", mix], check=True)

mp4 = os.path.join(OUT, f"{name}.mp4")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", f"{work}/wide/%05d.jpg", "-i", mix,
  "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-r", str(FPS),
  "-c:a", "copy", "-shortest", "-movflags", "+faststart", mp4], check=True)

# Poster (clean footage, no caption bar) and one still per step: the clean frame near the end of each line.
def still(sec, path, w, q):
    i = max(0, min(N - 1, round(sec * FPS)))
    Image.open(f"{work}/clean/{i:05d}.jpg").resize((w, w * 9 // 16), Image.LANCZOS).save(path, quality=q)
pa = poster_at if poster_at is not None else lines[min(2, len(lines) - 1)]["end"] - 0.3
still(pa, os.path.join(OUT, f"{name}.jpg"), 1280, 80)
for i, ln in enumerate(lines):
    nxt = lines[i + 1]["start"] if i + 1 < len(lines) else T
    sec = min(ln["end"], nxt) - 0.2 if i + 1 < len(lines) else ln["end"] - 0.5
    p = os.path.join(OUT, f"{name}-s{i + 1}.webp")
    i2 = max(0, min(N - 1, round(sec * FPS)))
    Image.open(f"{work}/clean/{i2:05d}.jpg").resize((640, 360), Image.LANCZOS).save(p, "WEBP", quality=78)
print(name, f"{T:.1f}s", os.path.getsize(mp4) // 1024, "KB")
