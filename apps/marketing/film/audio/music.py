"""
Openinary film score v5 (mallet knocks, no bells): 15 bars at 96 BPM (48 fps, 120 frames a bar, 37.5 s), a seamless loop, 48 kHz stereo.
Written for the v5 picture (public/cues.json "marks"), then mixed with the UI foley (audio/stems/sfx-raw.wav,
rendered by audio/score.py) and mastered to -14 LUFS, true peak under -1 dBFS -> public/score.wav.

Arrangement (bar: picture -> music)
  1  opening burst           Abmaj9 pad swells in, the burst bell echoes ring over from the loop end
  2  drag, drop, upload      pad + soft rim pulse, a bell where the card lands
  3  success, grid, dive     Fm9, the sub enters; a reverse swell into the full-bleed photo
  4  w_600                   Dbmaj9, the groove enters (kick, rim, hats); bell on the slam
  5  h_600 crop              Ab/C; bell on the crop, then on the rounding
  6  r_max, "change the file" Fm9 groove
  7  the variant reel        Eb, 16th hats, the riser starts
  8  the cache beat          Fm7 half-time breath under a low-pass; the riser keeps climbing; two pings (miss, hit)
  9  every size              DROP: Abmaj9, full groove with clap, the motif
 10  every format            Dbmaj9, motif answer; bell on the avif flip
 11  98% smaller             Fm9
 12  video                   Ebsus4 -> Eb, band-passed "radio" while processing, slams back on resolve
 13  video plays, flights    Dbmaj9; six rising blips on the shard landings
 14  lockup                  Eb, drums out, the lockup bells
 15  end card, burst          Abmaj9 held, reverse swell into the burst cluster, which loops into bar 1
Run: python3 audio/music.py (after scripts/export-cues.ts and audio/score.py).
"""
from __future__ import annotations

import json
import pathlib

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy import signal

HERE = pathlib.Path(__file__).resolve().parent
CUES = json.loads((HERE.parent / "public/cues.json").read_text())
M = CUES["marks"]
SR = 48_000
FPS = CUES["fps"]
NF = CUES["frames"]
assert (FPS, NF, CUES["bpm"]) == (48, 1800, 96)
BAR = 120  # frames
N = NF * SR // FPS
rng = np.random.default_rng(96)


def t_of(frame: float) -> float:
    return frame / FPS


def bar_t(b: float) -> float:
    """Start of bar b (1-based, fractional beats allowed: bar_t(4.25) = bar 4 beat 2)."""
    return t_of((b - 1) * BAR)


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


NOTE = {n: i for i, n in enumerate(["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"])}


def m(name: str) -> int:
    """'Ab4' -> midi."""
    return 12 * (int(name[-1]) + 1) + NOTE[name[:-1]]


# --- the loop buffer: 3 loops, every event is placed in each, the middle one is the file ----------------------
class Bus:
    def __init__(self):
        self.x = np.zeros((3 * N, 2))

    def add(self, sig: np.ndarray, t: float, pan: float = 0.0, gain: float = 1.0):
        if sig.ndim == 1:
            l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            sig = np.stack([sig * l * np.sqrt(2), sig * r * np.sqrt(2)], 1)
        s0 = int(round(t * SR))
        for k in (0, 1, 2):
            a = s0 + k * N
            b = min(a + len(sig), 3 * N)
            if b > a and a >= 0:
                self.x[a:b] += sig[: b - a] * gain

    def mid(self):
        return self.x[N : 2 * N]


def env_adsr(n, a, d, s, r_from, r):
    e = np.ones(n)
    ia, idd, ir0, ir = (int(x * SR) for x in (a, d, r_from, r))
    e[:ia] = np.linspace(0, 1, max(ia, 1))[:ia]
    if idd:
        e[ia : ia + idd] = np.linspace(1, s, idd)[: max(0, min(idd, n - ia))]
    e[ia + idd : ir0] = s
    e[ir0 : ir0 + ir] = s * np.linspace(1, 0, ir)[: max(0, n - ir0)]
    e[ir0 + ir :] = 0
    return e


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "low", fs=SR, output="sos"), x, axis=0)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], "band", fs=SR, output="sos"), x, axis=0)


