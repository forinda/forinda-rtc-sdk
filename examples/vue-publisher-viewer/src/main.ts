import { createApp } from "vue";
import { VideoSdkPlugin } from "@forinda/video-sdk-vue";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";
import App from "./App.vue";

const SIGNALING_URL = "ws://127.0.0.1:8787";

createApp(App)
  .use(VideoSdkPlugin, {
    signaling: () => defineWebSocketSignaling({ url: SIGNALING_URL }),
  })
  .mount("#app");
