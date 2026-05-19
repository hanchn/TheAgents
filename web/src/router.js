import { createRouter, createWebHistory } from 'vue-router'
import AgentConsolePage from './pages/AgentConsolePage.vue'
import AgentManagementPage from './pages/AgentManagementPage.vue'
import WorkflowOrchestrationPage from './pages/WorkflowOrchestrationPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/workflow-orchestration',
    },
    {
      path: '/workflow-orchestration',
      name: 'workflow-orchestration',
      component: WorkflowOrchestrationPage,
    },
    {
      path: '/agent-chat',
      name: 'agent-chat',
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
