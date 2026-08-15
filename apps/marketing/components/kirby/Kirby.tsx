"use client";

/**
 * Kirby, the animated mark. Vendored from the avatar exporter, unchanged
 * except for the import paths and one comment: the runtime builds its engine
 * as a Blob and imports it, and webpack has to be told to leave that dynamic
 * import alone or it resolves the URL through its own module graph and fails.
 *
 * Anything hand-edited here is overwritten by the next export, so changes
 * belong in the editor unless they are meant to be redone.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react'
import { loadAvatarRuntime, type RuntimeAvatar } from "@/components/kirby/avatar-runtime"
import { avatarData, type AnimationName } from "@/components/kirby/kirby.avatar"

export type { AnimationName } from "@/components/kirby/kirby.avatar"
export type AvatarHandle = {
  play: (animation?: AnimationName) => void
  pause: () => void
  stop: () => void
}
export type AvatarProps = {
  animation?: AnimationName
  playing?: boolean
  loop?: boolean
  size?: number | string
  className?: string
  style?: CSSProperties
  onAnimationEnd?: (animation: AnimationName) => void
}

export const Kirby = forwardRef<AvatarHandle, AvatarProps>(function Kirby(
  {
    animation = "sleeping",
    playing = true,
    loop,
    size = 240,
    className,
    style,
    onAnimationEnd,
  },
  ref
) {
  const host = useRef<HTMLSpanElement>(null)
  const controller = useRef<RuntimeAvatar<AnimationName> | null>(null)
  const animationRef = useRef(animation)
  const playingRef = useRef(playing)
  const onAnimationEndRef = useRef(onAnimationEnd)
  animationRef.current = animation
  playingRef.current = playing
  onAnimationEndRef.current = onAnimationEnd

  useEffect(() => {
    if (!host.current) return
    let disposed = false
    let avatar: RuntimeAvatar<AnimationName> | null = null
    void loadAvatarRuntime<AnimationName>(avatarData).then(runtime => {
      if (disposed || !host.current) return
      avatar = runtime.createAvatar(host.current, {
        animation: animationRef.current,
        autoplay: playingRef.current,
        loop,
        size: '100%',
        onAnimationEnd: next => onAnimationEndRef.current?.(next),
      })
      controller.current = avatar
    })
    return () => {
      disposed = true
      avatar?.destroy()
      controller.current = null
    }
  }, [loop])

  useEffect(() => {
    const avatar = controller.current
    if (!avatar) return
    if (playing) avatar.play(animation)
    else avatar.pause()
  }, [animation, playing])

  useImperativeHandle(ref, () => ({
    play(next = animation) { controller.current?.play(next) },
    pause() { controller.current?.pause() },
    stop() { controller.current?.stop() },
  }), [animation])

  const dimension = typeof size === 'number' ? size + 'px' : size
  return <span ref={host} className={className} style={{ display: 'inline-block', width: dimension, height: dimension, ...style }} />
})

export default Kirby
