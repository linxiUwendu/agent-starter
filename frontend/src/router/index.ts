import { createRouter, createWebHistory } from "vue-router";

import { ensureAuthLoaded, user } from "../composables/useAuth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/app",
      name: "app",
      component: () => import("../views/TravelHomeView.vue"),
    },
    {
      path: "/",
      redirect: () => (user.value || sessionStorage.getItem("travel_guest") === "1" ? "/app" : "/login"),
    },
    { path: "/:pathMatch(.*)*", redirect: "/login" },
  ],
});

router.beforeEach(async (to) => {
  await ensureAuthLoaded();

  if (to.meta.public) {
    if (to.name === "login" && user.value) return "/app";
    return true;
  }

  if (user.value) {
    sessionStorage.removeItem("travel_guest");
    return true;
  }

  if (sessionStorage.getItem("travel_guest") === "1") {
    return true;
  }

  return { path: "/login", query: to.fullPath !== "/app" ? { redirect: to.fullPath } : undefined };
});

export default router;
