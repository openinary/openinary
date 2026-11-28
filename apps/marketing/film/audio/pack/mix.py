"""
Film soundtrack (v6 film, sound v7): a Pixabay beat muffled underneath, the UI sound pack on the picture cues.

Inputs (not in the repo): FILM_BEAT, the beat (osynthw "Winter gaming beat", Pixabay licence, 88 BPM),
and FILM_SOUND_PACK, the folder of UI WAVs (see load.py). Needs public/cues.json (npm run cues), numpy, ffmpeg.
Writes public/score.wav, which Film.tsx plays.
Run: python3 audio/pack/mix.py
"""
import numpy as np, subprocess, json, os, pathlib
from load import load
SR=48000; FPS=48; NF=1800; N=NF*SR//FPS
FILM=pathlib.Path(__file__).resolve().parents[2]
TRACK=os.environ.get("FILM_BEAT", os.path.expanduser("~/Downloads/osynthw-winter-gaming-beat-641460.mp3"))
CUES=json.load(open(FILM/"public/cues.json"))
OUT=str(FILM/"public/score")

def dec(path,af=""):
    cmd=["ffmpeg","-v","error","-i",path]+(["-af",af] if af else [])+["-f","f32le","-ac","2","-ar",str(SR),"-"]
    return np.frombuffer(subprocess.run(cmd,capture_output=True).stdout,np.float32).reshape(-1,2).copy()
def fft_filter(x,lo=None,hi=None,order=2):
    F=np.fft.rfft(x,axis=0); f=np.fft.rfftfreq(len(x),1/SR); g=np.ones_like(f)
    if hi: g/=np.sqrt(1+(f/hi)**(2*order))
    if lo: g/=np.sqrt(1+(lo/np.maximum(f,1))**(2*order))
    return np.fft.irfft(F*(g[:,None] if x.ndim>1 else g),len(x),axis=0)
db=lambda d:10**(d/20)

def lufs(x):
    o=subprocess.run(["ffmpeg","-nostats","-f","f32le","-ar",str(SR),"-ac","2","-i","-","-af","ebur128","-f","null","-"],input=x.astype(np.float32).tobytes(),capture_output=True).stderr.decode()
    return float(o.split("I:")[-1].split("LUFS")[0])
# ---- music: 15 bars from the full section (bar 5 on, 88 BPM), sped to 96 BPM, muffled
bar88=4*60/88; start=4*bar88; length=15*bar88+0.5
m=dec(TRACK,f"atrim={start}:{start+length},asetpts=PTS-STARTPTS,atempo={96/88}")
m=m[:N+int(.05*SR)]
xf=int(.05*SR); m[:xf]=m[:xf]*np.linspace(0,1,xf)[:,None]+m[N:N+xf]*np.linspace(1,0,xf)[:,None]  # seamless loop
m=m[:N]
m=fft_filter(m,lo=40,hi=700,order=2)          # "muffled": through a wall
mid=m.mean(1,keepdims=True); m=mid+(m-mid)*.6  # a little narrower, so the UI owns the stereo
m*=db(-7)/np.sqrt((m**2).mean())*0.1

# ---- the pack
P={k:load(k) for k in ["UI_AlbumSubmit_Finish","UI_AlbumSubmit_Out","UI_Check","UI_Decide","UI_Decide_Small",
 "UI_Interior_ChangeMode","UI_Interior_Focus","UI_Interior_Move","UI_Interior_MultiSelect_On",
 "UI_Interior_Wipe_Off","UI_Interior_Wipe_On","UI_Invalid","UI_Undo"]}
P={k[3:]:v/np.abs(v).max() for k,v in P.items()}
def rs(x,r): n=int(len(x)/r); return np.interp(np.arange(n)*r,np.arange(len(x)),x)
# Every pack sound moved away from its source: a fifth down (-7 semitones), the glassy top rolled off
# above 3.5 kHz, and a 3 ms soft attack so the clicks land as taps rather than snaps.
PACK_SHIFT=-7
def reshape(x):
    y=fft_filter(rs(x,2**(PACK_SHIFT/12)),hi=3500,order=2); a=int(.003*SR)
    y[:a]*=np.linspace(0,1,a); return y/np.abs(y).max()
