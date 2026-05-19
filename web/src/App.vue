<script setup>
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()

const menus = [
  { key: '/workflow-orchestration', title: '流程编排' },
  { key: '/agent-chat', title: 'Agent 对话' },
  { key: '/agents', title: 'Agent 列表' },
]

const currentTitle = computed(
  () => menus.find((item) => item.key === route.path)?.title || 'Agent 平台'
)

</script>

<template>
  <div class="admin-layout">
    <aside class="admin-sider">
      <div class="admin-logo">
        <div class="admin-logo-mark">A</div>
        <div>
          <strong>Agent Admin</strong>
          <span>接入与发布后台</span>
        </div>
      </div>

      <div class="admin-menu-group">
        <div class="admin-menu-title">工作台</div>
        <nav class="admin-menu">
          <RouterLink
            v-for="item in menus"
            :key="item.key"
            :to="item.key"
            class="admin-menu-item"
            :class="{ active: route.path === item.key }"
          >
            <strong>{{ item.title }}</strong>
          </RouterLink>
        </nav>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-header">
        <div>
          <div class="admin-breadcrumb">Agent 平台 / {{ currentTitle }}</div>
          <h1>{{ currentTitle }}</h1>
        </div>
        <div class="admin-header-extra">
          <span class="admin-env-tag">后台管理</span>
        </div>
      </header>

      <main class="admin-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>
