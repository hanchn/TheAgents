<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useRoute } from 'vue-router'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MarkerType, VueFlow } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import {
  createBinding,
  createWorkflow,
  getAgentPage,
  getBindings,
  getWorkflows,
  updateBinding,
  updateWorkflow,
} from '../lib/api'

const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const workflows = ref([])
const agents = ref([])
const bindings = ref([])
const selectedWorkflowId = ref('')
const selectedAgentId = ref('')
const selectedNodeId = ref('')
const flowNodes = ref([])
const flowEdges = ref([])
const bindingSaving = ref(false)

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

const palette = [
  { label: '触发器', kind: 'trigger' },
  { label: 'AI 节点', kind: 'ai' },
  { label: '路由器', kind: 'router' },
  { label: '工具节点', kind: 'tool' },
  { label: '输出节点', kind: 'output' },
]

const workflowOptions = computed(() =>
  workflows.value.map((item) => ({
    value: item.id,
    label: `${item.name} · v${item.version} · ${item.status}`,
  }))
)

const agentOptions = computed(() =>
  agents.value.map((item) => ({
    value: item.id,
    label: `${item.name} · ${item.code}`,
  }))
)

const currentWorkflow = computed(
  () => workflows.value.find((item) => item.id === selectedWorkflowId.value) || null
)
const currentBinding = computed(
  () =>
    bindings.value.find(
      (item) => item.agentId === selectedAgentId.value && item.workflowId === selectedWorkflowId.value
    ) || null
)
const engineStats = computed(() => [
  { label: '节点数', value: flowNodes.value.length },
  { label: '连线数', value: flowEdges.value.length },
  { label: '当前版本', value: currentWorkflow.value?.version || 0 },
  { label: '绑定状态', value: currentBinding.value ? '已绑定' : '未绑定' },
])

const selectedNode = computed(
  () => flowNodes.value.find((item) => item.id === selectedNodeId.value) || null
)

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeCode(text) {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
}