P={k:reshape(v) for k,v in P.items()}
def fit(x,dur):  # trim a sweep to the cue's length with a fade, so whooshes follow the picture
    n=max(int(dur*SR),int(.08*SR)); y=x[:n].copy(); f=min(len(y)//3,int(.06*SR)); y[-f:]*=np.linspace(1,0,f); return y
def whoosh(c,rev=False):
    d=((c.get("endFrame") or c["frame"]+12)-c["frame"])/FPS
    src=P["Interior_Wipe_On"] if not rev else P["Interior_Wipe_Off"]
    return fit(src,d+.15)
# Only the moments a viewer would hear in the real app get a UI sound; everything that just moves gets
# a soft air whoosh; ticks, typing, counters and caption pops stay silent.
UI={  # cue id -> (sound, dB, which of its frames)
 "c06":("Decide_Small",-14,[0]),      # grab
 "c12":("Undo",-15,[0]),              # drop
 "c13a":("Decide_Small",-15,[0]),     # Upload press
 "c16":("Check",-12,[0]),             # uploaded
 "c17":("Decide_Small",-15,[0]),      # tile click
 "c23":("Interior_Focus",-14,[0]),    # w_600 applies
 "c27":("Interior_Focus",-16,[0]),    # crop
 "c30":("Interior_MultiSelect_On",-18,[0]),  # corners round
 "k4":("Check",-21,[0]),              # served from the edge
 "b7-resolve":("Check",-13,[0]),      # video ready
 "c50":("AlbumSubmit_Out",-12,[0]),   # top shard lands
 "c65":("AlbumSubmit_Finish",-6,[0]), # final burst
}
# Light ear candy where the picture is busy but used to be silent: soft, pitched, well under the hits.
SOFT={  # cue id -> (sound, dB first, dB last, semitones per step, pitch jitter)
 "c31":("Interior_Move",-30,-20,1,0),        # 0:14-0:16 slot-machine swaps, a tick per variant, rising
 "k2":("Interior_Move",-34,-30,0,1.5),       # 0:17.8 first request runs, a faint patter
 "b6-count1":("Interior_Move",-32,-28,-1,0), # 0:23 counter deflates, falling
 "b6-flip":("Interior_ChangeMode",-22,-22,0,0), # 0:24.5 webp -> avif
 "b6-count2":("Interior_Move",-32,-30,-1,0),
 "b6-k5":("Interior_Focus",-22,-22,0,0),     # 0:24.8 "98% smaller"
 "b7-chip":("Interior_Focus",-24,-24,0,0),   # 0:28 processing chip
 "b7-spin":("Interior_Move",-36,-32,0,1),    # processing spinner, barely there
 "b7-meta":("Interior_Move",-24,-24,0,0),
 "b7-trim":("Decide_Small",-22,-24,2,0),     # 0:29 trim handles snap
}
AIR={  # cue id -> dB: things that only move
 "c30b":-30,"k1":-30,"b6-rail":-30,"b6-meter":-32,"c04":-24,"c08":-26,"c16a":-28,"c18":-24,"c21":-28,"k3":-34,"c34":-22,"c37":-24,"b7-pan":-24,"c47":-28,"c54":-26,"c64":-22,
}
L=np.zeros(N+SR*3); R=np.zeros(N+SR*3); rng=np.random.default_rng(3)
def put(x,frame,g,pan):
    i=int(round(frame*SR/FPS)); x=x[:len(L)-i]; pan=max(-1,min(1,pan))
    L[i:i+len(x)]+=x*g*np.sqrt((1-pan)/2); R[i:i+len(x)]+=x*g*np.sqrt((1+pan)/2)
def air(dur,peak=.6,lo=350,hi=2600):
    """A soft whoosh: pink-ish noise, band-limited, raised-cosine swell that peaks late and falls fast."""
    n=int(max(dur,.18)*SR); w=rng.standard_normal(n); w=np.cumsum(w); w-=np.convolve(w,np.ones(400)/400,"same")
    w=fft_filter(w,lo=lo,hi=hi,order=2); t=np.linspace(0,1,n)
    e=np.where(t<peak,np.sin(np.pi/2*t/peak)**2,np.cos(np.pi/2*(t-peak)/(1-peak))**2)
    return w/np.abs(w).max()*e
C={c["id"]:c for c in CUES["sfx"]}
for cid,(name,lv,idx) in UI.items():
    c=C[cid]; fr=c.get("frames") if isinstance(c.get("frames"),list) else [c["frame"]]
    for k in idx: put(P[name],fr[k],db(lv),0)
for cid,(name,a,b,step,jit) in SOFT.items():
    c=C[cid]; fr=c.get("frames") if isinstance(c.get("frames"),list) else [c["frame"]]
    if c["type"]=="data-fill": fr=c["params"].get("ticks",fr)
    for k,f in enumerate(fr):
        lv=a+(b-a)*k/max(1,len(fr)-1); semis=step*k+rng.uniform(-jit,jit)
        put(rs(P[name],2**(semis/12)),f,db(lv),0)
for cid,lv in AIR.items():
    c=C[cid]; d=((c.get("endFrame") or c["frame"]+18)-c["frame"])/FPS
    pk=((c.get("peakFrame") or c["frame"]+.7*d*FPS)-c["frame"])/FPS/max(d,1e-3)
    pan=c["pan"]; p=(pan[0]/100 if isinstance(pan,list) else 0)
    put(air(d+.12,min(.85,max(.3,pk))),c["frame"],db(lv),p*.5)
# the final burst rides out of a reversed Finish, so the loop breathes in before bar 1
rev=P["AlbumSubmit_Finish"][::-1][-int(.9*SR):]; put(rev*np.linspace(0,1,len(rev))**2,1786-len(rev)*FPS/SR,db(-22),0)
# fold tails into the loop start
for X in (L,R): X[:len(X)-N]+=X[N:]
sfx=np.stack([L[:N],R[:N]],1)
sfx=sfx+.12*fft_filter(np.roll(sfx,int(.11*SR),0)[:,::-1],lo=600,hi=6000)  # a little room
# fixed levels, no loudness chase: the beat sits at -24 LUFS, the UI hits peak around -5 dBFS
m=m*db(-24-lufs(m)); sfx=sfx*db(-5)/np.abs(sfx).max()
mix=m+sfx; mix=np.tanh(mix*1.2)/np.tanh(1.2)*0.97
print("music",lufs(m),"total",lufs(mix),"peak dB",20*np.log10(np.abs(mix).max()))
pcm=(mix*32767).astype("<i2").tobytes()
subprocess.run(["ffmpeg","-v","error","-y","-f","s16le","-ar",str(SR),"-ac","2","-i","-",OUT+".wav"],input=pcm,check=True)
print("ok")
