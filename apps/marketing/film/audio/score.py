#!/usr/bin/env python3
"""
Openinary film score: 18.000 s seamless loop (1080 f at 60 fps, 120 BPM, 9 bars), 48 kHz stereo.

Timing source of truth: video/public/cues.json (read only). Spec: analysis/FINAL.md section 4 and 5 over
analysis/concept_A.md sections 5 and 6, recipes and levels from analysis/audio.md section 6.

Run:   ./venv/bin/python score.py           render, master, write, verify
       ./venv/bin/python score.py --fast    render, master, write, core asserts only

Layout
  0  constants, cue loading, LOCAL OVERRIDES (every deviation from cues.json is listed there)
  1  DSP toolkit: seeded rng, noise colours, envelopes, oscillators, numba TPT SVF (per-sample cutoff),
     Butterworth cascades, resonator bank, FM bell, synthetic reverb IR + fftconvolve, ping-pong delay,
     variable delay (flanger), saturation, pan, BS.1770 loudness, 4x oversampled true-peak limiter
  2  instruments: pad, sub, kick, clap, hats, shaker, rim, bell, buzz, riser, impact, reverse swell
  3  foley recipes (one per cue type) and the cue dispatcher
  4  arrangement: music sections (hard cuts kill tails), bus automation, circular timeline
  5  master: gain to -14 LUFS, HPF, mono-maker, limiter, loop checks, write score + stems
  6  verification: loudness, true peak, DC, seam, onsets vs cues, band-limit checks, sub correlation,
     spectrograms

Circular render: every event is placed in loops -1, 0 and +1 of one 3 x 864,000 sample buffer, every automation
curve is periodic, every filter/reverb/limiter runs over the whole buffer, and the middle loop is kept, so tails
(burst echoes, reverbs, limiter release) wrap into bar 1 exactly as they would when the file loops.
"""
from __future__ import annotations

import hashlib
import json
import math
import pathlib
import re
import shutil
import subprocess
import sys

import numpy as np
import soundfile as sf
from numba import njit
from scipy import signal
from scipy.interpolate import PchipInterpolator
from scipy.ndimage import minimum_filter1d, uniform_filter1d

# =====================================================================================================
# 0. Constants, cues, local overrides
# =====================================================================================================
HERE = pathlib.Path(__file__).resolve().parent
SCRATCH = HERE.parent
CUES_PATH = HERE.parent / "public/cues.json"
OUT_WAV = HERE / "score.wav"
PUBLIC_WAV = HERE.parent / "public/score.wav"
STEMS = HERE / "stems"
REPORT = HERE / "report"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FAST = "--fast" in sys.argv
DIAG = {} if "--diag" in sys.argv else None  # per-bus loudness per bar

SR = 48_000
FPS = 48  # v5: the 60-frames-per-beat design played at 48 fps = 96 BPM
SPF = SR // FPS  # 1000 samples per frame
CUES = json.loads(CUES_PATH.read_text())
NF = CUES["frames"]  # v5: 1800 film frames (15 bars); this script now renders the SFX stem only (audio/music.py)
N = NF * SPF  # samples per loop
LOOPS = 3
LN = N * LOOPS
S16 = 7.5  # frames per 16th

assert (CUES["fps"], CUES["frames"], CUES["sampleRate"], CUES["samplesPerFrame"], CUES["bpm"]) == (FPS, NF, SR, SPF, 96)
BARS = CUES["music"]["bars"]
SFX_CUES = CUES["sfx"]
CUE = {c["id"]: c for c in SFX_CUES}
# v5: BARS is the old 9-bar arrangement; only the SFX stem of this script is used


def auto(bar: int, typ: str) -> dict:
    return next(a for a in BARS[bar - 1]["automation"] if a["type"] == typ)


DROPOUT = auto(2, "hpf-dropout")  # f188-f210
REENTRY = auto(2, "re-entry")["frame"]  # f210
BANDLIMIT = auto(4, "band-limit")  # f360-f419
OPENUP = auto(4, "filters-open-log")  # f420-f449
STUTTER = auto(4, "stutter-freeze")["from"]  # f450
DROP = auto(4, "hard-cut")["frame"]  # f480
SUCK1 = auto(5, "hpf-suckout")  # f585-f600
SUCK2 = auto(6, "hpf-suckout")  # f637-f660
RADIO = auto(7, "band-pass-radio")  # f750-f780
SLAM = auto(7, "slam-back")["frame"]  # f780
FLOOD = auto(8, "flood-bloom")  # f910-f924
HARD_STOP = auto(9, "hard-stop")["frame"]  # f1044
BURST = auto(9, "burst")["frame"]  # f1065 (T.S14.burstHit)

# Music-automation cues duplicate the bar automation: they must agree (single source of truth check).
# v5: "c20" is a music effect now (audio/music.py)
# v5: "c38" is a music effect now (audio/music.py)
# v5: "b6-hpf" is a music effect now (audio/music.py)
# v5: "b7-radio" is a music effect now (audio/music.py)
assert CUE["c60"]["frame"] == HARD_STOP and CUE["c65"]["frame"] == BURST

# -----------------------------------------------------------------------------------------------------
# LOCAL OVERRIDES (deviations from, or readings of, cues.json; each one is used below by its key)
# -----------------------------------------------------------------------------------------------------
OVERRIDES = {
    "bell-f645": "FINAL 0 item 10: every param commit plays a bell tuned to the chord. The f645 f_webp -> f_avif "
    "flip has none in cues.json -> added Eb6 (Cm7 chord tone) at -14 dB on the lead bus.",
    "resonator-fold": "c31 (+1 semitone per tick x 18) and b6-flip (x 2^(5/12)) push resonators past 17 kHz -> "
    "folded down one octave (Shepard-style ratchet, keeps rising without leaving the audible band).",
    "c66-seam": "c66 Bb1 sub bloom (tau 400 ms from the f1065 hit) would beat against the bar-1 Ab1 sub after the seam "
    "-> raised-cosine fade to zero from f1072 to f1080.",
    "b7-spin": "b7-spin 'inside the radio band-pass' read as timing: the ticks stay on the SFX bus (a HP 6 kHz tick "
    "through the 3 kHz radio LPF would vanish).",
    "c19-routing": "c19 reverse swell is routed after the bus HPF (its Eb/G voices sit below 400 Hz, the drop-out "
    "would erase it); it is high-passed at 150 Hz on its own.",
    "mix-trims": "level trims found by measurement (LEVEL_TRIM): c08 window whoosh -2 dB (it peaked on the K1 pop "
    "c10 at f61); c67 glints +9 dB (they sat 20 dB under the c64 burst whoosh); c24 badge micro ticks "
    "+3 dB (under the w_600 thwip decay); b6-count1/2 +6 dB (override odometer-band); c32 riser -3 dB (it out-shouted the drop, -12 LUFS); c33 G3 buzz +5 dB (the "
    "freeze fell to -22 LUFS, a hole instead of a held breath); c65 bell cluster and c01 echoes +8.5 / +4 dB (the burst "
    "sting was -21 LUFS vs the -15 target of concept A 5.3; 1.5 dB of the c65 trim holds -15 with the softer FM index).",
    "c09-seat": "c09 window seat follows cues.json (moved to f90 by the integrator: the window is 25 px from rest there).",
    "kick-polarity": "kick tails settle on the bar root capped at 66 Hz (C bars: 65.41 Hz, no 60 vs 65 Hz beating) and each "
    "kick is flipped to the polarity of the sub under it (20-200 ms, < 110 Hz), so the tail never cancels the sub.",
    "odometer-band": "b6-count1/2 ticks: resonators 3.2/4.8 kHz (were 9/12 kHz, under the hats and bell partials), HPF "
    "1.5 kHz, +6 dB via LEVEL_TRIM (-12 / -14 dB): the 98% counter reads above the clap and the M2 bells.",
    "thock-tuning": "c09 / c13 / c50 sine glides end on chord tones: Eb2 77.8 Hz, C3 130.8 Hz, G2 98 Hz (cues.json "
    "sineHz end values 70 / 120 / 90 Hz were off-key).",
    "riser-duck": "c32 riser ducked -6 dB for 15 ms under each c31 ratchet tick inside it (f437, f444), which it masked.",
    "pad-intro-endcard": "pad LPF 3.5 kHz (was 2.2 / 2.6 kHz) and a 12 dB/oct HPF at 160 Hz on the pad bus for f0-f240 "
    "and f960-f1044: less 120-250 Hz mud, more 0.5-1 kHz presence (reference intro and end-card balance).",
}


def out_frame(frame):
    return np.asarray(frame, float)


def design_frame(o):
    return np.asarray(o, float)


def smp(frame: float) -> int:
    """Loop-local sample index of a (possibly fractional) DESIGN frame."""
    return int(round(float(out_frame(frame)) * SPF))


def db(x):
    return 10.0 ** (np.asarray(x, float) / 20.0)


def ms(x: float) -> int:
    return int(round(x * SR / 1000.0))


def midi_hz(m: float) -> float:
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


# =====================================================================================================
# 1. DSP toolkit
# =====================================================================================================
def rng(*key) -> np.random.Generator:
    """Deterministic generator per key (cue id, hit index...): no global state, identical every run."""
    h = hashlib.sha256("|".join(map(str, key)).encode()).digest()
    return np.random.default_rng(int.from_bytes(h[:8], "little"))


def white(n, r):
    return r.standard_normal(n)


def pink(n, r):
    """1/f noise by spectral shaping, unit RMS."""
    x = np.fft.rfft(r.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    x = np.fft.irfft(x / np.sqrt(f), n)
    return x / (np.std(x) + 1e-12)


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-12)


def tt(n):
    return np.arange(n) / SR


def arc(n, peak, p_rise=2.0, p_fall=2.0):
    """0 -> 1 at sample `peak` -> 0 at n (sin^p halves). Whoosh and swell envelope."""
    e = np.zeros(n)
    peak = int(np.clip(peak, 1, n - 1))
    e[:peak] = np.sin(0.5 * np.pi * np.arange(peak) / peak) ** p_rise
    m = n - peak
    e[peak:] = np.cos(0.5 * np.pi * np.arange(m) / m) ** p_fall
    return e


def decay(n, tau_ms, attack_ms=0.5, hold_ms=0.0):
    t = tt(n)
    a = np.clip(t / max(attack_ms / 1000, 1e-6), 0, 1)
    h = attack_ms / 1000 + hold_ms / 1000
    return a * np.exp(-np.maximum(t - h, 0) / (tau_ms / 1000))


def glide(n, keys):
    """Log-linear frequency path through (position 0..1, Hz) keys."""
    xs, ys = zip(*keys)
    return np.exp(np.interp(np.linspace(0, 1, n), xs, np.log(ys)))


def phase(freq):
    return 2 * np.pi * np.cumsum(freq) / SR


