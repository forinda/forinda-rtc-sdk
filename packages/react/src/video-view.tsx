/**
 * `<VideoView>` — `<video>` wrapper that handles `srcObject` assignment
 * (which doesn't fit React's prop model) and common autoplay quirks.
 *
 * Forwards refs so consumers can still attach their own. Optional `mirror`
 * prop applies `transform: scaleX(-1)` for selfie-style preview.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type VideoHTMLAttributes,
} from "react";

export interface VideoViewProps extends VideoHTMLAttributes<HTMLVideoElement> {
  /** The MediaStream to render. `null` clears the source. */
  stream: MediaStream | null;
  /** Apply `transform: scaleX(-1)` for selfie-mirror preview. Default `false`. */
  mirror?: boolean;
}

export const VideoView = forwardRef<HTMLVideoElement, VideoViewProps>(function VideoView(
  { stream, mirror = false, style, ...rest },
  forwardedRef,
) {
  const innerRef = useRef<HTMLVideoElement | null>(null);

  // Bridge the inner ref to the forwarded ref so consumers can still attach.
  useImperativeHandle<HTMLVideoElement | null, HTMLVideoElement | null>(
    forwardedRef,
    () => innerRef.current,
  );

  useEffect(() => {
    const el = innerRef.current;
    if (el === null) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  const composedStyle: React.CSSProperties = {
    ...(mirror ? { transform: "scaleX(-1)" } : {}),
    ...style,
  };

  return <video ref={innerRef} style={composedStyle} {...rest} />;
});