function loadWorkflowToCanvas(workflow) {
  if (!workflow) {
    workflowForm.name = ''
    workflowForm.code = ''
    workflowForm.description = ''
    workflowForm.status = 'draft'
    flowNodes.value = []
    flowEdges.value = []
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

async function loadWorkflows() {
  loading.value = true

  try {
    const response = await getWorkflows()
    workflows.value = Array.isArray(response.data.data) ? response.data.data : []

    if (!selectedWorkflowId.value && workflows.value.length > 0) {
      selectedWorkflowId.value = workflows.value[0].id
    } else if (selectedWorkflowId.value) {
      loadWorkflowToCanvas(currentWorkflow.value)
    }
  } catch (error) {
    message.error('获取流程列表失败')
  } finally {
    loading.value = false
  }
}

async function loadAgents() {
  try {
    const response = await getAgentPage({
      page: 1,
      pageSize: 100,
    })
    const payload = response.data.data || {}
    agents.value = Array.isArray(payload.list) ? payload.list : []

    const targetAgentId = route.query.agentId
    if (typeof targetAgentId === 'string' && agents.value.some((item) => item.id === targetAgentId)) {
      selectedAgentId.value = targetAgentId
    } else if (!selectedAgentId.value && agents.value.length > 0) {
      selectedAgentId.value = agents.value[0].id
    }
  } catch (error) {
    message.error('获取 Agent 列表失败')
  }
}

async function loadBindings() {
  try {
    const response = await getBindings()
    bindings.value = Array.isArray(response.data.data) ? response.data.data : []
  } catch (error) {
    message.error('获取绑定关系失败')
  }
}

function addNode(kind) {
  const index = flowNodes.value.length + 1
  const node = {
    id: `node-${Date.now()}`,
    type: 'default',
    position: {
      x: 120 + ((index - 1) % 3) * 240,
      y: 100 + Math.floor((index - 1) / 3) * 160,
    },
    data: {
      label: `${kind}-${index}`,
      kind,
      prompt: `配置 ${kind} 节点逻辑`,
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
      label: 'next',
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

async function createNewWorkflow() {
  if (!workflowForm.name.trim()) {
    return message.warning('请输入流程名称')
  }

  saving.value = true
  try {
    const response = await createWorkflow({
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
    await loadWorkflows()
    selectedWorkflowId.value = response.data.data.id
  } catch (error) {
    message.error(error.response?.data?.message || '创建流程失败')
  } finally {
    saving.value = false
  }
}

async function saveWorkflow({ publish = false } = {}) {
  if (!selectedWorkflowId.value) {
    return message.warning('请先选择一个流程')
  }

  saving.value = true
  try {
    await updateWorkflow(selectedWorkflowId.value, {
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

    message.success(publish ? '流程已发布' : '流程已保存')
    await loadWorkflows()
  } catch (error) {
    message.error(error.response?.data?.message || '保存流程失败')
  } finally {
    saving.value = false
  }
}

async function saveBinding() {
  if (!selectedAgentId.value) {
    return message.warning('请先选择 Agent')
  }

  if (!selectedWorkflowId.value) {
    return message.warning('请先选择流程')
  }

  bindingSaving.value = true
  try {
    const payload = {
      agentId: selectedAgentId.value,
      workflowId: selectedWorkflowId.value,
      mode: 'sync',
      triggerType: 'manual',
      status: 'enabled',
      inputMapping: {
        query: '$input.query',
      },
      outputMapping: {
        answer: '$workflow.answer',
      },
    }

    if (currentBinding.value) {
      await updateBinding(currentBinding.value.id, payload)
      message.success('绑定已更新')
    } else {
      await createBinding(payload)
      message.success('绑定已创建')
    }

    await loadBindings()
  } catch (error) {
    message.error(error.response?.data?.message || '保存绑定失败')
  } finally {
    bindingSaving.value = false
  }
}

watch(selectedWorkflowId, () => {
  loadWorkflowToCanvas(currentWorkflow.value)
})

onMounted(async () => {
  await Promise.all([loadWorkflows(), loadAgents(), loadBindings()])
})
</script>

<template>
  <div class="page-stack">
    <div class="workflow-engine-layout">
      <a-card title="节点面板" class="panel-card workflow-panel-card">
        <div class="workflow-panel-tip">拖拽能力后续可继续补，这一版先保证节点新增、编辑、连线、绑定闭环。</div>
        <div class="workflow-palette">
          <button
            v-for="item in palette"
            :key="item.kind"
            class="workflow-palette-item"
            @click="addNode(item.kind)"
          >
            <strong>{{ item.label }}</strong>
            <span>{{ item.kind }}</span>
          </button>
        </div>
      </a-card>

      <a-card title="流程引擎" :loading="loading" class="panel-card workflow-canvas-card">
        <template #extra>
          <div class="workflow-topbar">
            <div class="workflow-topbar-meta">
              <span>流程选择</span>
              <span>选择后可直接进入画布编辑</span>
            </div>
            <a-select
              v-model:value="selectedWorkflowId"
              class="workflow-select"
              placeholder="选择流程"
              :options="workflowOptions"
            />
            <a-button @click="removeSelectedNode">删除节点</a-button>
          </div>
        </template>

        <div class="workflow-canvas-shell">
          <div class="workflow-canvas-toolbar">
            <span>{{ currentWorkflow?.name || '未选择流程' }}</span>
            <span>{{ currentWorkflow?.status || 'draft' }}</span>
          </div>
          <VueFlow
            v-model:nodes="flowNodes"
            v-model:edges="flowEdges"
            class="workflow-engine-canvas"
            @connect="onConnect"
            @node-click="onNodeClick"
          >
            <Background />
            <MiniMap />
            <Controls />
          </VueFlow>
        </div>
      </a-card>

      <a-card title="属性面板" class="panel-card workflow-panel-card">
        <a-form layout="vertical">
          <div class="workflow-panel-tip">先选 Agent，再保存流程，最后绑定到当前 Agent。</div>
          <a-form-item label="当前 Agent">
            <a-select
              v-model:value="selectedAgentId"
              placeholder="选择要编排的 Agent"
              :options="agentOptions"
            />
          </a-form-item>
          <div class="workflow-binding-state">
            <strong>{{ currentBinding ? '当前 Agent 已绑定该流程' : '当前 Agent 尚未绑定该流程' }}</strong>
            <span>
              {{ currentBinding ? `${currentBinding.mode} / ${currentBinding.triggerType}` : '保存后可直接建立绑定关系' }}
            </span>
          </div>
          <a-form-item label="流程名称">
            <a-input v-model:value="workflowForm.name" />
          </a-form-item>
          <a-form-item label="流程编码">
            <a-input v-model:value="workflowForm.code" />
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

          <div class="workflow-panel-title">节点属性</div>

          <a-form-item label="节点标题">
            <a-input v-model:value="nodeForm.label" :disabled="!selectedNode" />
          </a-form-item>
          <a-form-item label="节点类型">
            <a-select
              v-model:value="nodeForm.kind"
              :disabled="!selectedNode"
              :options="[
                { value: 'trigger', label: 'trigger' },
                { value: 'ai', label: 'ai' },
                { value: 'router', label: 'router' },
                { value: 'tool', label: 'tool' },
                { value: 'output', label: 'output' },
              ]"
            />
          </a-form-item>
          <a-form-item label="节点逻辑">
            <a-textarea v-model:value="nodeForm.prompt" :rows="4" :disabled="!selectedNode" />
          </a-form-item>

          <a-space direction="vertical" class="full-width">
            <a-button block :loading="bindingSaving" @click="saveBinding">
              {{ currentBinding ? '更新 Agent 绑定' : '绑定到当前 Agent' }}
            </a-button>
            <a-button block @click="updateSelectedNode">更新节点</a-button>
            <a-button type="primary" block :loading="saving" @click="createNewWorkflow">新建流程</a-button>
            <a-button block :loading="saving" @click="saveWorkflow()">保存流程</a-button>
            <a-button type="primary" ghost block :loading="saving" @click="saveWorkflow({ publish: true })">
              发布流程
            </a-button>
          </a-space>
        </a-form>
      </a-card>
    </div>
  </div>
</template>