def tri_add(ph, freq, fmax=8000.0):
    """Band-limited triangle (odd harmonics 1/k^2), harmonics faded out near fmax."""
    y = np.zeros_like(ph)
    for k in range(1, 40, 2):
        a = np.clip((fmax - k * freq) / 1000.0, 0, 1)
        if not np.any(a):
            break
        y += ((-1) ** ((k - 1) // 2)) * a * np.sin(k * ph) / (k * k)
    return y * 8 / np.pi**2


def saw_add(ph, f0, fmax=16000.0):
    y = np.zeros_like(ph)
    for k in range(1, int(fmax / f0) + 1):
        y += np.sin(k * ph) / k
    return y * 2 / np.pi


def sat(x, drive):
    return np.tanh(drive * x) / np.tanh(drive)


def pan(x, p=0.0):
    """Equal-power pan of a mono signal; p in [-1, 1] (scalar or per sample). Stereo input: balance."""
    a = (np.clip(np.asarray(p, float), -1, 1) + 1) * np.pi / 4
    if x.ndim == 2:
        return np.stack([x[:, 0] * np.minimum(1, np.sqrt(2) * np.cos(a)), x[:, 1] * np.minimum(1, np.sqrt(2) * np.sin(a))], 1)
    return np.stack([x * np.cos(a), x * np.sin(a)], 1)


# --- TPT state-variable filter (Zavalishin), per-sample cutoff, numba ------------------------------------
@njit(cache=True, fastmath=True)
def _svf(x, g, q, mode):
    n = x.shape[0]
    y = np.empty(n)
    k = 1.0 / q
    ic1 = 0.0
    ic2 = 0.0
    for i in range(n):
        gi = g[i]
        a1 = 1.0 / (1.0 + gi * (gi + k))
        a2 = gi * a1
        a3 = gi * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        if mode == 0:
            y[i] = v2
        elif mode == 1:
            y[i] = k * v1  # band-pass normalised to 0 dB at fc
        else:
            y[i] = x[i] - k * v1 - v2
    return y


BW_Q = {2: (0.70710678,), 4: (0.54119610, 1.30656296), 8: (0.50979558, 0.60134489, 0.89997622, 2.56291545)}
MODE = {"lp": 0, "bp": 1, "hp": 2}


def filt(x, fc, kind="lp", order=2, q=None):
    """SVF cascade. fc: scalar or per-sample array. order 2/4/8 = Butterworth; q overrides (single stage)."""
    if x.ndim == 2:
        return np.stack([filt(x[:, c], fc, kind, order, q) for c in range(x.shape[1])], 1)
    fcv = np.broadcast_to(np.asarray(fc, float), x.shape)
    g = np.ascontiguousarray(np.tan(np.pi * np.clip(fcv, 1.0, 0.49 * SR) / SR))
    y = np.ascontiguousarray(x, dtype=np.float64)
    for qq in (q,) if q else BW_Q[order]:
        y = _svf(y, g, float(qq), MODE[kind])
    return y


def sos(x, kind, fc, order=2):
    """Static Butterworth (scipy sos), axis 0."""
    return signal.sosfilt(signal.butter(order, fc, kind, fs=SR, output="sos"), x, axis=0)


def resonate(exc, freqs, q, gains=None):
    """Resonator bank: constant-peak-gain biquads, summed."""
    y = np.zeros_like(exc)
    gains = np.ones(len(freqs)) if gains is None else gains
    for f, g in zip(freqs, gains):
        if 20 < f < 0.45 * SR:
            b, a = signal.iirpeak(f, q, fs=SR)
            y += g * signal.lfilter(b, a, exc)
    return y


def fold(freqs, top=17000.0):
    """Octave-fold resonators above `top` (override 'resonator-fold')."""
    f = np.array(freqs, float)
    while np.any(f > top):
        f = np.where(f > top, f / 2, f)
    return f


def fm_bell(hz, n, *, ratio=3.5, i0=1.15, i1=0.2, itau=0.040, atk=0.002, dtau=0.140, sus=0.25, gate=None, rel=0.120):
    """FM bell: sine carrier, sine modulator at ratio x f, index i0 -> i1 (tau itau), amp decays to sus."""
    t = tt(n)
    idx = i1 + (i0 - i1) * np.exp(-t / itau)
    y = np.sin(2 * np.pi * hz * t + idx * np.sin(2 * np.pi * hz * ratio * t))
    env = (sus + (1 - sus) * np.exp(-t / dtau)) * np.clip(t / atk, 0, 1)
    if gate is not None:
        env = env * np.where(t < gate, 1.0, np.exp(-np.maximum(t - gate, 0) / (rel / 3)))
    return y * env


def make_ir(rt60, pre_ms, lp_hz, seed, hf=0.45, lo=1.15):
    """Synthetic stereo IR: decorrelated noise, 3-band exponential decay, diffusion build-up, unit energy."""
    r = rng("ir", seed)
    n = int(rt60 * 1.15 * SR)
    t = tt(n)
    chans = []
    for _ in range(2):
        w = r.standard_normal(n)
        low = sos(w, "lowpass", 400)
        high = sos(w, "highpass", 4000)
        mid = w - low - high
        ir = low * np.exp(-6.91 * t / (rt60 * lo)) + mid * np.exp(-6.91 * t / rt60) + high * np.exp(-6.91 * t / (rt60 * hf))
        ir *= 1 - np.exp(-t / 0.006)
        ir = sos(ir, "lowpass", lp_hz)
        ir[-ms(80):] *= np.linspace(1, 0, ms(80))
        ir = np.concatenate([np.zeros(ms(pre_ms)), ir])
        chans.append(ir / np.sqrt(np.sum(ir**2)))
    return np.stack(chans, 1)


def conv(x, ir):
    """Stereo in (or mono in), stereo out, trimmed to len(x)."""
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    return np.stack([signal.oaconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)


@njit(cache=True)
def _pingpong(xm, d, fb, a):
    n = xm.shape[0]
    bl = np.zeros(n)
    br = np.zeros(n)
    yl = np.zeros(n)
    yr = np.zeros(n)
    zl = 0.0
    zr = 0.0
    for i in range(n):
        dl = bl[i - d] if i >= d else 0.0
        dr = br[i - d] if i >= d else 0.0
        zl += a * (dl - zl)  # one-pole LPF inside the loop
        zr += a * (dr - zr)
        yl[i] = zl
        yr[i] = zr
        bl[i] = xm[i] + fb * zr
        br[i] = fb * zl
    return yl, yr


def pingpong(x, delay_frames, fb, lp_hz):
    a = 1 - math.exp(-2 * math.pi * lp_hz / SR)
    yl, yr = _pingpong(np.ascontiguousarray(x.mean(1)), smp(delay_frames), fb, a)
    return np.stack([yl, yr], 1)


@njit(cache=True)
def _vdelay(x, d):
    y = np.zeros_like(x)
    for i in range(x.shape[0]):
        p = i - d[i]
        j = int(math.floor(p))
        fr = p - j
        if j >= 0 and j + 1 < x.shape[0]:
            y[i] = x[j] * (1 - fr) + x[j + 1] * fr
    return y


def flanger(x, rate=0.5, lo_ms=0.8, hi_ms=3.2, phase0=0.0):
    t = tt(len(x))
    d = (lo_ms + (hi_ms - lo_ms) * 0.5 * (1 + np.sin(2 * np.pi * rate * t + phase0))) * SR / 1000
    return 0.7 * x + 0.7 * _vdelay(np.ascontiguousarray(x), d)


# --- loudness (ITU-R BS.1770-4, 48 kHz K-weighting) ------------------------------------------------------
K_SOS = np.array([
    [1.53512485958697, -2.69169618940638, 1.19839281085285, 1.0, -1.69065929318241, 0.73248077421585],
    [1.0, -2.0, 1.0, 1.0, -1.99004745483398, 0.99007225036621],
])


def kweight(x):
    return signal.sosfilt(K_SOS, x, axis=0)


def block_power(xk, win_s, hop_s, circular=False):
    """Mean-square per block (channels summed) on K-weighted audio."""
    p = np.sum(xk**2, axis=1)
    w, h = int(win_s * SR), int(hop_s * SR)
    if circular:  # windows wrap around the loop
        p = np.concatenate([p, p[: w - 1]])
        starts = np.arange(0, len(xk), h)
    else:
        starts = np.arange(0, len(p) - w + 1, h)
    c = np.concatenate([[0.0], np.cumsum(p)])
    return (c[starts + w] - c[starts]) / w


def lufs(pw):
    return -0.691 + 10 * np.log10(np.maximum(pw, 1e-20))


def integrated(xk, circular=True):
    pw = block_power(xk, 0.4, 0.1, circular)
    pw = pw[lufs(pw) > -70]
    rel = lufs(pw.mean()) - 10
    return float(lufs(pw[lufs(pw) > rel].mean()))


def loudness_range(xk, circular=True):
    pw = block_power(xk, 3.0, 0.1, circular)
    pw = pw[lufs(pw) > -70]
    pw = pw[lufs(pw) > lufs(pw.mean()) - 20]
    st = lufs(pw)
    return float(np.percentile(st, 95) - np.percentile(st, 10)), st


# --- limiter --------------------------------------------------------------------------------------------
@njit(cache=True)
def _release(g, coef):
    y = np.empty_like(g)
    cur = 1.0
    for i in range(g.shape[0]):
        if g[i] < cur:
            cur = g[i]
        else:
            cur += (g[i] - cur) * coef
        y[i] = cur
    return y


def true_peak_track(x, os=4):
    up = signal.resample_poly(x, os, 1, axis=0)
    return np.abs(up).max(axis=1)[: len(x) * os].reshape(len(x), os).max(axis=1)


def limiter(x, ceil_db=-1.3, look_ms=1.5, rel_ms=90.0):
    """Linked stereo, lookahead, 4x oversampled detection. Gain reaches the target before every true peak."""
    pk = true_peak_track(x)
    gt = np.minimum(1.0, db(ceil_db) / np.maximum(pk, 1e-12))
    la = ms(look_ms)
    g1 = minimum_filter1d(gt, size=2 * la + 1)
    g2 = uniform_filter1d(g1, size=la + 1)
    g = _release(np.minimum(g2, 1.0), 1 - math.exp(-1 / (rel_ms / 1000 * SR)))
    return x * g[:, None], g


# =====================================================================================================
# 2. Instruments
# =====================================================================================================
def pad_chord(midis, on_s, rel_s=0.40, atk_s=0.12, key="pad"):
    """Per voice: sine + triangle, two copies +-7 cents (one leaning L, one R) with slow drift (chorus)."""
    n = int((on_s + rel_s * 1.6) * SR)
    t = tt(n)
    out = np.zeros((n, 2))
    for vi, m in enumerate(midis):
        r = rng(key, m, vi)
        for side, cents in ((0, 7.0), (1, -7.0)):
            ph0, ph1, ph2 = r.uniform(0, 2 * np.pi, 3)
            drift = 2.0 * np.sin(2 * np.pi * 0.23 * t + ph1) + 1.5 * np.sin(2 * np.pi * 0.37 * t + ph2)
            f = midi_hz(m) * 2 ** ((cents + drift) / 1200)
            ph = phase(f) + ph0
            v = np.sin(ph) + 0.55 * tri_add(ph, f)
            out[:, side] += 0.92 * v
            out[:, 1 - side] += 0.14 * v
    env = np.clip(t / atk_s, 0, 1) ** 1.5
    env *= np.where(t < on_s, 1.0, np.exp(-np.maximum(t - on_s, 0) / (rel_s / 3)))
    return out * env[:, None] * 0.16


def kick(r, tail_hz=52.0, muffled=False):
    n = ms(600)
    t = tt(n)
    f = tail_hz + (150 - tail_hz) * np.exp(-t / 0.012)
    env = np.clip(t / 0.001, 0, 1) * np.exp(-np.maximum(t - 0.008, 0) / 0.160)
    y = sat(np.sin(phase(f)) * env, 1.5)
    click = np.zeros(n)
    click[: ms(3)] = r.standard_normal(ms(3)) * np.linspace(1, 0, ms(3))
    y += db(-18) * norm(filt(click, 3500, "bp", q=0.8))
    if muffled:
        y = sos(y, "lowpass", 320, 4)
    return norm(y)


def clap(r):
    n = ms(420)
    t = tt(n)
    x = np.zeros(n)
    for off, g in ((0, 0.85), (9, 0.9), (18, 1.0)):
        s = ms(off)
        seg = t[: n - s]
        x[s:] += g * r.standard_normal(n - s) * np.clip(seg / 0.001, 0, 1) * np.exp(-seg / 0.007)
    s = ms(18)
    seg = t[: n - s]
    x[s:] += 0.55 * r.standard_normal(n - s) * np.clip(seg / 0.001, 0, 1) * np.exp(-seg / 0.045)
    x = 0.6 * filt(x, 1200, "bp", q=0.8) + filt(x, 3200, "bp", q=0.7) + 0.35 * filt(x, 6500, "hp", 2)
    x = filt(x, 500, "hp", 2)
    body = np.sin(phase(200 - 25 * (1 - np.exp(-t / 0.03)))) * np.exp(-t / 0.040)
    return norm(norm(x) + db(-8) * body)


def hat(r, open_=False):
    n = ms(520 if open_ else 220)
    t = tt(n)
    metal = sum(np.sign(np.sin(2 * np.pi * f * t + r.uniform(0, 6.28))) for f in (5120, 6340, 7210, 8140, 9270, 10010))
    x = r.standard_normal(n) + 0.22 * metal
    x = filt(x, 7000, "hp", 4)
    x = x + (db(4) - 1) * filt(x, 10000, "bp", q=1.5)
    x *= np.clip(t / 0.0005, 0, 1) * np.exp(-t / (0.130 if open_ else 0.050))
    return norm(x)


def shaker(r):
    n = ms(160)
    t = tt(n)
    x = filt(r.standard_normal(n), 6500, "bp", q=0.9)
    env = np.clip(t / 0.008, 0, 1) * np.exp(-t / 0.030) + 0.5 * np.clip((t - 0.012) / 0.006, 0, 1) * np.exp(-np.maximum(t - 0.012, 0) / 0.025)
    return norm(x * env)


def rim(r):
    n = ms(120)
    t = tt(n)
    y = np.sin(2 * np.pi * 1700 * t) * np.exp(-t / 0.010) + 0.5 * np.sin(2 * np.pi * 820 * t) * np.exp(-t / 0.018)
    c = np.zeros(n)
    c[: ms(1.5)] = r.standard_normal(ms(1.5))
    return norm(y * np.clip(t / 0.0004, 0, 1) + 0.3 * norm(filt(c, 3000, "bp", q=1.0)))


def reverse_swell(midis, dur_s, key, bells=()):
    """Chord (and bells) through the hall, reversed, last dur_s kept: rises to the cut point."""
    n = int((dur_s + 1.2) * SR)
    t = tt(n)
    x = np.zeros(n)
    for m in midis:
        ph = 2 * np.pi * midi_hz(m) * t
        x += (np.sin(ph) + 0.4 * tri_add(ph, midi_hz(m))) * np.exp(-t / 0.5)
    for hz in bells:
        x += 0.6 * fm_bell(hz, n, dtau=0.3, sus=0.0)
    x *= np.clip(t / 0.003, 0, 1)
    wet = conv(x, HALL) * 1.0 + np.stack([x, x], 1) * 0.35
    y = wet[::-1][-int(dur_s * SR):]
    y = sos(y, "lowpass", 6000)
    y *= (np.linspace(0, 1, len(y)) ** 1.5)[:, None]
    y[-ms(1.5):] *= np.linspace(1, 0, ms(1.5))[:, None]
    return y / (np.max(np.abs(y)) + 1e-12)


# =====================================================================================================
# 3. Foley recipes. Each returns a list of (bus, stereo signal, loop-local start sample).
# =====================================================================================================
def burst_exc(r, n, burst_ms):
    e = np.zeros(n)
    b = max(ms(burst_ms), 8)
    e[:b] = r.standard_normal(b) * np.exp(-np.arange(b) / (b / 2.5))
    return e


def res_click(r, freqs, q, burst_ms, tau_ms, hp_hz, dur_ms=50, body=0.12, jit=0.03):
    n = ms(dur_ms)
    exc = burst_exc(r, n, burst_ms)
    f = fold(np.array(freqs) * (1 + jit * r.uniform(-1, 1, len(freqs))))
    y = resonate(exc, f, q, db(r.uniform(-4, 0, len(f)))) + body * exc
    y *= np.exp(-tt(n) / (tau_ms * r.uniform(0.9, 1.1) / 1000))
    return norm(filt(y, hp_hz, "hp", 2))


def ui_press(r, p, thock_db=-12.0):
    y = res_click(r, p.get("resonatorsHz", [5300, 9600, 10200, 13100]), p.get("q", 25), p.get("burstMs", 2.5), 1.5, p.get("hpHz", 300))
    t = tt(len(y))
    th = np.sin(2 * np.pi * p.get("thockHz", 450) * r.uniform(0.97, 1.03) * t) * np.exp(-t / (p.get("thockTauMs", 4) / 1000))
    return norm(y + db(p.get("thockDb", thock_db)) * th * np.clip(t / 0.0003, 0, 1))


def ui_release(r, p):
    return res_click(r, p.get("resonatorsHz", [4600, 7500, 9600, 14300]), p.get("q", 25), 1.5, 1.4, p.get("hpHz", 300), body=0.05)


def tab_tick(r, p=None, semis=0.0, scale=1.0):
    p = p or {}
    f = np.array(p.get("resonatorsHz", [7500, 11200, 15000]), float) * scale * 2 ** (semis / 12)
    return res_click(r, f, p.get("q", 20), p.get("burstMs", 1.5), p.get("tauMs", 2.5), p.get("hpHz", 5000), dur_ms=40)


def typing_tick(r, bands=((2400, 6400), (10000, 16000)), pool=None):
    if pool:
        lo = [f for f in pool if f < 8000]
        hi = [f for f in pool if f >= 8000]
        f = [r.choice(lo) * r.uniform(0.97, 1.03), r.choice(hi) * r.uniform(0.97, 1.03)]
    else:
        f = [r.uniform(*bands[0]), r.uniform(*bands[1])]
    return res_click(r, f, 12, 3, 2, 1000, dur_ms=30, body=0.2)


def soft_pop(r, f0=900, f1=1500, tau_ms=30):
    n = ms(140)
    t = tt(n)
    f = f0 * (f1 / f0) ** np.clip(t / 0.025, 0, 1)
    y = np.sin(phase(f)) * np.clip(t / 0.002, 0, 1) * np.exp(-t / (tau_ms / 1000))
    c = np.zeros(n)
    c[: ms(1)] = r.standard_normal(ms(1))
    y = y + db(-14) * np.sin(2 * phase(f)) * np.clip(t / 0.002, 0, 1) * np.exp(-t / (tau_ms / 1000))
    return norm(y + db(-9) * norm(filt(c, 2500, "hp", 2)))


def noise_band(r, n, fc, q, colour="pink"):
    x = pink(n, r) if colour == "pink" else white(n, r)
    return filt(x, fc, "bp", q=q)


def whoosh(r, n, peak, keys, q=1.4, colour="pink", wide=False, p_rise=2.0, p_fall=2.0):
    fc = glide(n, keys)
    env = arc(n, peak, p_rise, p_fall)
    if wide:
        y = np.stack([noise_band(r, n, fc, q, colour), noise_band(r, n, fc, q, colour)], 1) * env[:, None]
    else:
        y = noise_band(r, n, fc, q, colour) * env
    return y / (np.max(np.abs(y)) + 1e-12)


def bezier_table(x1, y1, x2, y2, n=4097):
    s = np.linspace(0, 1, n)
    return (3 * (1 - s) ** 2 * s * x1 + 3 * (1 - s) * s**2 * x2 + s**3, 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s**2 * y2 + s**3)


def per_hit(v, i, k):
    if isinstance(v, list):
        if len(v) == k:
            return v[i]
        if len(v) == 2:
            return v[0] + (v[1] - v[0]) * (i / (k - 1) if k > 1 else 0.0)
    return v


def placed(sig, level_db, pan_v, start, bus="sfx", jitter_db=0.0, r=None):
    """Normalise to level (peak re clap = 0 dB), pan, return one placement."""
    g = db(level_db + (r.uniform(-jitter_db, jitter_db) if (r is not None and jitter_db) else 0.0))
    if sig.ndim == 2:
        return (bus, pan(sig / (np.max(np.abs(sig)) + 1e-12) * g * 0.7071, pan_v / 100 if isinstance(pan_v, (int, float)) else pan_v), start)
    return (bus, pan(norm(sig) * g, pan_v / 100 if isinstance(pan_v, (int, float)) else pan_v), start)


def pan_ramp(n, a, b):
    return np.linspace(a, b, n) / 100


LEAD_EXTRA: list[dict] = []  # bells added by cue handlers (routed to the lead bus by frame)
TAIL_ONLY = {"c01", "c59", "c65", "c66"}
LEVEL_TRIM = {"c08": -2.0, "c64": 0.0, "c67": 9.0, "c24": 3.0, "c32": -3.0, "c33": 5.0, "c65": 8.5, "c01": 4.0, "b6-count1": 6.0, "b6-count2": 6.0}  # 'mix-trims'

FOLEY_TRIM = 0.0  # global foley trim vs the clap (calibrated on the reference peak hierarchy)


def render_cue(c) -> list:
    cid, typ, p = c["id"], c["type"], c.get("params", {})
    frames = c.get("frames") or [c["frame"]]
    k = len(frames)
    lv, pn = c.get("levelDb"), c.get("pan", 0)
    trim = LEVEL_TRIM.get(cid, 0.0) + FOLEY_TRIM
    if trim and lv is not None:
        lv = [v + trim for v in lv] if isinstance(lv, list) else lv + trim
    out = []

    def hp(i):
        v = per_hit(pn, i, k)
        return 0 if isinstance(v, str) else v

    if typ in ("music", "music-automation", "chime", "bloom", "buzz") or cid in TAIL_ONLY or cid == "c19":
        return out  # rendered by the music arrangement (sections, buzz, tail)
    if typ in ("click-press",):
        for i, f in enumerate(frames):
            r = rng(cid, i)
            out.append(placed(ui_press(r, p), per_hit(lv, i, k), hp(i), smp(f), jitter_db=0.8, r=r))
    elif typ == "click-release":
        r = rng(cid)
        out.append(placed(ui_release(r, p), lv, hp(0), smp(frames[0]), jitter_db=0.8, r=r))
    elif typ == "click-press+release":
        r = rng(cid, 0)
        out.append(placed(ui_press(r, p["press"]), lv[0], hp(0), smp(frames[0]), jitter_db=0.5, r=r))
        r = rng(cid, 1)
        out.append(placed(ui_release(r, p["release"]), lv[1], hp(1), smp(frames[1]), jitter_db=0.5, r=r))
    elif typ in ("tab-tick", "pitched-tab-tick"):
        for i, f in enumerate(frames):
            r = rng(cid, i)
            y = tab_tick(r, p, semis=p.get("transposeSemitones", 0), scale=p.get("resonatorScale", 1.0))
            if "tk" in p:  # the 6 ms 2 kHz 'tk'
                t = tt(len(y))
                tk = np.sin(2 * np.pi * p["tk"]["hz"] * t) * np.exp(-t / (p["tk"]["ms"] / 3000)) * np.clip(t / 0.0003, 0, 1)
                y = norm(y + db(-6) * tk)
            lvl = per_hit(lv, i, k)
            out.append(placed(y, lvl, hp(i), smp(f), jitter_db=1.0, r=r))
    elif typ in ("typing",):
        pool = p.get("resonatorsHz")
        for i, f in enumerate(frames):
            r = rng(cid, i)
            pv = r.uniform(-10, 10) if pn == "per-letter" else hp(i)
            out.append(placed(typing_tick(r, pool=pool), per_hit(lv, i, k), pv, smp(f), jitter_db=3.0, r=r))
    elif typ == "reverse-ticks":  # typing tick reversed: 3 ms swell, 1 ms decay, the peak lands on the frame
        for i, f in enumerate(frames):
            r = rng(cid, i)
            n3 = ms(3)
            env = np.concatenate([np.linspace(0, 1, n3) ** 2, np.exp(-np.arange(ms(5)) / ms(1))])
            e = r.standard_normal(len(env)) * env
            y = filt(resonate(e, [r.uniform(2400, 6400), r.uniform(10000, 16000)], 12) + 0.2 * e, 1000, "hp", 2)
            out.append(placed(y, per_hit(lv, i, k), hp(i), smp(f) - n3, jitter_db=2.0, r=r))
    elif typ == "soft-pop":
        r = rng(cid)
        f0, f1 = p.get("chirpHz", [900, 1500])
        out.append(placed(soft_pop(r, f0, f1, p.get("tauMs", 30)), lv, hp(0), smp(frames[0]), jitter_db=0.5, r=r))
    elif typ == "pop":
        r = rng(cid)
        y = soft_pop(r, *p["chirpHz"])
        tk = tab_tick(rng(cid, "tick"))
        y[: len(tk)] += db(-4) * tk
        out.append(placed(y, lv, hp(0), smp(frames[0]), r=r))
    elif typ == "reverse-air":
        r = rng(cid)
        n = smp(c["endFrame"]) - smp(c["frame"])
        env = arc(n, n // 2)
        y = noise_band(r, n, glide(n, [(0, 900), (1, 500)]), 1.0) * env
        t = tt(n)
        y = norm(y) + db(-12) * np.sin(phase(glide(n, [(0, 180), (1, 150)]))) * env
        out.append(placed(y, lv, 0, smp(c["frame"])))
    elif typ == "whoosh-wide":
        r = rng(cid)
        a, pk = smp(c["frame"]), smp(c["peakFrame"])
        n = pk - a + ms(p.get("fallMs", 60))
        y = whoosh(r, n, pk - a, [(0, 400), ((pk - a) / n, 3200), (1, 2600)], q=1.2, wide=True, p_rise=3.0, p_fall=1.5)
        m, s = (y[:, 0] + y[:, 1]) / 2, (y[:, 0] - y[:, 1]) / 2
        s *= 1 + (db(p.get("sidePeakDb", 6)) - 1) * arc(n, pk - a)
        out.append(placed(np.stack([m + s, m - s], 1), lv, 0, a))
    elif typ == "micro-whoosh":
        for i, f in enumerate(frames):
            r = rng(cid, i)
            n = ms(p.get("ms", 150))
            lo, hi = p.get("bandHz", [1000, 3000])
            if p.get("octaveUpFor") and p["order"][i] == p["octaveUpFor"]:
                lo, hi = lo * 2, hi * 2
            y = whoosh(r, n, int(n * 0.4), [(0, lo), (1, hi)], q=1.3)
            out.append(placed(y, per_hit(lv, i, k), hp(i), smp(f)))
    elif typ == "paper-lift":
        r = rng(cid)
        n = ms(p["ms"])
        y = noise_band(r, n, 3200, 0.9) * decay(n, 18, attack_ms=p["attackMs"])
        out.append(placed(y, lv, hp(0), smp(frames[0])))
    elif typ == "whoosh-low":
        r = rng(cid)
        a, pk, e = smp(c["frame"]), smp(c["peakFrame"]), smp(c["endFrame"])
        b = p["bandHz"]
        y = whoosh(r, e - a, pk - a, [(0, b[0]), ((pk - a) / (e - a), b[1]), (1, b[2])], q=1.1)
        out.append(placed(y, lv, 0, a))
    elif typ == "soft-thump":
        r = rng(cid)
        n = ms(260)
        t = tt(n)
        y = np.sin(phase(glide(n, [(0, 110), (0.25, 80), (1, 77.8)]))) * decay(n, p["tauMs"], 1.0)
        cl = np.zeros(n)
        cl[: ms(2)] = r.standard_normal(ms(2))
        y = norm(y) + db(p["clickDb"]) * norm(filt(cl, p["clickHz"], "bp", q=1.0))
        out.append(placed(y, lv, 0, smp(frames[0])))
    elif typ == "felt-thock":
        r = rng(cid)
        n = ms(160)
        y = np.sin(phase(glide(n, [(0, 180), (0.3, 133), (1, 130.8)]))) * decay(n, p["tauMs"], 1.0)
        nz = noise_band(r, n, 900, 0.6) * decay(n, 12, 2.0)
        out.append(placed(norm(y) + 0.6 * norm(nz), lv, hp(0), smp(frames[0])))
    elif typ == "data-fill":
        r = rng(cid)
        a, e = smp(c["frame"]), smp(c["endFrame"])
        # glide follows the progress bar (FINAL S3): eased, with 2 f stalls at 40% (f116-117) and 75% (f125-126)
        kf = PchipInterpolator([108, 116, 117.9, 125, 126.9, 132], [0, 0.40, 0.40, 0.75, 0.75, 1.0])
        fr = c["frame"] + np.arange(e - a) / SPF
        prog = kf(np.clip(fr, 108, 132))
        f = p["glideHz"][0] * (p["glideHz"][1] / p["glideHz"][0]) ** prog
        y = np.sin(phase(f)) * arc(e - a, int((e - a) * 0.85), 0.6, 1.0)
        y += 0.12 * np.sin(2 * phase(f))
        out.append(placed(y, p["glideDb"], hp(0), a))
        for i, fr_ in enumerate(p["ticks"]):
            rr = rng(cid, "tick", i)
            yy = res_click(rr, [rr.uniform(9000, 10500), rr.uniform(10500, 12000)], 20, 1.0, 1.5, 5000, dur_ms=25)
            out.append(placed(yy, lv, hp(0), smp(fr_), jitter_db=1.5, r=rr))
    elif typ == "down-swish":
        r = rng(cid)
        n = ms(p["ms"])
        y = whoosh(r, n, int(n * 0.2), [(0, p["bandHz"][0]), (1, p["bandHz"][1])], q=1.4, colour="white", p_rise=1.0, p_fall=2.5)
        out.append(placed(y, lv, 0, smp(frames[0])))
    elif typ == "suck-in-whoosh":
        r = rng(cid)
        a, pk = smp(c["frame"]), smp(c["peakFrame"])
        n = pk - a + ms(p["decayAfterPeakMs"])
        y = whoosh(r, n, pk - a, [(0, 300), ((pk - a) / n, 5000), (1, 3500)], q=1.1, colour="white", p_rise=3.0, p_fall=1.2)
        out.append(placed(y, lv, 0, a))
    elif typ == "thwip-slam":
        r = rng(cid)
        a, hit = smp(c["frame"]), smp(c["peakFrame"])
        n = ms(220)
        t = tt(n)
        s = np.sin(phase(glide(n, [(0, 900), (ms(80) / n, 280), (1, 250)]))) * decay(n, p["tauMs"], 0.8)
        pre = hit - a
        nz = noise_band(r, pre + ms(p["noiseMs"]), glide(pre + ms(p["noiseMs"]), [(0, 3000), (1, 800)]), 1.2)
        nz *= arc(len(nz), pre, 2.0, 1.5)
        y = np.zeros(pre + n)
        y[: len(nz)] += 0.45 * norm(nz)
        y[pre:] += norm(s)
        out.append(placed(y, lv, 0, a))
    elif typ == "micro-ticks":
        for i, f in enumerate(frames):
            r = rng(cid, i)
            y = res_click(r, [r.uniform(12000, 13200), r.uniform(13800, 15000)], 20, 1.0, 1.5, 6000, dur_ms=20)
            out.append(placed(y, lv, r.uniform(-8, 8), smp(f), jitter_db=1.5, r=r))
    elif typ == "clack":
        pp = CUE["c27"]["params"] if "recipe" in p else p
        for i, f in enumerate(frames):
            r = rng(cid, i)
            y = res_click(r, pp["resonatorsHz"], pp["q"], pp["burstMs"], 6.0, 150, dur_ms=80, body=0.3)
            t = tt(len(y))
            y = norm(y + db(-4) * np.sin(2 * np.pi * pp["sineHz"] * r.uniform(0.97, 1.03) * t) * np.exp(-t / (pp["sineTauMs"] / 1000)))
            out.append(placed(y, per_hit(lv, i, k), hp(i), smp(f), jitter_db=0.8, r=r))
    elif typ in ("soft-air-split", "soft-air"):
        pp = CUE["c28"]["params"]
        parts = [(-50, 0), (50, 1)] if typ == "soft-air-split" else [(0, 0)]
        for pv, i in parts:
            r = rng(cid, i)
            n = ms(pp["ms"])
            y = whoosh(r, n, int(n * 0.15), [(0, pp["bandHz"][0]), (1, pp["bandHz"][1])], q=1.0, p_rise=1.0, p_fall=2.0)
            out.append(placed(y, lv, pv, smp(c["frame"]) + i * SPF))
    elif typ == "bloop":
        r = rng(cid)
        n = ms(300)
        t = tt(n)
        f = glide(n, [(0, 520), (ms(90) / n, 780), (1, 780)])
        env = np.clip(t / (p["attackMs"] / 1000), 0, 1) * np.exp(-np.maximum(t - p["attackMs"] / 1000, 0) / (p["tauMs"] / 1000))
        ph = phase(f)
        out.append(placed((np.sin(ph) + db(p["h2Db"]) * np.sin(2 * ph)) * env, lv, 0, smp(frames[0])))
    elif typ == "rewrite":
        rt, ty = p["reverseTicks"], p["typingTicks"]
        out += render_cue({"id": cid + "r", "type": "reverse-ticks", "frame": rt["frames"][0], "frames": rt["frames"], "levelDb": rt["levelDb"], "pan": 0})
        out += render_cue({"id": cid + "t", "type": "typing", "frame": ty["frames"][0], "frames": ty["frames"], "levelDb": ty["levelDb"], "pan": "per-letter", "params": {}})
    elif typ == "micro-zip":
        r = rng(cid)
        n = ms(p["ms"])
        y = whoosh(r, n, ms(12), [(0, p["bandHz"][0]), (1, p["bandHz"][1])], q=2.0, colour="white", p_rise=1.0, p_fall=1.5)
        y *= 1 + 0.5 * np.sign(np.sin(2 * np.pi * 180 * tt(n)))  # zipper teeth
        out.append(placed(y, lv, 0, smp(frames[0])))
    elif typ == "ratchet-ticks":
        for i, f in enumerate(frames):
            r = rng(cid, i)
            base = np.array(p["resonatorsHz"], float) * 2 ** (i * p["semitoneUpPerTick"] / 12)
            y = res_click(r, fold(base), 14, r.uniform(*p["ms"]) * 0.6, r.uniform(3, 5) / 2, p["hpHz"], dur_ms=30, body=0.35)
            lvl = lv[0] + (lv[1] - lv[0]) * i / (k - 1)
            out.append(placed(y, lvl, 15 if i % 2 == 0 else -15, smp(f), jitter_db=0.7, r=r))
    elif typ == "noise-riser":
        r = rng(cid)
        a, e = smp(c["frame"]), smp(p["cutAt"])
        n = e - a
        fc = glide(n, [(0, p["bandHz"][0]), (1, p["bandHz"][1])])
        y = np.stack([noise_band(r, n, fc, p["q"], "white"), noise_band(r, n, fc, p["q"], "white")], 1)
        y /= np.max(np.abs(y))
        y *= db(np.linspace(p["levelDb"][0], p["levelDb"][1], n) + trim)[:, None] * 0.7071
        duck = np.zeros(n)  # override riser-duck: -6 dB for 15 ms under each c31 tick inside the riser
        for f in CUE["c31"]["frames"]:
            s0 = smp(f) - a - ms(1.5)
            if 0 <= s0 < n:
                seg = np.concatenate([np.linspace(0, 1, ms(1)), np.ones(ms(15)), np.linspace(1, 0, ms(4))])[: n - s0]
                duck[s0 : s0 + len(seg)] = np.maximum(duck[s0 : s0 + len(seg)], seg)
        y *= db(-6.0 * duck)[:, None]
        y[-ms(5):] *= np.linspace(1, 0, ms(5))[:, None]
        out.append(("s1post", y, a))
    elif typ == "impact":
        r = rng(cid)
        n = ms(1400)
        t = tt(n)
        s = np.sin(phase(glide(n, [(0, 60), (ms(400) / n, 35), (1, 33)]))) * decay(n, p["tauMs"], 1.0)
        nz = filt(r.standard_normal(n), p["noiseHpHz"], "hp", 2) * decay(n, p["noiseTauMs"], 1.0)
        IMP = make_ir(p["irSeconds"], 8, 7000, "impact")
        nz = conv(nz, IMP)[:, :] * 0.8 + np.stack([nz, nz], 1) * 0.5
        y = np.stack([s, s], 1) * 0.7071 + db(-16) * nz / np.max(np.abs(nz))
        y /= np.max(np.abs(y))
        out.append(("s2post", y * db(lv) * 0.7071, smp(frames[0])))
    elif typ == "whoomp":
        r = rng(cid)
        n = ms(p["attackMs"] + p["decayMs"] * 1.3)
        y = whoosh(r, n, ms(p["attackMs"]), [(0, p["bandHz"][0]), (1, p["bandHz"][1])], q=0.9, wide=True, p_rise=1.0, p_fall=1.6)
        out.append(placed(y, lv, 0, smp(frames[0])))
    elif typ == "whoosh-long":
        r = rng(cid)
        a, pk = smp(c["frame"]), smp(c["peakFrame"])
        n = int((pk - a) / p["rise"])
        y = whoosh(r, n, pk - a, [(0, p["bandHz"][0]), ((pk - a) / n, p["bandHz"][1]), (1, 2500)], q=1.3, p_rise=2.5, p_fall=1.5)
        y = np.stack([flanger(y, p["flangerHz"]), flanger(y, p["flangerHz"], phase0=1.2)], 1)
        out.append(placed(y, lv, pan_ramp(n, pn[0], pn[1]), a))
    elif typ == "slide-air":
        r = rng(cid)
        a = smp(c["frame"])
        n = ms(p["decayMs"] * 1.6)
        y = noise_band(r, n, glide(n, [(0, p["bandHz"][1]), (1, p["bandHz"][0])]), 1.0) * decay(n, p["decayMs"] / 3, 25)
        out.append(placed(y, lv, pan_ramp(n, pn[0], pn[1]), a))
    elif typ in ("odometer-deflate", "odometer"):
        start_semi = 0.0 if typ == "odometer-deflate" else -(12 - 1) + p.get("transposeSemitones", -2)
        for i, f in enumerate(frames):
            r = rng(cid, i)
            base = np.array([3200.0, 4800.0]) * 2 ** ((start_semi - i) / 12)  # override odometer-band
            y = res_click(r, base, 18, 1.0, 1.8, 1500, dur_ms=25)
            out.append(placed(y, lv, 0, smp(f), jitter_db=1.0, r=r))
        if "deflate" in p:
            r = rng(cid, "deflate")
            dfl = p["deflate"]
            n = ms(dfl["ms"])
            y = np.sin(phase(glide(n, [(0, dfl["sineHz"][0]), (1, dfl["sineHz"][1])]))) * arc(n, ms(20), 1.0, 1.2)
            out.append(placed(y, dfl["levelDb"], 0, smp(c["frame"])))
    elif typ == "whoosh-short":
        r = rng(cid)
        pk = smp(c["peakFrame"])
        n = ms(p.get("ms", 250)) if "ms" in p else smp(c["endFrame"]) - smp(c["frame"])
        n = min(n, ms(400))
        a = pk - int(n * 0.6)
        b = p["bandHz"]
        y = whoosh(r, n, pk - a, [(0, b[0]), ((pk - a) / n, b[1]), (1, b[2])], q=p.get("q", 2))
        out.append(placed(y, lv, pan_ramp(n, pn[0], pn[1]), a))
    elif typ == "spinner-ticks":
        for i, f in enumerate(frames):
            r = rng(cid, i)
            y = res_click(r, [r.uniform(7000, 8000), r.uniform(11000, 12500)], 16, 1.0, 1.5, p["hpHz"], dur_ms=20)
            out.append(placed(y, lv, 0, smp(f), jitter_db=1.0, r=r))
    elif typ == "swish":
        for i, f in enumerate(frames):
            r = rng(cid, i)
            n = ms(p["ms"])
            y = whoosh(r, n, 3 * SPF, [(0, p["bandHz"][0]), (3 * SPF / n, p["bandHz"][1]), (1, 2500)], q=1.4, p_rise=2.5, p_fall=1.5)
            out.append(placed(y, lv, hp(i), smp(f)))
    elif typ == "pitched-snap":  # tab tick part; the FM blips are the lead (music bars)
        for i, f in enumerate(frames):
            r = rng(cid, i)
            out.append(placed(tab_tick(r, semis=i), lv - 2, hp(i), smp(f), jitter_db=0.8, r=r))
    elif typ == "rise-air":
        r = rng(cid)
        a, e = smp(c["frame"]), smp(c["endFrame"])
        n = e - a + ms(40)
        y = whoosh(r, n, e - a, [(0, p["bandHz"][0]), (1, p["bandHz"][1])], q=1.0, p_rise=2.0, p_fall=1.0)
        out.append(placed(y, lv, 0, a))
    elif typ == "deep-thock":
        r = rng(cid)
        n = ms(400)
        s = np.sin(phase(glide(n, [(0, 150), (0.3, 100), (1, 98)]))) * decay(n, p["tauMs"], 1.0)
        cl = np.zeros(n)
        cl[: ms(p["clickMs"])] = r.standard_normal(ms(p["clickMs"]))
        out.append(placed(norm(s) + db(-10) * norm(filt(cl, p["clickHz"], "bp", q=1.0)), lv, 0, smp(frames[0])))
    elif typ == "airy-outward-whoosh":
        r = rng(cid)
        a, pk, e = smp(c["frame"]), smp(c["peakFrame"]), smp(c["endFrame"])
        n = e - a + ms(120)
        fc = glide(n, [(0, p["bandHz"][0]), ((pk - a) / n, 4000), (1, p["bandHz"][1])])
        com = noise_band(r, n, fc, 1.1)
        ind = np.stack([noise_band(r, n, fc, 1.1), noise_band(r, n, fc, 1.1)], 1)
        w = np.linspace(0, np.pi / 2, n)
        y = np.cos(w)[:, None] * com[:, None] + np.sin(w)[:, None] * ind
        y *= arc(n, pk - a, 2.0, 1.4)[:, None]
        out.append(placed(y, lv, 0, a))
    elif typ == "glints":
        notes = [3136.0, 3729.3, 4186.0, 4978.0, 5587.7, 6271.9, 4698.6]  # Eb pentatonic partials (G shard: D8)
        for i, f in enumerate(frames):
            r = rng(cid, i)
            n = ms(p["ms"] * 3)
            t = tt(n)
            y = np.sin(2 * np.pi * notes[i] * t) * np.clip(t / 0.0008, 0, 1) * np.exp(-t / (p["ms"] / 1000 / 2.3))
            out.append(placed(y, lv, hp(i), smp(f), jitter_db=1.0, r=r))
    elif typ == "paper-puff":
        r = rng(cid)
        n = ms(p["ms"])
        y = noise_band(r, n, glide(n, [(0, 1400), (1, 3000)]), 0.8) * arc(n, int(n * 0.35), 1.5, 2.0)
        out.append(placed(y, lv, 0, smp(frames[0])))
    else:
        raise KeyError(f"no recipe for cue {cid} type {typ}")
    return out


# =====================================================================================================
# 4. Arrangement
# =====================================================================================================
HALL = make_ir(2.4, 18, 6500, "hall")
PLATE = make_ir(1.5, 12, 8000, "plate", hf=0.55)
ROOM = make_ir(0.24, 10, 9000, "room", hf=0.6)
SFX_ROOM = make_ir(0.35, 6, 9000, "sfxroom", hf=0.5)


# Per-bar mix levels (dB). Calibrated against the reference's section loudness and band balance
# (audio.md 5: intro about 7 LU under the drop, groove bar about 3 LU under, end card about 5 LU under).
PAD_DB = {1: -16, 2: -15.5, 3: -14.8, 4: -9.5, 5: -12, 6: -12, 7: -12, 8: -12, 9: -15.5}
SUB_DB = {1: -14.6, 2: -12.6, 3: -11.2, 4: -11, 5: -8.5, 6: -8.5, 7: -8.5, 8: -8.5, 9: -19.5}  # 5-8: -1 dB since the kick tails sum in phase (override kick-polarity)
DRUM_BAR_DB = {3: -3.5, 5: 1.0, 6: 1.0, 7: 1.0, 8: 1.0}
HAT_DB = -13.0
PAD_HALL = {1: 1.4, 2: 1.0}  # hall send on the pad: wider, airier intro (reference intro side/mid about -3 dB)


class Timeline:
    """One stereo buffer covering loops -1, 0, +1. add() places an event in all three loops."""

    def __init__(self):
        self.x = np.zeros((LN, 2))

    def add(self, sig, start):
        if sig.ndim == 1:
            sig = pan(sig, 0.0)
        for k in range(LOOPS):
            s = start + k * N
            a, b = max(s, 0), min(s + len(sig), LN)
            if b > a:
                self.x[a:b] += sig[a - s : b - s]


def periodic(curve_loop):
    """Tile a one-loop automation curve over the three loops."""
    return np.tile(curve_loop, LOOPS)


FR = design_frame(np.arange(N) / SPF)  # design frame of every loop-local sample


def ramp_exp(fr, a, b, v0, v1):
    """Exponential value ramp v0 -> v1 over frames [a, b] (inside only)."""
    p = np.clip((fr - a) / max(b - a, 1e-9), 0, 1)
    return v0 * (v1 / v0) ** p


def sec_of(frame):
    if 0 <= frame < STUTTER:
        return 1
    if DROP <= frame < HARD_STOP:
        return 2
    return None


def drums_of(bar):
    b = BARS[bar - 1]
    rel = b.get("drumLevelsDb", {})
    ev = []
    for name, pat in b.get("drums", {}).items():
        for i, ch in enumerate(pat):
            if ch != "x":
                continue
            f = b["from"] + i * S16
            if name.startswith("hat"):
                lvl = HAT_DB + rel.get(name, 0)
            elif name in ("rim", "shaker"):
                lvl = rel.get(name, {"rim": -16, "shaker": -18}[name])
            else:
                lvl = {"kick": 0, "kickMuffled": -2, "clap": 0, "clapFlam": 0}[name]
            ev.append((f, name, lvl, bar))
    return ev


DRUMS = sorted(e for bar in range(1, 10) for e in drums_of(bar))
KICKS = [f for f, name, _, _ in DRUMS if name.startswith("kick")]


def bar_root(frame):
    return BARS[int(frame // 120)]["bass"]["midi"]


def duck_curve(depth_db, bars, release_ms=100):
    """Sidechain gain (loop) from the kicks inside `bars`: 5 ms attack, exp release."""
    d = np.zeros(N)
    tau = release_ms / 1000 / 2.5
    for f in KICKS:
        if int(f // 120) + 1 not in bars:
            continue
        s = smp(f)
        n = min(ms(release_ms * 4), N - s)
        t = tt(n)
        d[s : s + n] = np.maximum(d[s : s + n], depth_db * np.clip(t / 0.005, 0, 1) * np.exp(-np.maximum(t - 0.005, 0) / tau))
    return db(-d)


def gate16():
    """Soft 16th gate (bars 1-4): on 60% of each 16th, -6 dB (bar 4: -9 dB) otherwise, 5 ms ramps."""
    ph = (np.arange(N) / (S16 * SPF)) % 1.0
    raw = (ph < 0.6).astype(float)
    raw = uniform_filter1d(raw, ms(5), mode="wrap")
    depth = np.ones(N)
    for bi in range(4):
        pd = BARS[bi]["pad"].get("gateDb")
        if pd is not None:
            depth[smp(BARS[bi]["from"]) : smp(BARS[bi]["to"] + 1)] = db(pd)
    return depth + (1 - depth) * np.where(depth < 1, raw, 1.0)


def pad_lp_curve():
    """Pad LPF: 3.5 kHz in the intro (to f240) and on the end card, 2.2 kHz in bars 3-8 (override pad-intro-endcard);
    flood bloom dips to 800 Hz at f910 then opens to 6 kHz by f924, relaxes to 3.5 kHz by f990."""
    fc = np.full(N, 2200.0)
    fc[FR < 240] = 3500.0
    m = (FR >= 240) & (FR < 246)
    fc[m] = ramp_exp(FR[m], 240, 246, 3500, 2200)
    fa, fb = FLOOD["from"], FLOOD["to"]
    m = (FR >= fa - 6) & (FR < fa)
    fc[m] = ramp_exp(FR[m], fa - 6, fa, 2200, 800)
    m = (FR >= fa) & (FR < fb)
    fc[m] = ramp_exp(FR[m], fa, fb, 800, 6000)
    m = (FR >= fb) & (FR < fb + 16)
    fc[m] = 6000
    m = (FR >= fb + 16) & (FR < 990)
    fc[m] = ramp_exp(FR[m], fb + 16, 990, 6000, 3500)
    fc[FR >= 990] = 3500.0
    return fc


def pad_hp_curve():
    """Pad HPF (12 dB/oct): 160 Hz in the intro (f0-f240) and on the end card (from f960), off in bars 3-8."""
    fc = np.full(N, 5.0)
    fc[(FR < 240) | (FR >= 960)] = 160.0
    m = (FR >= 240) & (FR < 246)
    fc[m] = ramp_exp(FR[m], 240, 246, 160, 5)
    m = (FR >= 952) & (FR < 960)
    fc[m] = ramp_exp(FR[m], 952, 960, 5, 160)
    return fc


def bus_curves():
    """Music bus filters per loop sample: hp (24 dB/oct), lp_build (12 dB/oct), lp_radio (48 dB/oct)."""
    off_hp, off_lp = 5.0, 0.49 * SR
    hp = np.full(N, off_hp)
    lpb = np.full(N, off_lp)
    lpr = np.full(N, off_lp)

    def seg(arr, a, b, fn):
        m = (FR >= a) & (FR < b)
        arr[m] = fn(FR[m])

    # bar 2 drop-out: lows gone in 60 ms, instant (3 ms) re-entry on f210
    a, b = DROPOUT["from"], DROPOUT["to"]
    hz = DROPOUT["params"]["hz"]
    seg(hp, a, a + 3.6, lambda f: ramp_exp(f, a, a + 3.6, 20, hz))
    seg(hp, a + 3.6, b, lambda f: hz)
    seg(hp, b, b + 0.18, lambda f: ramp_exp(f, b, b + 0.18, hz, off_hp))
    # bar 4 build: band-limit closes over 8 f from f360, holds, then both filters open log f420-f450
    a, b = BANDLIMIT["from"], BANDLIMIT["to"] + 1
    h0, l0 = BANDLIMIT["params"]["hpfHz"], BANDLIMIT["params"]["lpfHz"]
    seg(hp, a, a + 8, lambda f: ramp_exp(f, a, a + 8, 20, h0))
    seg(lpb, a, a + 8, lambda f: ramp_exp(f, a, a + 8, 20000, l0))
    seg(hp, a + 8, b, lambda f: h0)
    seg(lpb, a + 8, b, lambda f: l0)
    oa, ob = OPENUP["from"], OPENUP["to"] + 1
    seg(hp, oa, ob, lambda f: ramp_exp(f, oa, ob, *OPENUP["params"]["hpfHz"]))
    seg(lpb, oa, ob, lambda f: ramp_exp(f, oa, ob, *OPENUP["params"]["lpfHz"]))
    # suck-outs: HPF 400 Hz sucked in over 40 ms, instant return
    for so in (SUCK1, SUCK2):
        a, b, hz = so["from"], so["to"], so["params"]["hz"]
        seg(hp, a, a + 2.4, lambda f: ramp_exp(f, a, a + 2.4, 20, hz))
        seg(hp, a + 2.4, b, lambda f: hz)
        seg(hp, b, b + 0.18, lambda f: ramp_exp(f, b, b + 0.18, hz, off_hp))
    # bar 7 radio: HPF 300 Hz, LPF 3 kHz (48 dB/oct), 1 f in, 3 ms out
    a, b = RADIO["from"], RADIO["to"]
    lo, hi = RADIO["params"]["lowHz"], RADIO["params"]["highHz"]
    seg(hp, a, a + 1, lambda f: ramp_exp(f, a, a + 1, 20, lo))
    seg(lpr, a, a + 1, lambda f: ramp_exp(f, a, a + 1, 20000, hi))
    seg(hp, a + 1, b, lambda f: lo)
    seg(lpr, a + 1, b, lambda f: hi)
    seg(hp, b, b + 0.18, lambda f: ramp_exp(f, b, b + 0.18, lo, off_hp))
    seg(lpr, b, b + 0.18, lambda f: ramp_exp(f, b, b + 0.18, hi, off_lp))
    return periodic(hp), periodic(lpb), periodic(lpr)


def section_window(sec):
    """1 inside the section of every loop, hard 5 ms edges (the cuts at f450, f480, f1044)."""
    w = np.zeros(N)
    if sec == 1:
        a, b = 0, smp(STUTTER)
        w[a:b] = 1
        w[b - ms(2.5) : b] = np.linspace(1, 0, ms(2.5))
    else:
        a, b = smp(DROP), smp(HARD_STOP)
        w[a : b + ms(5)] = 1
        w[b : b + ms(5)] = np.linspace(1, 0, ms(5))
    return periodic(w)


def sub_line(notes, f_start, f_end, wide_until=None, bloom=None, key="sub"):
    """Legato sine sub (+H2, soft drive) with 25 ms glides; optional wide phase-offset pair (bars 1-2)."""
    a, e = smp(f_start), smp(f_end) + ms(5)
    n = e - a
    fr = design_frame((a + np.arange(n)) / SPF)  # design frame of every output sample
    lf = np.full(n, np.log2(midi_hz(notes[0][1])))
    gdb = np.full(n, notes[0][2])
    for (f0, m0, l0), (f1, m1, l1) in zip(notes, notes[1:]):
        g = np.clip((fr - f1) / (0.025 * FPS), 0, 1)
        lf = lf + g * (np.log2(midi_hz(m1)) - np.log2(midi_hz(m0)))
        gg = np.clip((fr - f1) / (0.030 * FPS), 0, 1)
        gdb = gdb + gg * (l1 - l0)
    f = 2**lf
    ph = phase(f)
    t = tt(n)
    delta = np.zeros(n)
    if wide_until:  # L/R phase offset 0 at both ends: about +-2.5 cents of detune, corr about 0.4 mid-way
        m = fr < wide_until
        delta[m] = 0.58 * np.sin(np.pi * (fr[m] - f_start) / (wide_until - f_start))
    amp = db(gdb) * np.clip(t / 0.008, 0, 1)
    if bloom is not None:
        bf, bdb = bloom
        tb = (fr - bf) / FPS
        amp *= 1 + (db(bdb) - 1) * np.where(tb >= 0, np.clip(tb / 0.02, 0, 1) * np.exp(-np.maximum(tb, 0) / 0.4), 0)
    chans = []
    for sgn in (1, -1):
        p = ph + sgn * delta
        y = np.sin(p) + db(-8) * np.sin(2 * p)
        chans.append(sat(y * amp * 0.9, 1.3))
    y = sos(np.stack(chans, 1), "lowpass", 180, 2)
    return y, a


def lead_notes():
    """All bells on the lead bus: bars' lead lists + resolve chime dyad + override bell-f645."""
    notes = []
    for b in BARS:
        for nn in b["lead"]:
            notes.append(dict(frame=nn["frame"], hz=nn["hz"], level=nn.get("levelDb", -8), role=nn["role"], until=nn.get("until")))
    # embedded bells in foley cues must match the bars (render once)
    for cid in ("c23", "c27", "c30", "c50"):
        bl = CUE[cid]["params"]["bell"] if "bell" in CUE[cid]["params"] else None
        fr = bl["frame"] if bl and "frame" in bl else CUE[cid]["frame"]
        assert any(abs(x["frame"] - fr) < 0.01 and abs(x["hz"] - bl["hz"]) < 0.5 for x in notes), cid
    rw = CUE["c30a"]["params"]["bell"]
    assert any(x["frame"] == rw["frame"] and abs(x["hz"] - rw["hz"]) < 0.5 for x in notes)
    # landing blips use the c48 blip voice and pans
    c48 = CUE["c48"]
    for i, f in enumerate(c48["frames"]):
        x = next(x for x in notes if x["frame"] == f)
        assert abs(x["hz"] - c48["params"]["notes"][i]["hz"]) < 0.5
        x.update(role="blip", level=c48["levelDb"], pan=c48["pan"][i] * 0.6)
    # resolve chime: Bb5 + D6 dyad on f780 replaces the single Bb5 lead note there
    ch = CUE["b7-resolve"]
    notes = [x for x in notes if x["frame"] != ch["frame"]]
    for i, bl in enumerate(ch["params"]["bells"]):
        notes.append(dict(frame=ch["frame"], hz=bl["hz"], level=ch["levelDb"] - 3, role="chime", until=None, pan=(-12, 12)[i]))
    notes.append(dict(frame=645, hz=midi_hz(87), level=-14, role="commit f645 (override)", until=None))
    notes.sort(key=lambda x: x["frame"])
    return notes


def render_bell(x, next_frame):
    dur_f = (x["until"] or min(next_frame, x["frame"] + 30)) - x["frame"]
    gate = max((smp(x["frame"] + dur_f) - smp(x["frame"])) / SPF, 6) / FPS
    if x["role"] == "blip":
        y = fm_bell(x["hz"], ms(900), i0=1.0, itau=0.040, dtau=0.070, sus=0.0)
    elif x["role"] == "chime":
        y = fm_bell(x["hz"], ms(1200), dtau=0.200, sus=0.0)
    else:
        y = fm_bell(x["hz"], int((gate + 0.6) * SR), gate=gate)
        y += db(-9) * fm_bell(x["hz"] * 2 ** (5 / 1200), int((gate + 0.6) * SR), gate=gate, i0=0.7)
    y = norm(y) * db(x["level"])
    return pan(y, x.get("pan", 0) / 100)


def build_sections(foley_music):
    """Render the music sections 1 (f0-f450) and 2 (f480-f1044), each through its own FX then windowed."""
    hp_c, lpb_c, lpr_c = bus_curves()
    gate = periodic(gate16())
    pad_lp = periodic(pad_lp_curve())
    pad_hp = periodic(pad_hp_curve())
    duck_sub = periodic(duck_curve(3.0, range(3, 10)))
    duck_pad = periodic(duck_curve(2.0, range(5, 9)))
    notes = lead_notes()
    music = np.zeros((LN, 2))
    grain_src = None
    for sec in (1, 2):
        pad_t, sub_t, drum_t, room_t, lead_t, pre_t, post_t = (Timeline() for _ in range(7))
        # --- pad ---------------------------------------------------------------------------------------
        segs = []
        for b in BARS:
            a, e = b["from"], b["to"] + 1
            if sec_of(a) != sec:
                continue
            e = min(e, STUTTER) if sec == 1 else min(e, HARD_STOP)
            lvl = PAD_DB[b["bar"]]
            if b["bar"] == 2:
                segs += [(a, REENTRY, b["voicing"], lvl, 0.12), (REENTRY, e, b["voicing"], lvl + 1.5, 0.03)]
            else:
                segs.append((a, e, b["voicing"], lvl, 0.12))
        for a, e, v, lvl, atk in segs:
            y = pad_chord(v, (smp(e) - smp(a)) / SR, atk_s=atk, key=f"pad{a}") * db(lvl + 10)  # output time: holds stretch it
            pad_t.add(y, smp(a))
        # --- sub ---------------------------------------------------------------------------------------
        sub_lvl = SUB_DB
        if sec == 1:
            nl = [(b["from"], b["bass"]["midi"], sub_lvl[b["bar"]]) for b in BARS[:4]]
            y, a = sub_line(nl, 0, STUTTER, wide_until=240)
        else:
            nl = [(b["from"], b["bass"]["midi"], sub_lvl[b["bar"]]) for b in BARS[4:]]
            y, a = sub_line(nl, DROP, HARD_STOP, bloom=(SLAM, 4.0))
        sub_t.add(y, a)
        # --- drums -------------------------------------------------------------------------------------
        for i, (f, name, lvl, bar) in enumerate(DRUMS):
            if sec_of(f) != sec:
                continue
            r = rng("drum", name, f)
            lvl = lvl + DRUM_BAR_DB.get(bar, 0.0)
            if name.startswith("kick"):
                y = kick(r, tail_hz=min(midi_hz(bar_root(f)), 66), muffled=name == "kickMuffled")
                # kick tail in polarity with the sub under it (override kick-polarity); zero-phase LPF, a causal
                # one would turn the 60 Hz tail about 90 degrees and make the sign a coin toss
                seg = slice(N + smp(f) + ms(20), N + smp(f) + ms(200))
                yl = signal.sosfiltfilt(signal.butter(4, 110, "lowpass", fs=SR, output="sos"), y)[ms(20) : ms(200)]
                y *= np.sign(np.dot(yl, sub_t.x[seg, 0])) or 1.0
                drum_t.add(pan(y * db(lvl), 0), smp(f))
            elif name.startswith("clap"):
                if name == "clapFlam":
                    g = clap(rng("flam", f)) * db(-7)
                    drum_t.add(pan(g, -0.1), smp(f) - ms(24))
                    room_t.add(pan(g, -0.1), smp(f) - ms(24))
                y = clap(r) * db(lvl + r.uniform(-0.5, 0.5))
                drum_t.add(pan(y, 0.03), smp(f))
                room_t.add(pan(y, 0.03), smp(f))
            elif name.startswith("hat"):
                y = hat(r, open_=name == "hatOpen") * db(lvl + r.uniform(-1.5, 1.5))
                pv = r.uniform(-0.15, 0.15)
                drum_t.add(pan(y, pv), smp(f))
                room_t.add(pan(y * 0.3, pv), smp(f))
            elif name == "shaker":
                drum_t.add(pan(shaker(r) * db(lvl + r.uniform(-1.5, 1.5)), 0.2), smp(f))
            elif name == "rim":
                y = rim(r) * db(lvl)
                drum_t.add(pan(y, -0.15), smp(f))
                room_t.add(pan(y, -0.15), smp(f))
        # --- lead --------------------------------------------------------------------------------------
        for i, x in enumerate(notes):
            if sec_of(x["frame"]) != sec:
                continue
            nxt = next((y["frame"] for y in notes[i + 1 :] if y["frame"] > x["frame"]), x["frame"] + 30)
            lead_t.add(render_bell(x, nxt), smp(x["frame"]))
        # --- musical foley (swells, riser, impact, bloom) -------------------------------------------------
        for bus, y, s in foley_music:
            if bus == f"s{sec}pre":
                pre_t.add(y, s)
            elif bus == f"s{sec}post":
                post_t.add(y, s)
        if sec == 1:  # c19 reverse Eb/G swell into the f210 re-entry (after the bus HPF, override c19-routing)
            c = CUE["c19"]
            n = smp(c["endFrame"]) - smp(c["frame"])
            y = reverse_swell(BARS[1]["voicing"], n / SR, "c19")
            y = sos(y, "highpass", 150, 2) * db(c["levelDb"]) * 0.7071 / np.max(np.abs(y))
            post_t.add(y, smp(c["frame"]))
        else:  # c52 flood bloom: Eb4 + Bb4 swell (wide) + rising HP 6 kHz shimmer
            c = CUE["c52"]
            p = c["params"]
            n = ms(1600)
            t = tt(n)
            env = np.clip(t / (p["attackMs"] / 1000), 0, 1) * np.exp(-np.maximum(t - p["attackMs"] / 1000, 0) / (p["tauMs"] / 1000))
            L = sum(np.sin(2 * np.pi * hz * 2 ** (5 / 1200) * t) for hz in p["swellHz"])
            R = sum(np.sin(2 * np.pi * hz * 2 ** (-5 / 1200) * t + 0.7) for hz in p["swellHz"])
            y = np.stack([L, R], 1) * env[:, None]
            y = y / np.max(np.abs(y)) * db(c["levelDb"]) * 0.7071
            pre_t.add(y, smp(c["frame"]))
            r = rng("c52", "shimmer")
            m = smp(c["endFrame"]) - smp(c["frame"])
            sh = np.stack([filt(r.standard_normal(m + ms(300)), 6000, "hp", 2) for _ in range(2)], 1)
            sh *= arc(len(sh), m, 2.0, 1.5)[:, None]
            pre_t.add(sh / np.max(np.abs(sh)) * db(p["shimmer"]["levelDb"]) * 0.7071, smp(c["frame"]))
        # --- inserts, sends, returns --------------------------------------------------------------------
        pad = filt(filt(pad_t.x, pad_lp, "lp", q=0.5), pad_hp, "hp", 2) * (gate * duck_pad)[:, None]
        sub = sub_t.x * duck_sub[:, None]
        lead = lead_t.x
        dly = pingpong(lead, 22.5, 0.35, 4000) * db(-7)
        hall = sos(conv(pad * PAD_HALL[sec] + pre_t.x * 0.6 + lead * 0.25, HALL), "highpass", 120, 2) * db(-10)
        plate = sos(conv(lead + dly * 0.6, PLATE), "highpass", 120, 2) * db(-12)
        room = sos(conv(room_t.x, ROOM), "highpass", 120, 2) * db(-9)
        bus = pad + sub + drum_t.x + lead + dly + pre_t.x + hall + plate + room
        if DIAG is not None:
            win = section_window(sec)[:, None]
            for name, z in (("pad+hall", pad + hall), ("sub", sub), ("drums+room", drum_t.x + room), ("lead+fx", lead + dly + plate), ("pre", pre_t.x), ("post", post_t.x)):
                DIAG[name] = DIAG.get(name, 0) + z * win
        bus = filt(bus, hp_c, "hp", 4)
        bus = filt(bus, lpb_c, "lp", 2)
        bus = filt(bus, lpr_c, "lp", 8)
        if sec == 1:
            grain_src = bus + post_t.x
        music += (bus + post_t.x) * section_window(sec)[:, None]
    return music, grain_src


def build_buzz(grain_src):
    """c33 stutter-freeze: G3 band-limited saw + a looped 245-sample grain of the mix, LPF 500 Hz -> 4 kHz."""
    c = CUE["c33"]
    p = c["params"]
    a, e = smp(c["frame"]), smp(p["hardCutAt"])
    period = 245  # 48000 / 245 = 195.92 Hz (G3)
    g0 = N + a - ms(3) - period  # middle loop, just before the freeze
    grain = grain_src[g0 : g0 + period].copy()
    grain -= grain.mean(0)
    grain /= np.sqrt(np.mean(grain**2)) + 1e-12
    n = e - a
    loop = np.tile(grain, (n // period + 1, 1))[:n]
    f0 = SR / period
    saw = saw_add(2 * np.pi * f0 * tt(n), f0)
    y = np.stack([saw, saw], 1) + db(-9) * 0.5 * loop
    y = filt(y, glide(n, [(0, p["lpfHz"][0]), (1, p["lpfHz"][1])]), "lp", q=p["q"])
    y *= np.clip(tt(n) / (p["fadeInMs"] / 1000), 0, 1)[:, None]
    y[-ms(p["cutMs"]) :] *= np.linspace(1, 0, ms(p["cutMs"]))[:, None]
    y = y / np.max(np.abs(y)) * db(c["levelDb"] + LEVEL_TRIM["c33"]) * 0.7071
    t = Timeline()
    t.add(y, a)
    return t.x


def build_tail():
    """After the hard stop: c59 reverse swell, c65 bell cluster, c01 wrapped echoes, c66 sub bloom -> hall."""
    tl = Timeline()
    c = CUE["c59"]
    hz = [b["hz"] for b in CUE["c65"]["params"]["bells"]]
    n = smp(c["endFrame"]) - smp(c["frame"])
    y = reverse_swell(BARS[8]["voicing"], n / SR, "c59", bells=hz)
    tl.add(y * db(c["levelDb"]) * 0.7071, smp(c["frame"]))

    def cluster(tau_ms, spread=0.5):
        m = ms(1500)
        out = np.zeros((m, 2))
        for i, h in enumerate(hz):
            out += pan(fm_bell(h, m, dtau=tau_ms / 1000, sus=0.0, atk=0.002), (i - 1) * spread)
        return out / np.max(np.abs(out))

    c = CUE["c65"]
    tl.add(cluster(c["params"]["tauMs"], spread=0.85) * db(c["levelDb"] + LEVEL_TRIM["c65"]) * 0.7071, smp(c["frame"]))
    c = CUE["c01"]  # echoes 30 / 60 / 90 f after the c65 hit, wrapped into bar 1
    for i, f in enumerate(c["frames"]):
        y = sos(cluster(300, 0.3), "lowpass", c["params"]["lpfHz"][i], 2)
        y = pan(y / np.max(np.abs(y)), c["pan"][i] / 100) * db(c["levelDb"][i] + LEVEL_TRIM["c01"]) * 0.7071
        tl.add(y, smp(f))
    c = CUE["c66"]
    p = c["params"]
    m = smp(NF) - smp(c["frame"])  # override c66-seam: gone by f1080
    t = tt(m)
    s = np.sin(2 * np.pi * p["hz"] * t) * np.clip(t / (p["attackMs"] / 1000), 0, 1) * np.exp(-t / (p["tauMs"] / 1000))
    fo = smp(1072) - smp(c["frame"])
    s[fo:] *= 0.5 * (1 + np.cos(np.pi * np.arange(m - fo) / (m - fo)))
    tl.add(pan(s * db(c["levelDb"]), 0), smp(c["frame"]))
    wet = conv(sos(tl.x, "highpass", 150, 2), HALL) * db(-3.5)  # wide tail; no sub into the reverb (mono lows)
    return tl.x + wet


def build_sfx(rendered):
    tl = Timeline()
    for bus, y, s in rendered:
        if bus == "sfx":
            tl.add(y, s)
    return tl.x + sos(conv(tl.x, SFX_ROOM), "highpass", 120, 2) * db(-18)


# =====================================================================================================
# 5. Master
# =====================================================================================================
def mono_maker_curve():
    """Side content below 120 Hz removed from bar 3 (f240) to the end of the loop (10 ms ramps)."""
    hz, bar = CUES["music"]["master"]["subMonoBelowHzFromBar"].values()
    m = np.zeros(N)
    a = smp(BARS[bar - 1]["from"])
    m[a:] = 1
    m[a : a + ms(10)] = np.linspace(0, 1, ms(10))
    m[: ms(10)] = np.linspace(1, 0, ms(10))  # wraps: off again at f0
    return periodic(m), hz


MM_FIR = None


def linear_master(x, gain, mm, mm_hz):
    """20 Hz HPF, then the mono-maker on the side channel only: a zero-phase (centred linear-phase FIR) LPF of the
    side is subtracted where mm = 1, so side content below mm_hz is removed exactly and the mid (the sub, the hard
    stops) is untouched, with no allpass ringing."""
    global MM_FIR
    if MM_FIR is None:
        MM_FIR = signal.firwin(8191, mm_hz, fs=SR, window=("kaiser", 8.0))
    y = sos(x * gain, "highpass", 20, 2)
    mid, side = (y[:, 0] + y[:, 1]) / 2, (y[:, 0] - y[:, 1]) / 2
    h = len(MM_FIR) // 2
    side_lo = signal.oaconvolve(side, MM_FIR)[h : h + len(side)]
    side = side - side_lo * mm
    return np.stack([mid + side, mid - side], 1)


def mid(x):
    return x[N : 2 * N]


def main():
    print("[overrides]")
    for k, v in OVERRIDES.items():
        print(f"  {k}: {v}")
    rendered = []
    for c in SFX_CUES:
        rendered += render_cue(c)
    # v5: the UI foley only. audio/music.py writes the new score and masters both (it reads stems/sfx-raw.wav).
    sfx = build_sfx(rendered)
    sf.write(STEMS / "sfx-raw.wav", mid(sfx).astype(np.float32), SR, subtype="FLOAT")
    print(f"  wrote {STEMS / 'sfx-raw.wav'} ({N / SR:.3f} s), music cues skipped: {sorted({r[0] for r in rendered} - {'sfx'})}")
    return
    sections, grain_src = build_sections([r for r in rendered if r[0] != "sfx"])
    music = sections + build_buzz(grain_src) + build_tail()
    sfx = build_sfx(rendered)

    target = CUES["music"]["master"]["lufs"] - 0.03  # lands ffmpeg's one-decimal reading on -14.0
    mm, mm_hz = mono_maker_curve()
    gain = db(-6.0)
    for it in range(5):
        pre = linear_master(music + sfx, gain, mm, mm_hz)
        out3, g = limiter(pre)
        li = integrated(kweight(out3)[N : 2 * N])
        print(f"  gain iter {it}: {20 * np.log10(gain):+.2f} dB -> {li:.2f} LUFS, max GR {-20 * np.log10(g.min()):.2f} dB")
        if abs(li - target) < 0.02:
            break
        gain *= db(target - li)
    if DIAG is not None:
        DIAG["sfx"] = sfx
        print("  per-bus loudness per bar (LUFS at final gain, pre bus filters):")
        for name, z in DIAG.items():
            zk = kweight(z * gain)[N : 2 * N]
            vals = [lufs(np.sum(np.mean(zk[smp(b * 120) : smp(b * 120 + 120)] ** 2, 0))) for b in range(9)]
            print(f"    {name:11s} " + " ".join(f"{v:6.1f}" for v in vals))
    music_st = linear_master(music, gain, mm, mm_hz)
    sfx_st = linear_master(sfx, gain, mm, mm_hz)

    # --- loop checks ------------------------------------------------------------------------------------
    out = mid(out3)
    assert out.shape == (N, 2)
    periodic_err = np.max(np.abs(out3[N : 2 * N - SR // 10] - out3[2 * N : 3 * N - SR // 10]))
    print(f"  steady state: max |loop0 - loop+1| = {periodic_err:.2e}")
    assert periodic_err < 1e-6, "circular render did not reach steady state"
    step = np.abs(np.diff(out, axis=0))
    seam = np.abs(out[0] - out[-1])
    print(f"  seam step {seam.max():.2e} vs sample-step p99.9 {np.percentile(step, 99.9):.2e}, max {step.max():.2e}")
    assert np.all(seam <= np.percentile(step, 99.9))
    joined = np.concatenate([out[-4800:], out[:4800]])  # the file played in a loop, 100 ms either side
    assert np.allclose(joined, out3[2 * N - 4800 : 2 * N + 4800], atol=1e-9)
    hf = lambda z: np.sqrt(np.mean(np.diff(z, axis=0) ** 2))
    xf_ratio = hf(joined[4800 - 480 : 4800 + 480]) / hf(np.concatenate([out[-24000:-4800], out[4800:24000]]))
    print(f"  crossfade test: HF energy around the seam / neighbourhood = {xf_ratio:.2f}")
    assert np.abs(out).max() < 1.0

    STEMS.mkdir(exist_ok=True)
    sf.write(OUT_WAV, out.astype(np.float32), SR, subtype="PCM_24")
    sf.write(STEMS / "music.wav", mid(music_st).astype(np.float32), SR, subtype="PCM_24")
    sf.write(STEMS / "sfx.wav", mid(sfx_st).astype(np.float32), SR, subtype="PCM_24")
    shutil.copyfile(OUT_WAV, PUBLIC_WAV)
    info = sf.info(OUT_WAV)
    assert (info.samplerate, info.channels, info.subtype, info.frames) == (SR, 2, "PCM_24", N), info
    print(f"  wrote {OUT_WAV} ({info.frames} samples, {info.duration:.3f} s) + stems + {PUBLIC_WAV}")

    verify(out, out3, mid(music_st), mid(sfx_st), mid(sections) * gain)


# =====================================================================================================
# 6. Verification
# =====================================================================================================
def band_db(x, f0, f1, lo, hi):
    seg = x[smp(f0) : smp(f1)]
    m = seg.mean(1) if seg.ndim == 2 else seg
    X = np.abs(np.fft.rfft(m * np.hanning(len(m)))) ** 2
    f = np.fft.rfftfreq(len(m), 1 / SR)
    return 10 * np.log10(X[(f >= lo) & (f < hi)].sum() / len(m) + 1e-30)


def ffmpeg_ebur128(path):
    r = subprocess.run([FFMPEG, "-nostats", "-hide_banner", "-i", str(path), "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    s = r.stderr[r.stderr.rfind("Summary:") :]
    grab = lambda k: float(re.search(k + r":\s+(-?[\d.]+)", s).group(1))
    return grab("I"), grab("LRA"), grab("Peak")


def detect_onsets(x):
    import librosa

    y = (x.mean(1) if x.ndim == 2 else x).astype(np.float32)
    hop = 64
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=hop, n_fft=512, n_mels=64, fmax=20000, center=True)
    on = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=hop, units="time", backtrack=False, delta=0.04, wait=4, pre_max=2, post_max=2, pre_avg=40, post_avg=4)
    return np.asarray(on)


def attack_onsets(x, rise_db=9.0, win_ms=3.0, floor_db=-66.0):
    """Independent transient detector: 1 ms RMS envelope above 1.5 kHz; an onset is where the level rises by more
    than rise_db within win_ms (first crossing of each rise), at least 6 ms apart. Knows nothing about the cues."""
    m = x.mean(1) if x.ndim == 2 else x
    h = sos(m, "highpass", 1500, 4)
    env = np.sqrt(uniform_filter1d(h**2, ms(1)) + 1e-18)
    L = 20 * np.log10(env)
    w = ms(win_ms)
    d = L[w:] - L[:-w]
    hit = (d > rise_db) & (L[w:] > floor_db)
    idx = np.flatnonzero(hit & ~np.concatenate([[False], hit[:-1]])) + w
    keep = []
    for i in idx:
        if not keep or i - keep[-1] > ms(6):
            keep.append(i)
    return np.array(keep) / SR


def sync_table(onsets, expected, label):
    rows = []
    for cid, f in expected:
        t = float(out_frame(f)) / FPS
        j = np.argmin(np.abs(onsets - t)) if len(onsets) else None
        d = (onsets[j] - t) * 1000 if j is not None else np.inf
        rows.append((cid, f, d))
    d = np.array([abs(r[2]) for r in rows])
    ok = d <= 1000 / FPS
    print(f"  [{label}] {len(rows)} hits, {ok.sum()} within +-1 f (16.7 ms), mean |d| {d.mean():.1f} ms, max {d.max():.1f} ms")
    for cid, f, dd in rows:
        if abs(dd) > 1000 / FPS:
            print(f"     MISS {cid} f{f}: nearest onset {dd:+.1f} ms")
    return rows, ok


def verify(out, out3, music, sfx, sections):
    print("[verify]")
    REPORT.mkdir(exist_ok=True)
    # loudness / peak / DC
    I, LRA, TP = ffmpeg_ebur128(OUT_WAV)
    xk = kweight(out3)[N : 2 * N]
    li = integrated(xk)
    lra_c, _ = loudness_range(xk)
    tp8 = 20 * np.log10(np.abs(signal.resample_poly(out, 8, 1, axis=0)).max())
    dc = out.mean(0)
    print(f"  ffmpeg ebur128: I {I:.1f} LUFS, LRA {LRA:.1f} LU, true peak {TP:.1f} dBTP")
    print(f"  own BS.1770 (circular): I {li:.2f} LUFS, LRA {lra_c:.1f} LU; 8x true peak {tp8:.2f} dBTP; sample peak {20 * np.log10(np.abs(out).max()):.2f} dBFS; DC {dc[0]:.1e} / {dc[1]:.1e}")
    loop3 = REPORT / "loop3.wav"
    sf.write(loop3, np.tile(out, (3, 1)).astype(np.float32), SR, subtype="PCM_24")
    I3, LRA3, TP3 = ffmpeg_ebur128(loop3)
    loop3.unlink()
    print(f"  played 3x in a loop (ffmpeg): I {I3:.1f} LUFS, LRA {LRA3:.1f} LU, TP {TP3:.1f} dBTP")
    assert abs(I - (-14)) <= 0.5 and TP <= -1.0 and tp8 <= -1.0 and np.all(np.abs(dc) < 1e-4)
    # per-bar loudness (K-weighted mean square over the bar)
    kb = []
    for b in range(9):
        seg = xk[smp(b * 120) : smp(b * 120 + 120)]
        kb.append(lufs(np.sum(np.mean(seg**2, 0))))
    print("  bar loudness (LUFS over each 2 s bar): " + "  ".join(f"b{i + 1} {v:.1f}" for i, v in enumerate(kb)))
    for name, (a, b) in {"b1": (0, 120), "b3": (240, 360), "drop b5": (480, 600), "b9": (960, 1044)}.items():
        tot = band_db(out, a, b, 20, 20000)
        print(f"  band balance {name}: " + ", ".join(f"{k} {band_db(out, a, b, lo, hi) - tot:.1f}" for k, (lo, hi) in {"<120": (20, 120), "120-1k": (120, 1000), "1k-5k": (1000, 5000), ">5k": (5000, 20000)}.items()))

    # band-limit / automation checks on the music stem
    checks = []

    def chk(name, val, cond):
        checks.append((name, val, cond))
        print(f"  {'ok ' if cond else 'BAD'} {name}: {val:.1f} dB")

    chk("drop-out f190-f208 <100 Hz vs f150-f185", band_db(music, 190, 208, 20, 100) - band_db(music, 150, 185, 20, 100), band_db(music, 190, 208, 20, 100) - band_db(music, 150, 185, 20, 100) < -30)
    v = band_db(music, 212, 236, 20, 100) - band_db(music, 150, 185, 20, 100)
    chk("re-entry f212-f236 <100 Hz vs f150-f185", v, v > -3)
    v = band_db(music, 372, 418, 20, 150) - band_db(music, 300, 355, 20, 150)
    chk("build band-limit f372-f418 <150 Hz vs bar 3", v, v < -25)
    v = band_db(music, 372, 418, 5000, 20000) - band_db(music, 300, 355, 5000, 20000)
    chk("build band-limit f372-f418 >5 kHz vs bar 3", v, v < -10)
    for (a, b), (c0, c1) in (((589, 599), (560, 584)), ((642, 659), (612, 636))):
        v = band_db(music, a, b, 20, 100) - band_db(music, c0, c1, 20, 100)
        chk(f"suck-out f{a}-f{b} <100 Hz", v, v < -30)
    v = band_db(music, 752, 779, 5000, 20000) - band_db(music, 722, 748, 5000, 20000)
    chk("radio f752-f779 >5 kHz vs f722-f748", v, v < -30)
    v = band_db(music, 752, 779, 20, 100) - band_db(music, 722, 748, 20, 100)
    chk("radio f752-f779 <100 Hz vs f722-f748", v, v < -30)
    # stutter: fundamental at 196 Hz
    seg = music[smp(455) : smp(478)].mean(1)
    X = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    fq = np.fft.rfftfreq(len(seg), 1 / SR)
    band = (fq > 100) & (fq < 300)
    f0 = fq[band][np.argmax(X[band])]
    print(f"  {'ok ' if abs(f0 - 196) < 3 else 'BAD'} stutter fundamental {f0:.1f} Hz (G3 196)")
    checks.append(("stutter f0", f0, abs(f0 - 196) < 3))
    # hard stop: the music sections (everything but the tail bus) are silent 5 ms after f1044
    rms = lambda z: 20 * np.log10(np.sqrt(np.mean(z**2)) + 1e-15)
    v = rms(sections[smp(HARD_STOP) + ms(5) : smp(NF)]) - rms(sections[smp(1030) : smp(HARD_STOP)])
    chk("hard stop f1044: sections RMS after +5 ms vs f1030-f1044", v, v < -80)
    v = rms(sections[smp(STUTTER) + ms(3) : smp(DROP)]) - rms(sections[smp(430) : smp(STUTTER)])
    chk("stutter f450-f480: sections RMS vs f430-f450 (buzz only)", v, v < -80)
    # sub stereo correlation per bar
    lo = sos(out, "lowpass", 100, 8)
    cors = []
    for b in range(9):
        s = lo[smp(b * 120) : smp(b * 120 + 120)]
        cors.append(np.corrcoef(s[:, 0], s[:, 1])[0, 1])
    print("  sub (<100 Hz, 48 dB/oct) L/R correlation per bar: " + " ".join(f"b{i + 1} {c:.3f}" for i, c in enumerate(cors)))
    assert all(c > 0.99 for c in cors[2:]), cors
    assert all(ok for _, _, ok in checks), [c for c in checks if not c[2]]

    # peak levels above 2 kHz in the full mix per sound class (reference: clap -5.5, click -12, ticks -14..-16,
    # typing -13..-15, hats -18 dBFS)
    hi = sos(out, "highpass", 2000, 4)
    def pk(frames, win_ms=25):
        return np.median([20 * np.log10(np.abs(hi[smp(f) : smp(f) + ms(win_ms)]).max() + 1e-12) for f in frames])
    cls = {
        "clap": [f for f, nm, _, _ in DRUMS if nm == "clap" and sec_of(f) and not RADIO["from"] <= f < RADIO["to"]],
        "hat": [f for f, nm, _, _ in DRUMS if nm.startswith("hat") and sec_of(f) and not RADIO["from"] <= f < RADIO["to"]
                and not any(abs(f - g) < 3 for g, n2, _, _ in DRUMS if n2[:3] in ("kic", "cla", "rim"))],
        "click": [45, 162, 1030, 1057],
        "tick": [88, 142, 1054, 784],
        "typing": CUE["c22"]["frames"] + CUE["c29"]["frames"],
    }
    print("  peak >2 kHz (dBFS, median): " + ", ".join(f"{k} {pk(v):.1f}" for k, v in cls.items()))
    if FAST:
        return
    # onsets vs cues (SFX stem): every percussive / foley hit
    perc_types = {"click-press", "click-release", "click-press+release", "tab-tick", "pitched-tab-tick", "typing", "soft-pop", "pop", "soft-thump", "felt-thock", "clack", "bloop", "micro-ticks", "ratchet-ticks", "odometer-deflate", "odometer", "spinner-ticks", "pitched-snap", "deep-thock", "glints", "reverse-ticks", "data-fill"}
    exp = []
    for c in SFX_CUES:
        if c["type"] in perc_types:
            fr = c["params"]["ticks"] if c["type"] == "data-fill" else (c.get("frames") or [c["frame"]])
            exp += [(c["id"], f) for f in fr]
        if c["type"] == "rewrite":
            exp += [(c["id"], f) for f in c["frames"]]
        if c["type"] == "thwip-slam":
            exp.append((c["id"], c["peakFrame"]))
    on_lib, on_att = detect_onsets(sfx), attack_onsets(sfx)
    sync_table(on_lib, exp, "sfx stem, foley cues, librosa mel-flux")
    sync_table(on_att, exp, "sfx stem, foley cues, HF attack detector")
    rows, ok = sync_table(np.sort(np.concatenate([on_lib, on_att])), exp, "sfx stem, foley cues, either detector")
    # music grid hits on the music stem
    exp_m = [(name, f) for f, name, _, _ in DRUMS if name in ("kick", "clap", "rim") and sec_of(f) is not None and not (RADIO["from"] <= f < RADIO["to"])]
    exp_m += [("lead", x["frame"]) for x in lead_notes() if sec_of(x["frame"])]
    on_mus = detect_onsets(music)
    rows_m, ok_m = sync_table(on_mus, exp_m, "music stem, kick/clap/rim/bells")
    on_mix = detect_onsets(out)
    key = [("drop", 480), ("slam", 780), ("click", 1030), ("release", 1037), ("blink", 1057), ("burst", BURST), ("snap", 240), ("re-entry", 210)]
    sync_table(on_mix, key, "full mix, key moments")
    with open(REPORT / "sync.tsv", "w") as fh:
        fh.write("cue\tframe\tdelta_ms\tok\n")
        for (cid, f, d), o in zip(rows + rows_m, list(ok) + list(ok_m)):
            fh.write(f"{cid}\t{f}\t{d:+.2f}\t{int(o)}\n")
    # spectrograms: whole loop + one per bar
    subprocess.run([FFMPEG, "-y", "-v", "error", "-i", str(OUT_WAV), "-lavfi", "showspectrumpic=s=1800x700:mode=combined:color=intensity:scale=log:fscale=log:legend=1:start=20:stop=20000", str(REPORT / "spec_full.png")], check=True)
    for b in range(9):
        subprocess.run([FFMPEG, "-y", "-v", "error", "-ss", f"{b * 2}", "-t", "2", "-i", str(OUT_WAV), "-lavfi", "showspectrumpic=s=1000x500:mode=combined:color=intensity:scale=log:fscale=log:legend=1:start=20:stop=20000", str(REPORT / f"spec_bar{b + 1}.png")], check=True)
    edge_sheet(out)
    print(f"  spectrograms in {REPORT}")


def edge_sheet(out):
    """Zoomed spectrograms (300 ms, log frequency 30 Hz to 20 kHz) centred on every hard edge and on the seam."""
    from PIL import Image, ImageDraw

    m = out.mean(1)

    def img(t0, label, dur=0.3, n=1024, hop=48, H=260):
        a, b = int(t0 * SR), int((t0 + dur) * SR)
        seg = np.concatenate([m[a:], m[:b]]) if a < 0 else m[a:b]
        S = 20 * np.log10(np.array([np.abs(np.fft.rfft(seg[i : i + n] * np.hanning(n))) for i in range(0, len(seg) - n, hop)]).T + 1e-9)
        S = np.clip((S - (S.max() - 90)) / 90, 0, 1)
        idx = np.searchsorted(np.fft.rfftfreq(n, 1 / SR), np.geomspace(30, 20000, H)).clip(0, n // 2)
        im = Image.fromarray((S[idx][::-1] * 255).astype(np.uint8)).resize((S.shape[1] * 2, H * 2)).convert("RGB")
        d = ImageDraw.Draw(im)
        cx = int((dur / 2 * SR - n / 2) / hop) * 2
        d.line([(cx, 0), (cx, 14)], fill=(255, 0, 0), width=3)
        d.text((6, 4), label, fill=(255, 90, 90))
        return im

    edges = [(DROPOUT["from"], "dropout in"), (REENTRY, "re-entry"), (STUTTER, "freeze"), (DROP, "drop"), (SUCK1["to"], "suck-out return"),
             (SUCK2["to"], "suck-out return"), (RADIO["from"], "radio in"), (SLAM, "slam"), (HARD_STOP, "hard stop"), (NF, "seam f1079|f0")]
    ims = [img((f % NF) / FPS - 0.15, f"f{f} {lab}") for f, lab in edges]
    W, H = ims[0].size
    sheet = Image.new("RGB", (W * 2 + 10, H * 5 + 40), (40, 40, 40))
    for i, im in enumerate(ims):
        sheet.paste(im, ((i // 5) * (W + 10), (i % 5) * (H + 10)))
    sheet.save(REPORT / "zoom_edges.png")


if __name__ == "__main__":
    main()
