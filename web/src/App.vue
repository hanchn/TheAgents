<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import axios from 'axios'
import { message } from 'ant-design-vue'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MarkerType, VueFlow } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'

const client = axios.create({
  baseURL: 'http://localhost:4000/api',
  timeout: 8000,
})

const activeTab = ref('overview')
const loading = ref(false)
const agents = ref([])
const workflows = ref([])
const bindings = ref([])
const dashboard = ref({
  agents: [],
  workflows: [],
  bindings: [],
})

const selectedWorkflowId = ref('')
const selectedNodeId = ref('')
const flowNodes = ref([])
const flowEdges = ref([])

const workflowForm = reactive({
  name: '',
  code: '',
  description: '',
  status: 'draft',
})

const nodeForm = reactive({
  label: '',
  kind: 'task',
  prompt: '',
})

const agentForm = reactive({
  name: '',
  code: '',
  type: 'assistant',
  status: 'active',
  endpoint: '',
  description: '',
  capabilitiesText: 'faq,workflow-binding',
  configText: '{\n  "model": "gpt-4.1",\n  "timeoutMs": 12000\n}',
})

const bindingForm = reactive({
  agentId: '',
  workflowId: '',
  mode: 'sync',
  triggerType: 'manual',
  status: 'enabled',
  inputMappingText: '{\n  "query": "$input.query",\n  "history": "$input.history"\n}',
  outputMappingText: '{\n  "answer": "$workflow.answer",\n  "route": "$workflow.route"\n}',
})

const chatAgentId = ref('')
const chatInput = ref('')
const chatLoading = ref(false)
const chatTrace = ref([])
const chatSessions = ref({})

const statCards = computed(() => [
  {
    label: 'Agent',
    value: agents.value.length,
    note: '接入的执行体与模型能力',
  },
  {
    label: 'Flow',
    value: workflows.value.length,
    note: '可设计、可版本化的流程',
  },
  {
    label: 'Binding',
    value: bindings.value.length,
    note: 'Agent 与流程的绑定关系',
  },
])

const workflowOptions = computed(() =>
  workflows.value.map((item) => ({
    value: item.id,
    label: `${item.name} · v${item.version} · ${item.status}`,
  }))
)

const agentOptions = computed(() =>
  agents.value.map((item) => ({
    value: item.id,
    label: `${item.name} · ${item.type}`,
  }))
)

const currentWorkflow = computed(
  () => workflows.value.find((item) => item.id === selectedWorkflowId.value) || null
)

const selectedNode = computed(
  () => flowNodes.value.find((item) => item.id === selectedNodeId.value) || null
)

const currentChatAgent = computed(
  () => agents.value.find((item) => item.id === chatAgentId.value) || null
)

const currentChatBinding = computed(
  () =>
    bindings.value.find((item) => item.agentId === chatAgentId.value && item.status === 'enabled') || null
)

const currentChatMessages = computed(() => chatSessions.value[chatAgentId.value] || [])

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function safeJsonParse(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback
  } catch (error) {
    throw new Error('JSON 配置格式不正确')
  }
}

function normalizeCode(text) {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
}

function ensureChatSession(agentId) {
  if (!agentId || chatSessions.value[agentId]) {
    return
  }

  chatSessions.value = {
    ...chatSessions.value,
    [agentId]: [
      {
        id: `welcome-${agentId}`,
        role: 'assistant',
        content: '已进入当前 Agent 调试会话，你可以直接发送一条消息测试它绑定的流程。',
      },
    ],
  }
}

function pushChatMessage(agentId, role, content, meta = {}) {
  const history = chatSessions.value[agentId] || []

  chatSessions.value = {
    ...chatSessions.value,
    [agentId]: [
      ...history,
      {
        id: `${role}-${Date.now()}-${history.length}`,
        role,
        content,
        ...meta,
      },
    ],
  }
}

function syncNodeForm(node) {
  if (!node) {
    selectedNodeId.value = ''
    nodeForm.label = ''
    nodeForm.kind = 'task'
    nodeForm.prompt = ''
    return
  }

  selectedNodeId.value = node.id
  nodeForm.label = node.data?.label || ''
  nodeForm.kind = node.data?.kind || 'task'
  nodeForm.prompt = node.data?.prompt || ''
}

