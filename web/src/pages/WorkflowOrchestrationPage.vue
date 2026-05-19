<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useRoute } from 'vue-router'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { ConnectionLineType, MarkerType, Position, VueFlow } from '@vue-flow/core'
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
const isEditorFullscreen = ref(false)
const editingNodeId = ref('')
const editingNodeLabel = ref('')
const nodeContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  nodeId: '',
})

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

function createStartNode() {
  return {
    id: 'node-start',
    type: 'default',
    position: { x: 80, y: 220 },
    class: 'workflow-node-start',
    draggable: false,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      label: '开始',
      kind: 'start',
      prompt: '流程从这里进入。',
    },
  }
}

function createEndNode() {
  return {
    id: 'node-end',
    type: 'default',
    position: { x: 980, y: 220 },
    class: 'workflow-node-end',
    draggable: false,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      label: '结束',
      kind: 'end',
      prompt: '流程在这里结束。',
    },
  }
}

function createDefaultWorkflowDefinition() {
  return {
    nodes: [
      createStartNode(),
      {
        id: 'node-intent',
        type: 'default',
        position: { x: 340, y: 220 },
        class: 'workflow-node-default',
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: '意图识别',
          kind: 'intent',
          prompt: '分析用户输入，识别当前任务类型与约束。',
        },
      },
      {
        id: 'node-router',
        type: 'default',
        position: { x: 620, y: 220 },
        class: 'workflow-node-default',
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: '流程路由',
          kind: 'router',
          prompt: '根据业务规则决定进入哪个执行流程。',
        },
      },
      createEndNode(),
    ],
    edges: [
      {
        id: 'edge-start-intent',
        source: 'node-start',
        target: 'node-intent',
        label: '开始执行',
        markerEnd: MarkerType.ArrowClosed,
      },
      {
        id: 'edge-intent-router',
        source: 'node-intent',
        target: 'node-router',
        label: '识别完成',
        markerEnd: MarkerType.ArrowClosed,
      },
      {
        id: 'edge-router-end',
        source: 'node-router',
        target: 'node-end',
        label: '结束流程',
        markerEnd: MarkerType.ArrowClosed,
      },
    ],
  }
}

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

const selectedNode = computed(
  () => flowNodes.value.find((item) => item.id === selectedNodeId.value) || null
)

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeNode(node) {
  const kind = node?.data?.kind || 'task'

  return {
    ...node,
    type: 'default',
    class:
      kind === 'start'
        ? 'workflow-node-start'
        : kind === 'end'
          ? 'workflow-node-end'
          : 'workflow-node-default',
    draggable: kind !== 'start' && kind !== 'end',
    selected: node?.id === selectedNodeId.value,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }
}

function setSelectedNode(nodeId = '') {
  selectedNodeId.value = nodeId
  flowNodes.value = flowNodes.value.map((node) => ({
    ...node,
    selected: node.id === nodeId,
  }))
}

