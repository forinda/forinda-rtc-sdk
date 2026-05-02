/**
 * `VideoView` — `<video>` wrapper that handles `srcObject` assignment
 * (which can't go through `<video :src>`) and exposes the underlying
 * element via `defineExpose({ video })` for consumers that need ref access.
 *
 * Optional `mirror` prop applies `transform: scaleX(-1)` for selfie-style
 * preview. All other attributes (`autoplay`, `playsinline`, `muted`,
 * `controls`, `class`, `style`, listeners…) are forwarded to the inner
 * `<video>` via `$attrs` (the component sets `inheritAttrs: false` and
 * spreads them onto the element).
 *
 * Plain TypeScript component — no SFC compiler required.
 */

import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  toRaw,
  watch,
  type CSSProperties,
  type PropType,
} from "vue";

export const VideoView = defineComponent({
  name: "VideoView",
  inheritAttrs: false,
  props: {
    /** The MediaStream to render. `null` clears the source. */
    stream: {
      type: Object as PropType<MediaStream | null>,
      default: null,
    },
    /** Apply `transform: scaleX(-1)` for selfie-mirror preview. Default `false`. */
    mirror: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { attrs, expose }) {
    const video = ref<HTMLVideoElement | null>(null);

    const assign = (s: MediaStream | null): void => {
      const el = video.value;
      // `toRaw` strips Vue's reactive proxy wrapper if a consumer happens to
      // pass a stream that's already been made reactive (e.g. stored via
      // `ref()` rather than `shallowRef()`). The underlying <video> compares
      // srcObject by identity, so a Proxy != the real stream causes flicker.
      const raw = s === null ? null : toRaw(s);
      if (el && el.srcObject !== raw) {
        el.srcObject = raw;
      }
    };

    // Initial assignment after mount (the ref is null pre-mount, so an
    // immediate watch wouldn't see the element yet).
    onMounted(() => assign(props.stream));
    watch(() => props.stream, assign, { flush: "post" });

    onBeforeUnmount(() => {
      // Detach so the GC isn't fighting a live track reference. Stopping
      // tracks is the consumer's job — we just unbind.
      const el = video.value;
      if (el) el.srcObject = null;
    });

    expose({ video });

    return () => {
      const baseStyle: CSSProperties = props.mirror ? { transform: "scaleX(-1)" } : {};
      const style = mergeStyle(baseStyle, attrs.style as CSSProperties | string | undefined);
      return h("video", {
        ...attrs,
        ref: video,
        style,
      });
    };
  },
});

function mergeStyle(
  base: CSSProperties,
  attr: CSSProperties | string | undefined,
): CSSProperties | string {
  if (!attr) return base;
  if (typeof attr === "string") {
    if (Object.keys(base).length === 0) return attr;
    // Caller passed a style string; prepend the mirror declaration.
    return `transform: scaleX(-1); ${attr}`;
  }
  return { ...base, ...attr };
}