function loadWorkflowIntoCanvas(workflow) {
  if (!workflow) {
    flowNodes.value = []
    flowEdges.value = []
    workflowForm.name = ''
    workflowForm.code = ''
    workflowForm.description = ''
    workflowForm.status = 'draft'
    syncNodeForm(null)
    return
  }

  workflowForm.name = workflow.name
  workflowForm.code = workflow.code
  workflowForm.description = workflow.description || ''
  workflowForm.status = workflow.status
  flowNodes.value = clone(workflow.definition?.nodes || [])
  flowEdges.value = clone(workflow.definition?.edges || [])
  syncNodeForm(flowNodes.value[0] || null)
}

async function fetchAll() {
  loading.value = true

  try {
    const [dashboardRes, agentRes, workflowRes, bindingRes] = await Promise.all([
      client.get('/dashboard'),
      client.get('/agents'),
      client.get('/workflows'),
      client.get('/bindings'),
    ])

    dashboard.value = dashboardRes.data.data
    agents.value = Array.isArray(agentRes.data.data) ? agentRes.data.data : []
    workflows.value = Array.isArray(workflowRes.data.data) ? workflowRes.data.data : []
    bindings.value = Array.isArray(bindingRes.data.data) ? bindingRes.data.data : []

    if (!selectedWorkflowId.value && workflows.value.length > 0) {
      selectedWorkflowId.value = workflows.value[0].id
    } else if (selectedWorkflowId.value) {
      loadWorkflowIntoCanvas(currentWorkflow.value)
    }

    if (!bindingForm.agentId && agents.value.length > 0) {
      bindingForm.agentId = agents.value[0].id
    }
    if (!bindingForm.workflowId && workflows.value.length > 0) {
      bindingForm.workflowId = workflows.value[0].id
    }
    if (!chatAgentId.value && agents.value.length > 0) {
      chatAgentId.value = agents.value[0].id
    }
  } catch (error) {
    message.error('后端接口未就绪，请先启动 server 服务')
  } finally {
    loading.value = false
  }
}

async function createAgent() {
  if (!agentForm.name.trim()) {
    return message.warning('请输入 Agent 名称')
  }

  try {
    await client.post('/agents', {
      name: agentForm.name.trim(),
      code: normalizeCode(agentForm.code || agentForm.name),
      type: agentForm.type,
      status: agentForm.status,
      endpoint: agentForm.endpoint.trim(),
      description: agentForm.description.trim(),
      capabilities: agentForm.capabilitiesText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      config: safeJsonParse(agentForm.configText, {}),
    })

    message.success('Agent 已创建')
    agentForm.name = ''
    agentForm.code = ''
    agentForm.endpoint = ''
    agentForm.description = ''
    await fetchAll()
  } catch (error) {
    message.error(error.response?.data?.message || error.message || '创建 Agent 失败')
  }
}

async function createWorkflow() {
  if (!workflowForm.name.trim()) {
    return message.warning('请输入流程名称')
  }

  try {
    const response = await client.post('/workflows', {
      name: workflowForm.name.trim(),
      code: normalizeCode(workflowForm.code || workflowForm.name),
      description: workflowForm.description.trim(),
      status: workflowForm.status,
      definition: {
        nodes: clone(flowNodes.value),
        edges: clone(flowEdges.value),
      },
    })

    message.success('流程已创建')
    await fetchAll()
    selectedWorkflowId.value = response.data.data.id
  } catch (error) {
    message.error(error.response?.data?.message || error.message || '创建流程失败')
  }
}

async function saveWorkflow({ publish = false } = {}) {
  if (!selectedWorkflowId.value) {
    return message.warning('请先选择一个流程')
  }

  try {
    await client.put(`/workflows/${selectedWorkflowId.value}`, {
      name: workflowForm.name.trim(),
      code: normalizeCode(workflowForm.code || workflowForm.name),
      description: workflowForm.description.trim(),
      status: publish ? 'published' : workflowForm.status,
      bumpVersion: publish,
      definition: {
        nodes: clone(flowNodes.value),
        edges: clone(flowEdges.value),
      },
    })

    message.success(publish ? '流程已发布并升级版本' : '流程已保存')
    await fetchAll()
  } catch (error) {
    message.error(error.response?.data?.message || error.message || '保存流程失败')
  }
}