function ensureSystemNodes(nodes = [], edges = []) {
  const normalizedNodes = nodes.map((node) => normalizeNode(clone(node)))
  const nextNodes = normalizedNodes.filter((node) => node.id !== 'node-start' && node.id !== 'node-end')
  const startNode = normalizedNodes.find((node) => node.id === 'node-start') || createStartNode()
  const endNode = normalizedNodes.find((node) => node.id === 'node-end') || createEndNode()

  const orderedNodes = [normalizeNode(startNode), ...nextNodes, normalizeNode(endNode)]
  const validNodeIds = new Set(orderedNodes.map((node) => node.id))
  let nextEdges = edges
    .map((edge) => ({
      ...clone(edge),
      markerEnd: MarkerType.ArrowClosed,
    }))
    .filter((edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target))
    .filter((edge) => edge.target !== 'node-start' && edge.source !== 'node-end')

  const hasStartEdge = nextEdges.some((edge) => edge.source === 'node-start')
  const hasEndEdge = nextEdges.some((edge) => edge.target === 'node-end')
  const firstBusinessNode = orderedNodes.find((node) => node.id !== 'node-start' && node.id !== 'node-end')
  const lastBusinessNode = [...orderedNodes].reverse().find((node) => node.id !== 'node-start' && node.id !== 'node-end')

  if (firstBusinessNode && !hasStartEdge) {
    nextEdges.unshift({
      id: `edge-start-${firstBusinessNode.id}`,
      source: 'node-start',
      target: firstBusinessNode.id,
      label: '开始执行',
      markerEnd: MarkerType.ArrowClosed,
    })
  }

  if (lastBusinessNode && !hasEndEdge) {
    nextEdges.push({
      id: `edge-${lastBusinessNode.id}-end`,
      source: lastBusinessNode.id,
      target: 'node-end',
      label: '结束流程',
      markerEnd: MarkerType.ArrowClosed,
    })
  }

  return {
    nodes: orderedNodes,
    edges: nextEdges,
  }
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
  const normalized = ensureSystemNodes(workflow.definition?.nodes || [], workflow.definition?.edges || [])
  flowNodes.value = normalized.nodes
  flowEdges.value = normalized.edges
  syncNodeForm(flowNodes.value[0] || null)
  setSelectedNode(flowNodes.value[0]?.id || '')
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
  const businessNodes = flowNodes.value.filter((node) => !['start', 'end'].includes(node.data?.kind))
  const index = businessNodes.length + 1
  const endNode = flowNodes.value.find((node) => node.id === 'node-end')
  const node = {
    id: `node-${Date.now()}`,
    type: 'default',
    position: {
      x: 320 + ((index - 1) % 2) * 260,
      y: 120 + Math.floor((index - 1) / 2) * 140,
    },
    class: 'workflow-node-default',
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      label: `${kind}-${index}`,
      kind,
      prompt: `配置 ${kind} 节点逻辑`,
    },
  }

  const nodesWithoutEnd = flowNodes.value.filter((item) => item.id !== 'node-end')
  flowNodes.value = [...nodesWithoutEnd, node, endNode || createEndNode()]
  syncNodeForm(node)
  setSelectedNode(node.id)
}

function addChildNode() {
  if (!selectedNode.value) {
    return message.warning('请先选中一个节点')
  }

  if (selectedNode.value.data?.kind === 'end') {
    return message.warning('结束节点不能再添加子节点')
  }

  const childId = `node-${Date.now()}`
  const childNode = normalizeNode({
    id: childId,
    type: 'default',
    position: {
      x: (selectedNode.value.position?.x || 80) + 260,
      y: selectedNode.value.position?.y || 220,
    },
    data: {
      label: `子节点-${flowNodes.value.filter((node) => !['start', 'end'].includes(node.data?.kind)).length + 1}`,
      kind: 'tool',
      prompt: '配置子节点逻辑',
    },
  })

  const edgeToEnd = flowEdges.value.find(
    (edge) => edge.source === selectedNode.value.id && edge.target === 'node-end'
  )

  flowNodes.value = [
    ...flowNodes.value.filter((node) => node.id !== 'node-end'),
    childNode,
    flowNodes.value.find((node) => node.id === 'node-end') || createEndNode(),
  ]

  const nextEdges = flowEdges.value.filter((edge) => edge.id !== edgeToEnd?.id)
  nextEdges.push({
    id: `edge-${selectedNode.value.id}-${childId}`,
    source: selectedNode.value.id,
    target: childId,
    label: '进入子节点',
    type: 'smoothstep',
    markerEnd: MarkerType.ArrowClosed,
  })

  if (edgeToEnd) {
    nextEdges.push({
      id: `edge-${childId}-end`,
      source: childId,
      target: 'node-end',
      label: '结束流程',
      type: 'smoothstep',
      markerEnd: MarkerType.ArrowClosed,
    })
  }

  flowEdges.value = nextEdges
  syncNodeForm(childNode)
  setSelectedNode(childId)
  closeNodeContextMenu()
}

function onConnect(connection) {
  if (!connection.source || !connection.target) {
    return
  }

  if (connection.target === 'node-start') {
    return message.warning('开始节点不能作为连线终点')
  }

  if (connection.source === 'node-end') {
    return message.warning('结束节点不能作为连线起点')
  }

  flowEdges.value = [
    ...flowEdges.value,
    {
      ...connection,
      id: `edge-${Date.now()}`,
      label: 'next',
      type: 'smoothstep',
      markerEnd: MarkerType.ArrowClosed,
    },
  ]
}

function layoutNodesHorizontally() {
  const sortedNodes = ensureSystemNodes(flowNodes.value, flowEdges.value).nodes
  flowNodes.value = sortedNodes.map((node, index) => ({
    ...node,
    position: {
      x: 80 + index * 250,
      y: 220,
    },
  }))
}

function onNodeClick(payload) {
  syncNodeForm(payload.node)
  setSelectedNode(payload.node.id)
  closeNodeContextMenu()
}

