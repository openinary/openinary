import numpy as np, subprocess, glob, os
import os
# The UI sound pack (13 WAVs, not in the repo). Set FILM_SOUND_PACK to its folder.
P=os.path.join(os.environ.get("FILM_SOUND_PACK", os.path.expanduser("~/Downloads/Sound pack")), "")
def load(name, sr=48000):
    raw=subprocess.run(["ffmpeg","-v","error","-i",P+name+".wav","-f","f32le","-ac","1","-ar",str(sr),"-"],capture_output=True).stdout
    return np.frombuffer(raw,np.float32).copy()
