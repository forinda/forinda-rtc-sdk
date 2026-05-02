<script setup lang="ts">
import { ref } from "vue";
import { useUserMedia } from "@forinda/video-sdk-vue";
import Publisher from "./Publisher.vue";
import Viewer from "./Viewer.vue";

const role = ref<"publisher" | "viewer" | null>(null);
const pubId = ref("");

// Pre-acquire the camera at the App level so the Publisher child can mount
// with a ready stream (publisher composable reads stream once at construction).
const { stream } = useUserMedia({ audio: true, video: true });
</script>

<template>
  <main class="main">
    <h1>Vue publisher / viewer</h1>
    <div class="row">
      <button type="button" @click="role = 'publisher'">Publish</button>
      <input v-model="pubId" type="text" placeholder="publisher peerId" />
      <button type="button" :disabled="!pubId" @click="role = 'viewer'">View</button>
    </div>
    <Publisher v-if="role === 'publisher' && stream" :stream="stream" />
    <Viewer v-if="role === 'viewer'" :publisher-id="pubId" />
  </main>
</template>

<style>
.main {
  font-family: system-ui;
  margin: 2rem;
}
.row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.video {
  width: 480px;
  max-width: 100%;
  background: #111;
  border-radius: 8px;
}
.err {
  color: crimson;
}
</style>
