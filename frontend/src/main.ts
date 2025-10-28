import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./styles/main.scss";
import { startSession } from "./services/sessionLifecycle";

const cleanupSession = startSession();
const app = createApp(App);
app.use(createPinia());
app.use(router);
const originalUnmount = app.unmount.bind(app);
app.unmount = (...args) => {
  originalUnmount(...args);
  cleanupSession();
};
app.mount("#app");
