import { createRouter, createWebHistory } from 'vue-router'
import AgentConsolePage from './pages/AgentConsolePage.vue'
import AgentManagementPage from './pages/AgentManagementPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/agent-console',
    },
    {
      path: '/agent-console',
      name: 'agent-console',
      component: AgentConsolePage,
    },
    {
      path: '/agents',
      name: 'agent-management',
      component: AgentManagementPage,
    },
  ],
})

export default router
