<script setup lang="ts">
import { VideoView, useViewer } from "@forinda/video-sdk-vue";

const props = defineProps<{ publisherId: string }>();
const ROOM = "demo";
const { state, stream, error } = useViewer({ room: ROOM, publisherId: props.publisherId });
</script>

<template>
  <section>
    <h2>Viewer</h2>
    <VideoView :stream="stream" autoplay playsinline class="video" />
    <p>state: {{ state }}</p>
    <p v-if="error" class="err">error: {{ error.message }}</p>
  </section>
</template>
