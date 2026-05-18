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
        content: '已进入当前 Agent 调试页。这里仅允许切换已发布 Agent。',
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
    <section class="hero-card">
      <div>
        <p class="brand-kicker">Published Agent Console</p>
        <h3>已发布 Agent 切换页</h3>
        <p>这个页面只展示已发布 Agent，左侧切换，右侧查看详情并直接做流程对话调试。</p>
      </div>
    </section>

    <div class="console-layout">
      <a-card title="已发布 Agent" :loading="loading" class="panel-card">
        <div class="agent-switcher">
          <button
            v-for="item in agents"
            :key="item.id"
            class="agent-switcher-item"
            :class="{ active: item.id === selectedAgentId }"
            @click="selectedAgentId = item.id"
          >
            <strong>{{ item.name }}</strong>
            <span>{{ item.code }} · v{{ item.version }}</span>
            <span>{{ item.owner || '未设置负责人' }}</span>
          </button>
        </div>
      </a-card>

      <div class="page-stack">
        <a-card title="Agent 详情" class="panel-card">
          <div v-if="selectedAgentDetail" class="detail-grid">
            <div class="detail-card highlight">
              <span class="detail-label">Agent</span>
              <strong class="detail-value">{{ selectedAgentDetail.name }}</strong>
              <span class="detail-desc">{{ selectedAgentDetail.description || '暂无描述' }}</span>
            </div>
            <div class="detail-card">
              <span class="detail-label">发布状态</span>
              <strong class="detail-value">{{ selectedAgentDetail.publishStatus }}</strong>
              <span class="detail-desc">版本 v{{ selectedAgentDetail.version }}</span>
            </div>
            <div class="detail-card">
              <span class="detail-label">当前流程</span>
              <strong class="detail-value">
                {{ selectedAgentDetail.workflows?.[0]?.name || '暂无已发布流程' }}
              </strong>
              <span class="detail-desc">{{ selectedAgentDetail.endpoint }}</span>
            </div>
          </div>

          <div v-if="selectedAgentDetail" class="meta-section">
            <div class="meta-block">
              <strong>能力</strong>
              <div class="tag-row">
                <a-tag v-for="cap in selectedAgentDetail.capabilities || []" :key="cap">{{ cap }}</a-tag>
              </div>
            </div>
            <div class="meta-block">
              <strong>流程绑定</strong>
              <div class="tag-row">
                <a-tag v-for="item in selectedAgentDetail.bindings || []" :key="item.id" color="blue">
                  {{ item.workflowName }} · {{ item.mode }}
                </a-tag>
              </div>
            </div>
          </div>
        </a-card>

        <div class="console-main">
          <a-card title="对话窗口" class="panel-card">
            <div class="chat-window">
              <div
                v-for="item in currentMessages"
                :key="item.id"
                class="chat-message"
                :class="item.role"
              >
                <span class="chat-role">{{ item.role === 'user' ? '我' : selectedAgent?.name || 'Agent' }}</span>
                <div class="chat-bubble">
                  <p>{{ item.content }}</p>
                  <small v-if="item.workflowName">流程：{{ item.workflowName }}</small>
                </div>
              </div>
            </div>
            <div class="chat-composer">
              <a-textarea
                v-model:value="chatInput"
                :rows="4"
                placeholder="输入问题，验证当前已发布 Agent 的接入效果"
              />
              <a-button type="primary" :loading="chatLoading" @click="sendMessage">发送消息</a-button>
            </div>
          </a-card>

          <a-card title="执行轨迹" class="panel-card">
            <div v-if="trace.length" class="trace-list">
              <div v-for="item in trace" :key="item.nodeId" class="trace-item">
                <strong>Step {{ item.step }} · {{ item.label }}</strong>
                <span>{{ item.kind }}</span>
                <p>{{ item.prompt }}</p>
              </div>
            </div>
            <a-empty v-else description="发送消息后显示当前流程轨迹" />
          </a-card>
        </div>
      </div>
    </div>
  </div>
</template>