function clearSelectedNode() {
  syncNodeForm(null)
  setSelectedNode('')
  closeNodeContextMenu()
  stopEditingNodeLabel()
}

function openNodeContextMenu(event, nodeId) {
  event.preventDefault()
  event.stopPropagation()
  setSelectedNode(nodeId)
  syncNodeForm(flowNodes.value.find((node) => node.id === nodeId) || null)
  nodeContextMenu.visible = true
  nodeContextMenu.x = event.clientX
  nodeContextMenu.y = event.clientY
  nodeContextMenu.nodeId = nodeId
}

function closeNodeContextMenu() {
  nodeContextMenu.visible = false
  nodeContextMenu.x = 0
  nodeContextMenu.y = 0
  nodeContextMenu.nodeId = ''
}

function startEditingNodeLabel(nodeId) {
  const node = flowNodes.value.find((item) => item.id === nodeId)
  if (!node) {
    return
  }

  if (['start', 'end'].includes(node.data?.kind)) {
    return message.warning('开始节点和结束节点名称不允许直接修改')
  }

  editingNodeId.value = nodeId
  editingNodeLabel.value = node.data?.label || ''
  setSelectedNode(nodeId)
  syncNodeForm(node)
  closeNodeContextMenu()
}

function saveEditingNodeLabel() {
  if (!editingNodeId.value) {
    return
  }

  const nextLabel = editingNodeLabel.value.trim()
  if (!nextLabel) {
    return message.warning('节点名称不能为空')
  }

  flowNodes.value = flowNodes.value.map((node) =>
    node.id === editingNodeId.value
      ? {
          ...node,
          data: {
            ...node.data,
            label: nextLabel,
          },
        }
      : node
  )

  if (selectedNodeId.value === editingNodeId.value) {
    nodeForm.label = nextLabel
  }

  editingNodeId.value = ''
  editingNodeLabel.value = ''
}

function stopEditingNodeLabel() {
  editingNodeId.value = ''
  editingNodeLabel.value = ''
}

function removeNodeById(nodeId) {
  const node = flowNodes.value.find((item) => item.id === nodeId)
  if (!node) {
    return
  }

  if (['start', 'end'].includes(node.data?.kind)) {
    return message.warning('开始节点和结束节点不允许删除')
  }

  flowNodes.value = flowNodes.value.filter((item) => item.id !== nodeId)
  flowEdges.value = flowEdges.value.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
  const normalized = ensureSystemNodes(flowNodes.value, flowEdges.value)
  flowNodes.value = normalized.nodes
  flowEdges.value = normalized.edges
  syncNodeForm(flowNodes.value[0] || null)
  setSelectedNode(flowNodes.value[0]?.id || '')
  closeNodeContextMenu()
}