async function createBinding() {
  if (!bindingForm.agentId || !bindingForm.workflowId) {
    return message.warning('请选择 Agent 和流程')
  }

  try {
    await client.post('/bindings', {
      agentId: bindingForm.agentId,
      workflowId: bindingForm.workflowId,
      mode: bindingForm.mode,
      triggerType: bindingForm.triggerType,
      status: bindingForm.status,
      inputMapping: safeJsonParse(bindingForm.inputMappingText, {}),
      outputMapping: safeJsonParse(bindingForm.outputMappingText, {}),
    })

    message.success('绑定关系已创建')
    await fetchAll()
  } catch (error) {
    message.error(error.response?.data?.message || error.message || '创建绑定失败')
  }
}

async function sendChatMessage() {
  const messageText = chatInput.value.trim()
  if (!chatAgentId.value) {
    return message.warning('请先选择一个 Agent')
  }
  if (!messageText) {
    return message.warning('请输入要发送的内容')
  }

  ensureChatSession(chatAgentId.value)
  pushChatMessage(chatAgentId.value, 'user', messageText)
  chatInput.value = ''
  chatLoading.value = true

  try {
    const response = await client.post('/chat/simulate', {
      agentId: chatAgentId.value,
      message: messageText,
    })

    const payload = response.data.data
    chatTrace.value = Array.isArray(payload.trace) ? payload.trace : []
    pushChatMessage(chatAgentId.value, 'assistant', payload.reply, {
      workflowName: payload.workflowName,
    })
  } catch (error) {
    pushChatMessage(
      chatAgentId.value,
      'assistant',
      error.response?.data?.message || '当前 Agent 对话模拟失败，请检查绑定关系'
    )
  } finally {
    chatLoading.value = false
  }
}

function addNode(kind) {
  const index = flowNodes.value.length + 1
  const node = {
    id: `node-${Date.now()}`,
    type: 'default',
    position: {
      x: 140 + ((index - 1) % 3) * 240,
      y: 120 + Math.floor((index - 1) / 3) * 150,
    },
    data: {
      label: `${kind}-${index}`,
      kind,
      prompt: `这里配置 ${kind} 节点的提示词或执行参数`,
    },
  }

  flowNodes.value = [...flowNodes.value, node]
  syncNodeForm(node)
}

function onConnect(connection) {
  if (!connection.source || !connection.target) {
    return
  }

  flowEdges.value = [
    ...flowEdges.value,
    {
      ...connection,
      id: `edge-${Date.now()}`,
      label: '链路',
      markerEnd: MarkerType.ArrowClosed,
    },
  ]
}

function onNodeClick(payload) {
  syncNodeForm(payload.node)
}

function updateSelectedNode() {
  if (!selectedNode.value) {
    return
  }

  flowNodes.value = flowNodes.value.map((node) =>
    node.id === selectedNodeId.value
      ? {
          ...node,
          data: {
            ...node.data,
            label: nodeForm.label,
            kind: nodeForm.kind,
            prompt: nodeForm.prompt,
          },
        }
      : node
  )
}

function removeSelectedNode() {
  if (!selectedNodeId.value) {
    return
  }

  flowNodes.value = flowNodes.value.filter((node) => node.id !== selectedNodeId.value)
  flowEdges.value = flowEdges.value.filter(
    (edge) => edge.source !== selectedNodeId.value && edge.target !== selectedNodeId.value
  )
  syncNodeForm(flowNodes.value[0] || null)
}

watch(selectedWorkflowId, () => {
  loadWorkflowIntoCanvas(currentWorkflow.value)
  if (selectedWorkflowId.value) {
    bindingForm.workflowId = selectedWorkflowId.value
  }
})

watch(
  () => bindingForm.agentId,
  () => {
    if (!bindingForm.agentId && agents.value.length > 0) {
      bindingForm.agentId = agents.value[0].id
    }
  }
)

watch(chatAgentId, () => {
  ensureChatSession(chatAgentId.value)
  chatTrace.value = []
})

onMounted(fetchAll)
</script>

