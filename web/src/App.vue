<script setup>
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()

const menus = [
  {
    key: '/agent-console',
    title: '已发布 Agent 控制台',
    description: '切换已发布 Agent，并查看当前详情与流程对话调试。',
  },
  {
    key: '/agents',
    title: 'Agent 管理列表',
    description: '支持分页、筛选和详情查看。',
  },
]

const currentTitle = computed(
  () => menus.find((item) => item.key === route.path)?.title || 'Agent 平台'
)
</script>

<template>
  <div class="shell">
    <aside class="side-nav">
      <div class="brand-block">
        <p class="brand-kicker">Agent Platform</p>
        <h1>Agent 接入工作台</h1>
        <p>拆成独立页面，聚焦已发布 Agent 切换和管理列表。</p>
      </div>

      <nav class="menu-list">
        <RouterLink
          v-for="item in menus"
          :key="item.key"
          :to="item.key"
          class="menu-item"
          :class="{ active: route.path === item.key }"
        >
          <strong>{{ item.title }}</strong>
          <span>{{ item.description }}</span>
        </RouterLink>
      </nav>
    </aside>

    <main class="page-main">
      <header class="page-header">
        <div>
          <p class="brand-kicker">Current Page</p>
          <h2>{{ currentTitle }}</h2>
        </div>
      </header>

      <RouterView />
    </main>
  </div>
</template>