function updateSelectedNode() {
  if (!selectedNode.value) {
    return
  }

  const nodeKind = selectedNode.value.data?.kind
  if (nodeKind === 'start' || nodeKind === 'end') {
    flowNodes.value = flowNodes.value.map((node) =>
      node.id === selectedNodeId.value
        ? {
            ...node,
            data: {
              ...node.data,
              label: nodeKind === 'start' ? '开始' : '结束',
              kind: nodeKind,
              prompt: nodeForm.prompt,
            },
          }
        : node
    )
    setSelectedNode(selectedNodeId.value)
    return
  }

  if (nodeForm.kind === 'start' || nodeForm.kind === 'end') {
    return message.warning('开始节点和结束节点是初始化系统节点，且只能存在一个')
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
  setSelectedNode(selectedNodeId.value)
}

function removeSelectedNode() {
  if (!selectedNodeId.value) {
    return
  }
  removeNodeById(selectedNodeId.value)
}

async function createNewWorkflow() {
  if (!workflowForm.name.trim()) {
    return message.warning('请输入流程名称')
  }

  saving.value = true
  try {
    const normalized = ensureSystemNodes(flowNodes.value, flowEdges.value)
    flowNodes.value = normalized.nodes
    flowEdges.value = normalized.edges
    setSelectedNode(selectedNodeId.value || normalized.nodes[0]?.id || '')
    const response = await createWorkflow({
      name: workflowForm.name.trim(),
      code: normalizeCode(workflowForm.code || workflowForm.name),
      description: workflowForm.description.trim(),
      status: workflowForm.status,
      definition: {
        nodes: clone(normalized.nodes),
        edges: clone(normalized.edges),
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
    const normalized = ensureSystemNodes(flowNodes.value, flowEdges.value)
    flowNodes.value = normalized.nodes
    flowEdges.value = normalized.edges
    setSelectedNode(selectedNodeId.value || normalized.nodes[0]?.id || '')
    await updateWorkflow(selectedWorkflowId.value, {
      name: workflowForm.name.trim(),
      code: normalizeCode(workflowForm.code || workflowForm.name),
      description: workflowForm.description.trim(),
      status: publish ? 'published' : workflowForm.status,
      bumpVersion: publish,
      definition: {
        nodes: clone(normalized.nodes),
        edges: clone(normalized.edges),
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
  if (!workflows.value.length) {
    const normalized = createDefaultWorkflowDefinition()
    flowNodes.value = normalized.nodes
    flowEdges.value = normalized.edges
    syncNodeForm(flowNodes.value[0] || null)
    setSelectedNode(flowNodes.value[0]?.id || '')
  }
})
</script>

<template>
  <div class="page-stack">
    <div class="workflow-engine-layout" :class="{ 'workflow-engine-layout-fullscreen': isEditorFullscreen }">
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
            <div class="workflow-topbar-actions">
              <a-select
                v-model:value="selectedWorkflowId"
                class="workflow-select"
                placeholder="选择流程"
                :options="workflowOptions"
              />
              <a-button type="primary" ghost @click="addChildNode">添加子节点</a-button>
              <a-button @click="layoutNodesHorizontally">横向整理</a-button>
              <a-button @click="isEditorFullscreen = !isEditorFullscreen">
                {{ isEditorFullscreen ? '退出全屏' : '全屏编辑' }}
              </a-button>
              <a-button danger @click="removeSelectedNode">删除节点</a-button>
            </div>
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
            :default-edge-options="{
              type: 'smoothstep',
              markerEnd: MarkerType.ArrowClosed,
            }"
            :connection-line-type="ConnectionLineType.SmoothStep"
            @connect="onConnect"
            @node-click="onNodeClick"
            @pane-click="clearSelectedNode"
          >
            <template #node-default="{ id, data, selected }">
              <div
                class="workflow-node-card"
                :class="{ 'is-selected': selected }"
                @contextmenu="openNodeContextMenu($event, id)"
              >
                <div class="workflow-node-card-kind">{{ data.kind }}</div>
                <div class="workflow-node-card-title" @dblclick.stop="startEditingNodeLabel(id)">
                  <input
                    v-if="editingNodeId === id"
                    v-model="editingNodeLabel"
                    class="workflow-node-inline-input"
                    @click.stop
                    @dblclick.stop
                    @keyup.enter.stop="saveEditingNodeLabel"
                    @keyup.esc.stop="stopEditingNodeLabel"
                    @blur="saveEditingNodeLabel"
                  />
                  <span v-else>{{ data.label }}</span>
                </div>
                <div class="workflow-node-card-desc">{{ data.prompt }}</div>
              </div>
            </template>
            <Background />
            <MiniMap />
            <Controls />
          </VueFlow>
          <div
            v-if="nodeContextMenu.visible"
            class="workflow-context-menu"
            :style="{ left: `${nodeContextMenu.x}px`, top: `${nodeContextMenu.y}px` }"
          >
            <button type="button" @click="addChildNode">添加子节点</button>
            <button type="button" @click="startEditingNodeLabel(nodeContextMenu.nodeId)">重命名节点</button>
            <button type="button" class="danger" @click="removeNodeById(nodeContextMenu.nodeId)">删除节点</button>
          </div>
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
          <div class="workflow-node-actions">
            <a-button type="primary" block @click="addChildNode">添加子节点</a-button>
            <a-button block @click="layoutNodesHorizontally">横向整理节点</a-button>
            <a-button block @click="updateSelectedNode">保存当前节点配置</a-button>
            <a-button danger block @click="removeSelectedNode">删除当前节点</a-button>
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
          <div class="workflow-panel-tip">
            {{ selectedNode ? `当前节点：${selectedNode.data?.label || selectedNode.id}` : '请先在画布中选中一个节点后再配置。' }}
          </div>

          <a-form-item label="节点标题">
            <a-input
              v-model:value="nodeForm.label"
              :disabled="!selectedNode || ['start', 'end'].includes(selectedNode?.data?.kind)"
            />
          </a-form-item>
          <a-form-item label="节点类型">
            <a-select
              v-model:value="nodeForm.kind"
              :disabled="!selectedNode || ['start', 'end'].includes(selectedNode?.data?.kind)"
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