<template>
  <div class="app-shell">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">Agent Workflow Workbench</p>
        <h1>Agent 接入台 + 流程引擎工作台</h1>
        <p class="hero-text">
          用一个平台管理 Agent 能力接入、流程设计、版本发布和绑定关系，让不同 Agent
          可以复用你编排好的流程。
        </p>
      </div>
      <div class="hero-actions">
        <a-button type="primary" size="large" @click="activeTab = 'workflow'">开始设计流程</a-button>
        <a-button size="large" @click="activeTab = 'binding'">去做绑定</a-button>
      </div>
    </section>

    <section class="stats-grid">
      <article v-for="item in statCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
        <span class="stat-note">{{ item.note }}</span>
      </article>
    </section>

    <a-tabs v-model:activeKey="activeTab" class="main-tabs">
      <a-tab-pane key="overview" tab="总览">
        <div class="panel-grid panel-grid-2">
          <a-card title="最近绑定" :loading="loading">
            <div v-if="dashboard.bindings?.length" class="stack-list">
              <div v-for="item in dashboard.bindings" :key="item.id" class="stack-item">
                <div>
                  <strong>{{ item.agentName }}</strong>
                  <span>{{ item.workflowName }}</span>
                </div>
                <a-tag color="blue">{{ item.mode }}</a-tag>
              </div>
            </div>
            <a-empty v-else description="暂无绑定关系" />
          </a-card>

          <a-card title="平台能力">
            <div class="capability-list">
              <div class="capability-item">
                <strong>Agent 接入</strong>
                <span>维护 Agent 基本信息、能力声明、调用端点与运行配置。</span>
              </div>
              <div class="capability-item">
                <strong>流程设计</strong>
                <span>节点画布 + 右侧表单联动，支持编辑提示词、节点类型和边连接关系。</span>
              </div>
              <div class="capability-item">
                <strong>流程绑定</strong>
                <span>一个 Agent 可绑定不同编排流程，支持手动触发、同步/异步模式。</span>
              </div>
            </div>
          </a-card>
        </div>
      </a-tab-pane>

      <a-tab-pane key="agent" tab="Agent 接入">
        <div class="panel-grid panel-grid-2">
          <a-card title="新增 Agent">
            <a-form layout="vertical">
              <a-form-item label="名称">
                <a-input v-model:value="agentForm.name" placeholder="例如：Support Copilot" />
              </a-form-item>
              <a-form-item label="编码">
                <a-input v-model:value="agentForm.code" placeholder="support-copilot" />
              </a-form-item>
              <a-form-item label="类型">
                <a-select
                  v-model:value="agentForm.type"
                  :options="[
                    { value: 'assistant', label: 'assistant' },
                    { value: 'router', label: 'router' },
                    { value: 'planner', label: 'planner' },
                  ]"
                />
              </a-form-item>
              <a-form-item label="状态">
                <a-select
                  v-model:value="agentForm.status"
                  :options="[
                    { value: 'active', label: 'active' },
                    { value: 'paused', label: 'paused' },
                  ]"
                />
              </a-form-item>
              <a-form-item label="Endpoint">
                <a-input v-model:value="agentForm.endpoint" placeholder="http://localhost:4000/runtime" />
              </a-form-item>
              <a-form-item label="能力列表">
                <a-input v-model:value="agentForm.capabilitiesText" placeholder="faq,workflow-binding" />
              </a-form-item>
              <a-form-item label="配置 JSON">
                <a-textarea v-model:value="agentForm.configText" :rows="5" />
              </a-form-item>
              <a-form-item label="描述">
                <a-textarea v-model:value="agentForm.description" :rows="3" />
              </a-form-item>
              <a-button type="primary" block @click="createAgent">创建 Agent</a-button>
            </a-form>
          </a-card>

          <a-card title="Agent 列表" :loading="loading">
            <div v-if="agents.length" class="stack-list">
              <div v-for="item in agents" :key="item.id" class="agent-card">
                <div class="agent-card-header">
                  <div>
                    <strong>{{ item.name }}</strong>
                    <span>{{ item.code }}</span>
                  </div>
                  <a-tag :color="item.status === 'active' ? 'green' : 'orange'">{{ item.status }}</a-tag>
                </div>
                <p>{{ item.description || '暂无描述' }}</p>
                <div class="tag-row">
                  <a-tag>{{ item.type }}</a-tag>
                  <a-tag v-for="cap in item.capabilities || []" :key="cap">{{ cap }}</a-tag>
                </div>
              </div>
            </div>
            <a-empty v-else description="暂无 Agent" />
          </a-card>
        </div>
      </a-tab-pane>

      <a-tab-pane key="chat" tab="对话调试台">
        <div class="chat-layout">
          <a-card title="切换 Agent" class="chat-side-card">
            <a-select v-model:value="chatAgentId" :options="agentOptions" class="full-width" />
            <div class="workflow-list">
              <button
                v-for="item in agents"
                :key="item.id"
                class="workflow-list-item"
                :class="{ active: item.id === chatAgentId }"
                @click="chatAgentId = item.id"
              >
                <strong>{{ item.name }}</strong>
                <span>{{ item.type }} · {{ item.status }}</span>
              </button>
            </div>
          </a-card>

          <a-card title="会话窗口" class="chat-main-card">
            <div class="chat-meta">
              <div>
                <strong>{{ currentChatAgent?.name || '未选择 Agent' }}</strong>
                <span>
                  当前流程：{{ currentChatBinding?.workflowName || '未绑定流程，请先去流程绑定台配置' }}
                </span>
              </div>
              <a-tag :color="currentChatBinding ? 'blue' : 'default'">
                {{ currentChatBinding?.mode || 'unbound' }}
              </a-tag>
            </div>

            <div class="chat-window">
              <div
                v-for="item in currentChatMessages"
                :key="item.id"
                class="chat-message"
                :class="item.role"
              >
                <span class="chat-role">{{ item.role === 'user' ? '我' : 'Agent' }}</span>
                <div class="chat-bubble">
                  <p>{{ item.content }}</p>
                  <small v-if="item.workflowName">命中流程：{{ item.workflowName }}</small>
                </div>
              </div>
            </div>

            <div class="chat-composer">
              <a-textarea
                v-model:value="chatInput"
                :rows="4"
                placeholder="输入一条用户消息，例如：帮我判断这个客户需求该走哪个流程"
              />
              <a-button type="primary" :loading="chatLoading" @click="sendChatMessage">
                发送并走流程
              </a-button>
            </div>
          </a-card>

          <a-card title="流程轨迹" class="chat-side-card">
            <div v-if="chatTrace.length" class="trace-list">
              <div v-for="step in chatTrace" :key="step.nodeId" class="trace-item">
                <strong>Step {{ step.step }} · {{ step.label }}</strong>
                <span>{{ step.kind }}</span>
                <p>{{ step.prompt }}</p>
              </div>
            </div>
            <a-empty v-else description="发送消息后显示当前流程轨迹" />
          </a-card>
        </div>
      </a-tab-pane>

      <a-tab-pane key="workflow" tab="流程设计">
        <div class="workflow-layout">
          <a-card title="流程列表" class="workflow-side-card">
            <a-select
              v-model:value="selectedWorkflowId"
              show-search
              placeholder="选择一个流程"
              :options="workflowOptions"
              class="full-width"
            />
            <div class="workflow-list">
              <button
                v-for="item in workflows"
                :key="item.id"
                class="workflow-list-item"
                :class="{ active: item.id === selectedWorkflowId }"
                @click="selectedWorkflowId = item.id"
              >
                <strong>{{ item.name }}</strong>
                <span>{{ item.code }} · v{{ item.version }} · {{ item.status }}</span>
              </button>
            </div>
          </a-card>

          <a-card title="流程画布" class="workflow-canvas-card">
            <template #extra>
              <div class="toolbar">
                <a-button size="small" @click="addNode('intent')">意图节点</a-button>
                <a-button size="small" @click="addNode('router')">路由节点</a-button>
                <a-button size="small" @click="addNode('tool')">工具节点</a-button>
                <a-button size="small" danger @click="removeSelectedNode">删除节点</a-button>
              </div>
            </template>

            <VueFlow
              v-model:nodes="flowNodes"
              v-model:edges="flowEdges"
              class="flow-canvas"
              @connect="onConnect"
              @node-click="onNodeClick"
            >
              <Background />
              <MiniMap />
              <Controls />
            </VueFlow>
          </a-card>

          <a-card title="属性面板" class="workflow-side-card">
            <a-form layout="vertical">
              <a-form-item label="流程名称">
                <a-input v-model:value="workflowForm.name" placeholder="例如：客服分诊流程" />
              </a-form-item>
              <a-form-item label="流程编码">
                <a-input v-model:value="workflowForm.code" placeholder="support-triage" />
              </a-form-item>
              <a-form-item label="状态">
                <a-select
                  v-model:value="workflowForm.status"
                  :options="[
                    { value: 'draft', label: 'draft' },
                    { value: 'published', label: 'published' },
                  ]"
                />
              </a-form-item>
              <a-form-item label="流程描述">
                <a-textarea v-model:value="workflowForm.description" :rows="3" />
              </a-form-item>

              <div class="property-title">当前节点</div>

              <a-form-item label="节点标题">
                <a-input v-model:value="nodeForm.label" :disabled="!selectedNode" />
              </a-form-item>
              <a-form-item label="节点类型">
                <a-select
                  v-model:value="nodeForm.kind"
                  :disabled="!selectedNode"
                  :options="[
                    { value: 'intent', label: 'intent' },
                    { value: 'router', label: 'router' },
                    { value: 'tool', label: 'tool' },
                    { value: 'task', label: 'task' },
                  ]"
                />
              </a-form-item>
              <a-form-item label="提示词 / 参数">
                <a-textarea v-model:value="nodeForm.prompt" :rows="4" :disabled="!selectedNode" />
              </a-form-item>

              <a-space direction="vertical" class="full-width">
                <a-button block @click="updateSelectedNode">更新节点</a-button>
                <a-button type="primary" block @click="createWorkflow">新建流程</a-button>
                <a-button block @click="saveWorkflow()">保存流程</a-button>
                <a-button type="primary" ghost block @click="saveWorkflow({ publish: true })">
                  发布并升级版本
                </a-button>
              </a-space>
            </a-form>
          </a-card>
        </div>
      </a-tab-pane>

      <a-tab-pane key="binding" tab="流程绑定">
        <div class="panel-grid panel-grid-2">
          <a-card title="创建绑定">
            <a-form layout="vertical">
              <a-form-item label="选择 Agent">
                <a-select v-model:value="bindingForm.agentId" :options="agentOptions" />
              </a-form-item>
              <a-form-item label="选择流程">
                <a-select v-model:value="bindingForm.workflowId" :options="workflowOptions" />
              </a-form-item>
              <a-form-item label="执行模式">
                <a-select
                  v-model:value="bindingForm.mode"
                  :options="[
                    { value: 'sync', label: 'sync' },
                    { value: 'async', label: 'async' },
                  ]"
                />
              </a-form-item>
              <a-form-item label="触发方式">
                <a-select
                  v-model:value="bindingForm.triggerType"
                  :options="[
                    { value: 'manual', label: 'manual' },
                    { value: 'event', label: 'event' },
                    { value: 'schedule', label: 'schedule' },
                  ]"
                />
              </a-form-item>
              <a-form-item label="状态">
                <a-select
                  v-model:value="bindingForm.status"
                  :options="[
                    { value: 'enabled', label: 'enabled' },
                    { value: 'disabled', label: 'disabled' },
                  ]"
                />
              </a-form-item>
              <a-form-item label="输入映射 JSON">
                <a-textarea v-model:value="bindingForm.inputMappingText" :rows="4" />
              </a-form-item>
              <a-form-item label="输出映射 JSON">
                <a-textarea v-model:value="bindingForm.outputMappingText" :rows="4" />
              </a-form-item>
              <a-button type="primary" block @click="createBinding">创建绑定</a-button>
            </a-form>
          </a-card>

          <a-card title="绑定列表" :loading="loading">
            <div v-if="bindings.length" class="stack-list">
              <div v-for="item in bindings" :key="item.id" class="binding-card">
                <div class="agent-card-header">
                  <div>
                    <strong>{{ item.agentName }}</strong>
                    <span>{{ item.workflowName }}</span>
                  </div>
                  <a-tag :color="item.status === 'enabled' ? 'green' : 'default'">{{ item.status }}</a-tag>
                </div>
                <div class="tag-row">
                  <a-tag color="blue">{{ item.mode }}</a-tag>
                  <a-tag color="purple">{{ item.triggerType }}</a-tag>
                </div>
                <pre>{{ JSON.stringify(item.inputMapping, null, 2) }}</pre>
              </div>
            </div>
            <a-empty v-else description="暂无绑定关系" />
          </a-card>
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>
