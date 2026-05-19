<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { getAgentDetail, getPublishedAgents, simulateAgentChat } from '../lib/api'

const loading = ref(false)
const chatLoading = ref(false)
const agents = ref([])
const selectedAgentId = ref('')
const selectedAgentDetail = ref(null)
const chatInput = ref('')
const trace = ref([])
const sessions = ref({})

const selectedAgent = computed(
  () => agents.value.find((item) => item.id === selectedAgentId.value) || null
)

const currentMessages = computed(() => sessions.value[selectedAgentId.value] || [])
const agentOptions = computed(() =>
  agents.value.map((item) => ({
    value: item.id,
    label: `${item.name} · ${item.code}`,
    searchText: `${item.name} ${item.code} ${item.category || ''}`,
  }))
)

function filterAgentOption(input, option) {
  const text = `${option?.label || ''} ${option?.searchText || ''}`.toLowerCase()
  return text.includes((input || '').toLowerCase())
}

function ensureSession(agentId) {
  if (!agentId || sessions.value[agentId]) {
    return
  }

  sessions.value = {
    ...sessions.value,
    [agentId]: [
      {
        id: `welcome-${agentId}`,
        role: 'assistant',
        content: '已进入当前 Agent 调试页。这里是纯对话窗口，可通过上方搜索快速切换 Agent。',
      },
    ],
  }
}

function appendMessage(agentId, role, content, workflowName = '') {
  const history = sessions.value[agentId] || []

  sessions.value = {
    ...sessions.value,
    [agentId]: [
      ...history,
      {
        id: `${role}-${Date.now()}-${history.length}`,
        role,
        content,
        workflowName,
      },
    ],
  }
}

async function loadPublishedAgents() {
  loading.value = true

  try {
    const response = await getPublishedAgents()
    agents.value = Array.isArray(response.data.data) ? response.data.data : []

    if (agents.value.length && !selectedAgentId.value) {
      selectedAgentId.value = agents.value[0].id
    }
  } catch (error) {
    message.error('获取已发布 Agent 失败')
  } finally {
    loading.value = false
  }
}

async function loadAgentDetail(agentId) {
  if (!agentId) {
    selectedAgentDetail.value = null
    trace.value = []
    return
  }

  try {
    const response = await getAgentDetail(agentId)
    selectedAgentDetail.value = response.data.data
    ensureSession(agentId)
  } catch (error) {
    message.error('获取 Agent 详情失败')
  }
}

async function sendMessage() {
  const content = chatInput.value.trim()
  if (!selectedAgentId.value) {
    return message.warning('请先选择一个 Agent')
  }
  if (!content) {
    return message.warning('请输入消息内容')
  }

  ensureSession(selectedAgentId.value)
  appendMessage(selectedAgentId.value, 'user', content)
  chatInput.value = ''
  chatLoading.value = true

  try {
    const response = await simulateAgentChat({
      agentId: selectedAgentId.value,
      message: content,
    })
    const payload = response.data.data || {}
    trace.value = Array.isArray(payload.trace) ? payload.trace : []
    appendMessage(selectedAgentId.value, 'assistant', payload.reply || '暂无返回内容', payload.workflowName)
  } catch (error) {
    appendMessage(selectedAgentId.value, 'assistant', '调试失败，请检查当前 Agent 的流程绑定。')
  } finally {
    chatLoading.value = false
  }
}

watch(selectedAgentId, (value) => {
  if (!value) {
    return
  }
  loadAgentDetail(value)
})

onMounted(loadPublishedAgents)
</script>

<template>
  <div class="page-stack">
    <section class="chat-shell">
      <div class="chat-shell-topbar">
        <div class="chat-shell-topbar-left">
          <a-select
            v-model:value="selectedAgentId"
            class="chat-agent-select"
            show-search
            allow-clear
            :filter-option="filterAgentOption"
            :options="agentOptions"
            placeholder="搜索或选择 Agent"
          />
        </div>
        <div class="chat-shell-meta">
          <span>{{ selectedAgentDetail?.workflows?.[0]?.name || '未绑定流程' }}</span>
          <a-tag v-if="selectedAgentDetail" color="blue">v{{ selectedAgentDetail.version }}</a-tag>
        </div>
      </div>

      <div class="gpt-chat-scroll">
        <div
          v-for="item in currentMessages"
          :key="item.id"
          class="gpt-message-row"
          :class="item.role"
        >
          <div class="gpt-avatar">{{ item.role === 'user' ? '我' : 'A' }}</div>
          <div class="gpt-message-card">
            <div class="gpt-message-title">
              {{ item.role === 'user' ? '我' : selectedAgent?.name || 'Agent' }}
            </div>
            <p>{{ item.content }}</p>
            <small v-if="item.workflowName">命中流程：{{ item.workflowName }}</small>
          </div>
        </div>

        <div v-if="trace.length" class="gpt-trace-box">
          <strong>当前执行轨迹</strong>
          <div class="trace-list">
            <div v-for="item in trace" :key="item.nodeId" class="trace-item">
              <strong>Step {{ item.step }} · {{ item.label }}</strong>
              <span>{{ item.kind }}</span>
              <p>{{ item.prompt }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="gpt-composer">
        <a-textarea
          v-model:value="chatInput"
          :auto-size="{ minRows: 3, maxRows: 6 }"
          placeholder="输入消息..."
        />
        <div class="gpt-composer-actions">
          <span>{{ selectedAgent?.name || '未选择 Agent' }}</span>
          <a-button type="primary" :loading="chatLoading" @click="sendMessage">发送</a-button>
        </div>
      </div>
    </section>
  </div>
</template>
