import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/import",
  },
  {
    path: "/import",
    name: "import",
    component: () => import("../views/ImportView.vue"),
  },
  {
    path: "/transactions",
    name: "transactions",
    component: () => import("../views/TransactionsView.vue"),
  },
  {
    path: "/settings/bank-schemas",
    name: "settings-bank-schemas",
    component: () => import("../views/SettingsBankSchemasView.vue"),
  },
  {
    path: "/settings/anonymization",
    name: "settings-anonymization",
    component: () => import("../views/SettingsAnonymizationRulesView.vue"),
  },
  {
    path: "/settings/display",
    name: "settings-display",
    component: () => import("../views/SettingsDisplayView.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