# --- instruments ----------------------------------------------------------------------------------------------
def pad_voice(f0, dur):
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for det, side in ((-7, 0), (0, None), (7, 1)):
        f = f0 * 2 ** (det / 1200)
        ph = 2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)
        w = sum(np.sin(k * ph) / k * (0.85 ** k) for k in range(1, 9))  # soft saw
        if side is None:
            out += w[:, None] * 0.5
        else:
            out[:, side] += w * 0.8
    out *= env_adsr(n, 0.35, 0.4, 0.8, dur, 1.1)[:, None]
    return out


def pad_chord(notes, t0, t1, cutoff=1800, gain=0.06):
    dur = t1 - t0
    y = sum(pad_voice(hz(m(x)), dur) for x in notes)
    return lp(y, cutoff) * gain


def knock(midi, dur=0.7, gain=0.18, depth=1.0):
    """A wooden mallet knock (marimba modes 1 : 3.93 : 9.2), a fast pitch drop on the attack, a dry click and a short
    low thump under it: deep and percussive, the notification-sound family, not a ringing bell."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    glide = 1 + 0.035 * np.exp(-t / 0.012)
    ph = 2 * np.pi * f * np.cumsum(glide) / SR
    y = np.sin(ph) * np.exp(-t / 0.16)
    y += 0.28 * np.sin(3.93 * ph) * np.exp(-t / 0.045)
    y += 0.09 * np.sin(9.2 * ph) * np.exp(-t / 0.018)
    y += depth * 0.5 * np.sin(2 * np.pi * f / 2 * t) * np.exp(-t / 0.07)  # body
    c = int(0.004 * SR)
    y[:c] += bp(noise(c), 2000, 7000) * np.linspace(1, 0, c) * 0.6  # the click
    y *= np.minimum(1, t / 0.0008)
    return np.tanh(1.4 * y) / np.tanh(1.4) * gain


def notif(midi, gain=0.2, interval=7, gap=0.075):
    """Two quick knocks, a fifth up: the "something happened" cue."""
    a = knock(midi, gain=gain)
    b = knock(midi + interval, gain=gain * 0.85)
    out = np.zeros(len(b) + int(gap * SR))
    out[: len(a)] += a
    out[int(gap * SR) :] += b
    return out


def kick(gain=0.9):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 44 + 90 * np.exp(-t / 0.035)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    y[: int(0.002 * SR)] += rng.standard_normal(int(0.002 * SR)) * 0.3
    return np.tanh(1.6 * y) * gain


def noise(n):
    return rng.standard_normal(n)


def clap(gain=0.35):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for d in (0, 0.011, 0.022):
        e += (t >= d) * np.exp(-np.maximum(t - d, 0) / (0.012 if d < 0.02 else 0.13))
    return bp(noise(n), 900, 3200) * e * gain


def hat(open_=False, gain=0.08):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp(noise(n), 7000, 4) * np.exp(-t / (0.09 if open_ else 0.018)) * gain


def rim(gain=0.12):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    y = bp(noise(n), 1500, 4500) * np.exp(-t / 0.008) + np.sin(2 * np.pi * 820 * t) * np.exp(-t / 0.02) * 0.6
    return y * gain


def sub_note(midi, dur, gain=0.32):
    n = int((dur + 0.08) * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    y = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(4 * np.pi * f * t)
    y *= np.minimum(1, t / 0.006) * np.clip((dur + 0.08 - t) / 0.08, 0, 1)
    return np.tanh(1.3 * y) * gain


def riser(dur, gain=0.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = noise(n)
    out = np.zeros(n)
    seg = SR // 50
    for i in range(0, n, seg):
        p = i / n
        lo, hi = 300 + 2500 * p**2, 1200 + 9000 * p**2
        out[i : i + seg] = bp(x[max(0, i - 2048) : i + seg], lo, min(hi, 20000))[-len(x[i : i + seg]) :]
    return out * (t / dur) ** 2.2 * gain


def reverse_swell(midi_list, dur, gain=0.06):
    y = sum(pad_voice(hz(x), dur) for x in midi_list)[: int(dur * SR)]
    y = y[::-1] * np.linspace(0, 1, len(y))[:, None] ** 2
    return lp(y, 2500) * gain


# --- the arrangement --------------------------------------------------------------------------------------------
CHORDS = {
    1: ["Ab3", "C4", "Eb4", "G4", "Bb4"],
    2: ["Ab3", "C4", "Eb4", "G4", "Bb4"],
    3: ["F3", "Ab3", "C4", "Eb4", "G4"],
    4: ["Db3", "F3", "Ab3", "C4", "Eb4"],
    5: ["C3", "Eb3", "Ab3", "C4", "G4"],
    6: ["F3", "Ab3", "C4", "Eb4", "G4"],
    7: ["Eb3", "G3", "Bb3", "Eb4", "F4"],
    8: ["F3", "Ab3", "C4", "Eb4"],
    9: ["Ab3", "C4", "Eb4", "G4", "Bb4"],
    10: ["Db3", "F3", "Ab3", "C4", "Eb4"],
    11: ["F3", "Ab3", "C4", "Eb4", "G4"],
    12: ["Eb3", "Ab3", "Bb3", "Eb4", "F4"],
    13: ["Db3", "F3", "Ab3", "C4", "Eb4"],
    14: ["Eb3", "G3", "Bb3", "Eb4", "F4"],
    15: ["Ab3", "C4", "Eb4", "G4", "Bb4"],
}
ROOT = {1: "Ab1", 2: "Ab1", 3: "F1", 4: "Db2", 5: "C2", 6: "F1", 7: "Eb2", 8: "F1", 9: "Ab1", 10: "Db2", 11: "F1", 12: "Eb2", 13: "Db2", 14: "Eb2", 15: "Ab1"}
GROOVE = {4, 5, 6, 7, 9, 10, 11, 12, 13}
FULL = {9, 10, 11, 12, 13}
PAD_GAIN = {1: 0.085, 2: 0.085, 3: 0.075, 8: 0.07, 14: 0.08, 15: 0.08}
BEAT = 30  # frames


def build():
    pad, drums, bass, lead, fx = Bus(), Bus(), Bus(), Bus(), Bus()
    kick_times = []

    # pad: one chord per bar, overlapping tails; bar 15 holds into bar 1 (same chord: the seam is invisible)
    for b in range(1, 16):
        t0, t1 = bar_t(b), bar_t(b + 1)
        pad.add(pad_chord(CHORDS[b], t0, t1, cutoff=2600 if b in FULL | {14, 15} else 1700, gain=PAD_GAIN.get(b, 0.06)), t0)

    # drums
    for b in range(1, 16):
        t0 = bar_t(b)
        s16 = t_of(BEAT / 4)
        if b in (1, 2, 3):  # soft pulse (bar 1 from beat 3, after the burst)
            for i in ((10, 14) if b == 1 else (2, 6, 10, 14)):
                drums.add(rim(0.08), t0 + i * s16, pan=0.3)
            for i in range(0 if b > 1 else 8, 16, 2):
                drums.add(hat(gain=0.03), t0 + i * s16, pan=-0.35)
        if b in GROOVE:
            kicks = (0, 8) if b in (4, 5, 6, 7) else (0, 6, 8, 14) if b in FULL else (0,)
            for i in kicks:
                drums.add(kick(), t0 + i * s16)
                kick_times.append(t0 + i * s16)
            for i in (4, 12):
                drums.add(clap() if b in FULL else rim(), t0 + i * s16, pan=0.0 if b in FULL else 0.25)
            step = 1 if b in (7, 12, 13) else 2
            for i in range(0, 16, step):
                drums.add(hat(gain=0.07 if i % 4 == 2 else 0.045), t0 + i * s16, pan=0.35)
            if b in FULL:
                for i in (2, 6, 10, 14):
                    drums.add(hat(True, 0.05), t0 + i * s16, pan=-0.3)
        if b == 8:  # the breath: half time
            drums.add(kick(0.6), t0)
            kick_times.append(t0)
            drums.add(rim(0.06), t0 + 8 * s16, pan=0.2)

    # sub: 8ths in groove bars, held notes elsewhere (from bar 3)
    for b in range(3, 16):
        t0 = bar_t(b)
        r = m(ROOT[b])
        if b in GROOVE:
            for i in range(8):
                if i % 2 == 0 or b in FULL:
                    bass.add(sub_note(r + (12 if i == 7 and b in FULL else 0), t_of(BEAT / 2) * 0.85, 0.3), t0 + i * t_of(BEAT / 2))
        elif b != 15:
            bass.add(sub_note(r, t_of(BAR) * 0.95, 0.24), t0)

    # lead: the motif on the drop and its answer (Ab major pentatonic, on the 16th grid)
    motif = [("Eb5", 0), ("F5", 2), ("Ab5", 4), ("Bb5", 7), ("Ab5", 10), ("F5", 12)]
    answer = [("C6", 0), ("Bb5", 2), ("Ab5", 4), ("F5", 8), ("Eb5", 10), ("F5", 14)]
    for b, phrase in ((9, motif), (10, answer), (11, motif[:4])):
        for note, i in phrase:
            lead.add(knock(m(note) - 12, gain=0.13), bar_t(b) + i * t_of(BEAT / 4), pan=0.15)

    # event bells (picture sync)
    ev = [
        (M["cardDrop"], "Eb5", 0.10), (M["uploaded"], "Ab5", 0.12),
        (M["snap"], "Eb6", 0.15), (M["crop"], "F6", 0.15), (M["round"], "Ab6", 0.15),
        (M["cacheFirst"], "C5", 0.11), (M["cached"], "Eb6", 0.16), (M["cached"] + 3, "Ab6", 0.10),
        (M["drop"], "Ab5", 0.14), (M["flip"], "Bb5", 0.13), (M["smaller"], "Eb6", 0.12),
        (M["resolve"], "G5", 0.14), (M["topShard"], "Eb6", 0.14),
        (M["formed"], "Ab5", 0.12), (M["formed"] + 15, "C6", 0.11), (M["formed"] + 30, "Eb6", 0.11),
    ]
    NOTIF = {M["uploaded"], M["cached"], M["formed"]}  # the three "done" moments get the double knock
    for f, note, g in ev:
        if f == M["cached"] + 3 or f in (M["formed"] + 15, M["formed"] + 30):
            continue  # folded into the double knocks
        sig = notif(m(note) - 12, gain=g * 1.3) if f in NOTIF else knock(m(note) - 12, gain=g * 1.25)
        lead.add(sig, t_of(f), pan=0.0)
    for i, f in enumerate(M["landings"]):
        lead.add(knock(m(["Ab5", "Bb5", "C6", "Eb6", "F6", "Ab6"][i]) - 12, dur=0.4, gain=0.1, depth=0.6), t_of(f), pan=-0.4 + 0.16 * i)
    # the burst: a low chord knock, echoing a quarter apart (the echoes land in bar 1 of the next loop)
    for k, g in enumerate((0.16, 0.08, 0.045, 0.025)):
        for note in ("Bb4", "Eb5", "G5"):
            lead.add(knock(m(note), gain=g / 1.4), t_of(M["burst"] + k * BEAT), pan=(-0.5, 0.5)[k % 2] if k else 0)

    # fx: risers and swells
    fx.add(riser(t_of(M["drop"] - 720)), t_of(720))  # bars 7-8 into the drop
    fx.add(reverse_swell([m("Ab3"), m("Eb4"), m("C5")], t_of(M["fullBleed"] - M["push"])), t_of(M["push"]))
    fx.add(reverse_swell([m("Bb3"), m("Eb4"), m("G4")], 1.0, 0.07), t_of(M["burst"]) - 1.0)
    fx.add(kick(0.7), t_of(M["drop"]))  # the drop hit
    fx.add(sub_note(m("Ab1"), 1.4, 0.35), t_of(M["drop"]))
    fx.add(kick(0.6), t_of(M["resolve"]))

    return pad, drums, bass, lead, fx, kick_times


def reverb(x, secs=2.4, wet=0.22):
    n = int(secs * SR)
    t = np.arange(n) / SR
    ir = np.stack([noise(n), noise(n)], 1) * np.exp(-t / (secs / 5))[:, None]
    ir = lp(hp(ir, 300), 6000)
    ir /= np.sqrt(np.sum(ir**2))
    y = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in (0, 1)], 1)
    return x + wet * y


def automation(x, kick_times):
    """Sidechain pump from the kicks, the bar-8 breath (low-pass) and the processing radio (band-pass)."""
    t = np.arange(3 * N) / SR
    duck = np.ones(3 * N)
    for k in kick_times:
        for loop in range(3):
            a = int((k + loop * N / SR) * SR)
            n = int(0.22 * SR)
            if 0 <= a < 3 * N:
                seg = 1 - 0.45 * np.exp(-np.arange(min(n, 3 * N - a)) / (0.06 * SR))
                duck[a : a + len(seg)] = np.minimum(duck[a : a + len(seg)], seg)
    x = x * duck[:, None]

    def window(f0, f1, ramp_in=0.08, ramp_out=0.01):
        w = np.zeros(3 * N)
        for loop in range(3):
            a, b = t_of(f0) + loop * N / SR, t_of(f1) + loop * N / SR
            w = np.maximum(w, np.clip(np.minimum((t - a) / ramp_in, (b - t) / ramp_out + 1), 0, 1) * (t < b + ramp_out))
        return w[:, None]

    breath = window(840, 960, 0.3, 0.005)
    x = x * (1 - breath) + lp(x, 650, 4) * breath * 1.4
    radio = window(M["processing"], M["resolve"], 0.06, 0.003)
    x = x * (1 - radio) + bp(x, 350, 2800, 2) * radio * 1.6
    return x


def master(x, target=-14.0, ceiling=-1.0):
    meter = pyln.Meter(SR)
    for _ in range(4):
        y = np.tanh(x * 1.1) / 1.1  # gentle saturation keeps the peaks round
        lu = meter.integrated_loudness(y[N : 2 * N])
        x = x * 10 ** ((target - lu) / 20)
    y = np.tanh(x * 1.1) / 1.1
    peak = 10 ** (ceiling / 20)
    over = np.abs(y).max() / peak
    if over > 1:
        y /= over
    return y


def main():
    pad, drums, bass, lead, fx, kicks = build()
    # the breath and the radio filter the band; the riser and the hits ride on top, unfiltered
    music = automation(reverb(pad.x, 2.6, 0.35) + reverb(lead.x, 1.0, 0.12) + drums.x + bass.x, kicks) + reverb(fx.x, 1.8, 0.2)
    sfx, sr = sf.read(HERE / "stems/sfx-raw.wav", always_2d=True)
    assert sr == SR and len(sfx) == N
    sfx3 = np.concatenate([sfx, sfx, sfx])
    # balance: the foley sits just under the music's peaks, as in v2
    mix = music * 1.0 + sfx3 * 0.55
    out = master(mix)[N : 2 * N]
    meter = pyln.Meter(SR)
    print(f"music.py: {N / SR:.2f} s, {meter.integrated_loudness(out):.1f} LUFS, peak {20 * np.log10(np.abs(out).max()):.1f} dBFS")
    seam = np.abs(out[0] - out[-1]).max()
    print(f"seam step {seam:.4f}")
    (HERE / "stems").mkdir(exist_ok=True)
    sf.write(HERE / "stems/music.wav", (master(music)[N : 2 * N]).astype(np.float32), SR, subtype="PCM_24")
    sf.write(HERE.parent / "public/score.wav", out.astype(np.float32), SR, subtype="PCM_24")


if __name__ == "__main__":
    main()
