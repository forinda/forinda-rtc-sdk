<script setup lang="ts">
import { ref, watch } from "vue";
import { VideoView, useDisplayMedia, usePublisher } from "@forinda/video-sdk-vue";

const props = defineProps<{ stream: MediaStream }>();

const ROOM = "demo";
const {
  state,
  viewers,
  publisher,
  error: publishError,
} = usePublisher({
  room: ROOM,
  stream: props.stream,
});

const screen = useDisplayMedia();

// Remember the camera video track so we can swap back when sharing ends.
const cameraTrack = ref<MediaStreamTrack | null>(props.stream.getVideoTracks()[0] ?? null);

watch(
  () => [screen.state.value, screen.stream.value] as const,
  ([s, stream]) => {
    if (!publisher.value) return;
    if (s === "granted" && stream) {
      const t = stream.getVideoTracks()[0];
      if (t) void publisher.value.replaceVideoTrack(t);
    } else if (s === "ended" && cameraTrack.value) {
      void publisher.value.replaceVideoTrack(cameraTrack.value);
    }
  },
);
</script>

<template>
  <section>
    <h2>Publisher</h2>
    <VideoView
      :stream="screen.stream.value ?? props.stream"
      muted
      autoplay
      playsinline
      :mirror="screen.state.value !== 'granted'"
      class="video"
    />
    <div class="row">
      <button v-if="screen.state.value !== 'granted'" type="button" @click="screen.start()">
        Share screen
      </button>
      <button v-else type="button" @click="screen.stop()">Stop sharing</button>
    </div>
    <p>state: {{ state }}</p>
    <p>viewers: {{ viewers.length }}</p>
    <p>
      peerId: <code>{{ publisher?.peerId ?? "—" }}</code>
    </p>
    <p v-if="publishError" class="err">publish error: {{ publishError.message }}</p>
    <p v-if="screen.error.value" class="err">screen error: {{ screen.error.value.message }}</p>
  </section>
</template>
