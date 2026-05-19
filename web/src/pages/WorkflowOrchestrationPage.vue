<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { useRoute, useRouter } from 'vue-router'
import { Background } from '@vue-flow/background'
import {
  BaseEdge,
  ConnectionLineType,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  VueFlow,
  getSmoothStepPath,
} from '@vue-flow/core'
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
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const workflows = ref([])
const agents = ref([])
const bindings = ref([])
const selectedWorkflowId = ref('')
const selectedAgentId = ref('')
const selectedNodeId = ref('')
const selectedEdgeId = ref('')
const flowNodes = ref([])
const flowEdges = ref([])
const bindingSaving = ref(false)
const isPropertyPanelVisible = ref(false)
const canvasShellRef = ref(null)
const vueFlowStore = ref(null)
const zoomPercentage = ref(100)
const editingNodeId = ref('')
const editingNodeLabel = ref('')
const editingNodePromptId = ref('')
const editingNodePrompt = ref('')
const editingEdgeId = ref('')
const editingEdgeLabel = ref('')
const createNodeContextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  flowX: 0,
  flowY: 0,
})
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

const edgeForm = reactive({
  label: '',
})

const palette = [
  { label: '触发器', kind: 'trigger' },
  { label: 'AI 节点', kind: 'ai' },
  { label: '路由器', kind: 'router' },
  { label: '工具节点', kind: 'tool' },
  { label: '输出节点', kind: 'output' },
]

const NODE_START_X = 80
const NODE_GAP_X = 250
const NODE_CANVAS_Y = 220
const NODE_ROW_GAP_Y = 170

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
const selectedEdge = computed(
  () => flowEdges.value.find((item) => item.id === selectedEdgeId.value) || null
)

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function startEditingEdgeLabel(edge) {
  if (!edge?.id) {
    return
  }

  editingEdgeId.value = edge.id
  editingEdgeLabel.value = edge.label || ''
  setSelectedEdge(edge.id)
  closePropertyPanel()
  nextTick(() => {
    const input = document.querySelector(`input[data-edge-editor="${edge.id}"]`)
    input?.focus?.()
    input?.select?.()
  })
}

function updateNodeDataById(nodeId, updater) {
  flowNodes.value = flowNodes.value.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          data: {
            ...node.data,
            ...updater(node),
          },
        }
      : node
  )
}

function saveEditingEdgeLabel(edgeId = editingEdgeId.value) {
  if (!edgeId) {
    return
  }

  const nextLabel = editingEdgeLabel.value.trim()
  flowEdges.value = flowEdges.value.map((edge) =>
    edge.id === edgeId
      ? {
          ...edge,
          label: nextLabel,
          ...createEdge(edge.source, edge.target, nextLabel, {
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
          }),
        }
      : edge
  )
  editingEdgeId.value = ''
  editingEdgeLabel.value = ''
  setSelectedEdge(edgeId)
}

function cancelEditingEdgeLabel() {
  editingEdgeId.value = ''
  editingEdgeLabel.value = ''
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

function normalizeEdgeLabel(label = '') {
  const text = `${label || ''}`.trim()
  if (['next', '进入节点', '进入子节点', '开始执行', '结束流程'].includes(text)) {
    return ''
  }
  return text
}

function createEdge(source, target, label = '', options = {}) {
  return {
    id: `edge-${source}-${target}`,
    source,
    target,
    type: 'editable',
    sourceHandle: options.sourceHandle,
    targetHandle: options.targetHandle,
    label: normalizeEdgeLabel(label),
    style: {
      stroke: '#6b8cff',
      strokeWidth: 2.5,
    },
    labelShowBg: Boolean(normalizeEdgeLabel(label)),
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 8,
    labelBgStyle: {
      fill: '#ffffff',
      stroke: '#dbe4ff',
      strokeWidth: 1,
    },
    labelStyle: {
      fill: '#3557d6',
      fontSize: 12,
      fontWeight: 600,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 20,
      height: 20,
      color: '#6b8cff',
    },
  }
}

function getEditableEdgeMeta(edge) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: edge.sourceX,
    sourceY: edge.sourceY,
    targetX: edge.targetX,
    targetY: edge.targetY,
    sourcePosition: edge.sourcePosition,
    targetPosition: edge.targetPosition,
  })

  return {
    path,
    labelX,
    labelY,
  }
}

function closeOrchestration() {
  router.push('/agents')
}

function sortBusinessNodes(nodes = []) {
  return [...nodes].sort((left, right) => {
    const xDiff = (left.position?.x || 0) - (right.position?.x || 0)
    if (xDiff !== 0) {
      return xDiff
    }
    return (left.position?.y || 0) - (right.position?.y || 0)
  })
}

function layoutNodesByGraph(nodes = [], edges = []) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const outgoingMap = new Map()
  const incomingMap = new Map()

  edges.forEach((edge) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      return
    }

    if (!outgoingMap.has(edge.source)) {
      outgoingMap.set(edge.source, [])
    }
    if (!incomingMap.has(edge.target)) {
      incomingMap.set(edge.target, [])
    }

    outgoingMap.get(edge.source).push(edge)
    incomingMap.get(edge.target).push(edge)
  })

  const depthMap = new Map([['node-start', 0]])
  const queue = ['node-start']

  while (queue.length) {
    const currentId = queue.shift()
    const currentDepth = depthMap.get(currentId) || 0
    const outgoingEdges = outgoingMap.get(currentId) || []

    outgoingEdges.forEach((edge) => {
      if (!depthMap.has(edge.target) || (depthMap.get(edge.target) || 0) < currentDepth + 1) {
        depthMap.set(edge.target, currentDepth + 1)
        queue.push(edge.target)
      }
    })
  }

  const reachableDepths = [...depthMap.values()]
  let fallbackDepth = reachableDepths.length ? Math.max(...reachableDepths) + 1 : 1
  sortBusinessNodes(nodes.filter((node) => !depthMap.has(node.id))).forEach((node) => {
    depthMap.set(node.id, fallbackDepth)
    fallbackDepth += 1
  })

  const depthGroups = new Map()
  nodes.forEach((node) => {
    const depth = depthMap.get(node.id) ?? 0
    if (!depthGroups.has(depth)) {
      depthGroups.set(depth, [])
    }
    depthGroups.get(depth).push(node)
  })

  const rowMap = new Map([['node-start', 0]])
  const sortedDepths = [...depthGroups.keys()].sort((left, right) => left - right)

  sortedDepths.forEach((depth) => {
    if (depth === 0) {
      return
    }

    const group = depthGroups.get(depth) || []
    const rankedGroup = [...group].sort((left, right) => {
      const leftParents = incomingMap.get(left.id) || []
      const rightParents = incomingMap.get(right.id) || []
      const leftScore =
        leftParents.reduce((sum, edge) => sum + (rowMap.get(edge.source) ?? 0), 0) /
          Math.max(leftParents.length, 1) || 0
      const rightScore =
        rightParents.reduce((sum, edge) => sum + (rowMap.get(edge.source) ?? 0), 0) /
          Math.max(rightParents.length, 1) || 0

      if (leftScore !== rightScore) {
        return leftScore - rightScore
      }

      return (left.position?.y || 0) - (right.position?.y || 0)
    })

    const center = (rankedGroup.length - 1) / 2
    rankedGroup.forEach((node, index) => {
      rowMap.set(node.id, index - center)
    })
  })

  return nodes.map((node) => ({
    ...node,
    position: {
      x: NODE_START_X + (depthMap.get(node.id) ?? 0) * NODE_GAP_X,
      y: NODE_CANVAS_Y + (rowMap.get(node.id) ?? 0) * NODE_ROW_GAP_Y,
    },
  }))
}

function resolveEdgeHandles(sourceNode, targetNode) {
  if (!sourceNode || !targetNode) {
    return {
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
    }
  }

  const xDiff = (targetNode.position?.x || 0) - (sourceNode.position?.x || 0)
  const yDiff = (targetNode.position?.y || 0) - (sourceNode.position?.y || 0)

  if (Math.abs(yDiff) > Math.abs(xDiff)) {
    return yDiff >= 0
      ? {
          sourceHandle: 'source-bottom',
          targetHandle: 'target-top',
        }
      : {
          sourceHandle: 'source-top',
          targetHandle: 'target-bottom',
        }
  }

  return xDiff >= 0
    ? {
        sourceHandle: 'source-right',
        targetHandle: 'target-left',
      }
    : {
        sourceHandle: 'source-left',
        targetHandle: 'target-right',
      }
}

function getCanvasFlowPosition(event) {
  const canvasElement = canvasShellRef.value?.querySelector('.workflow-engine-canvas')
  const transformPane = canvasShellRef.value?.querySelector('.vue-flow__transformationpane')

  if (!canvasElement) {
    return { x: NODE_START_X, y: NODE_CANVAS_Y }
  }

  const canvasRect = canvasElement.getBoundingClientRect()
  const transformValue = transformPane ? getComputedStyle(transformPane).transform : 'none'
  const matrix =
    transformValue && transformValue !== 'none'
      ? new DOMMatrixReadOnly(transformValue)
      : new DOMMatrixReadOnly()
  const zoom = matrix.a || 1

  return {
    x: Math.max(40, (event.clientX - canvasRect.left - matrix.m41) / zoom),
    y: Math.max(40, (event.clientY - canvasRect.top - matrix.m42) / zoom),
  }
}

function openCreateNodeContextMenu(event) {
  if (
    event.target?.closest('.vue-flow__node') ||
    event.target?.closest('.vue-flow__edge') ||
    event.target?.closest('.workflow-context-menu') ||
    event.target?.closest('.workflow-hover-panel')
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  const flowPosition = getCanvasFlowPosition(event)
  createNodeContextMenu.visible = true
  createNodeContextMenu.x = event.clientX
  createNodeContextMenu.y = event.clientY
  createNodeContextMenu.flowX = flowPosition.x
  createNodeContextMenu.flowY = flowPosition.y
  closeNodeContextMenu()
}

function closeCreateNodeContextMenu() {
  createNodeContextMenu.visible = false
  createNodeContextMenu.x = 0
  createNodeContextMenu.y = 0
  createNodeContextMenu.flowX = 0
  createNodeContextMenu.flowY = 0
}

function openPropertyPanel({ pinned = false } = {}) {
  isPropertyPanelVisible.value = true
}

function closePropertyPanel() {
  isPropertyPanelVisible.value = false
}

function syncZoomPercentage(viewport) {
  zoomPercentage.value = Math.round((viewport?.zoom ?? viewport?.z ?? 1) * 100)
}

function onPaneReady(store) {
  vueFlowStore.value = store
  syncZoomPercentage(store?.viewport)
}

function onViewportChange(viewport) {
  syncZoomPercentage(viewport)
}

async function zoomInCanvas() {
  await vueFlowStore.value?.zoomIn?.({ duration: 120 })
}

async function zoomOutCanvas() {
  await vueFlowStore.value?.zoomOut?.({ duration: 120 })
}

async function resetZoomCanvas() {
  const viewport = vueFlowStore.value?.viewport
  if (!viewport || !vueFlowStore.value?.setViewport) {
    return
  }

  await vueFlowStore.value.setViewport(
    {
      x: viewport.x,
      y: viewport.y,
      zoom: 1,
    },
    { duration: 120 }
  )
}

function setSelectedNode(nodeId = '') {
  selectedNodeId.value = nodeId
  flowNodes.value = flowNodes.value.map((node) => ({
    ...node,
    selected: node.id === nodeId,
  }))
  if (nodeId) {
    setSelectedEdge('')
  }
}

function setSelectedEdge(edgeId = '') {
  selectedEdgeId.value = edgeId
  flowEdges.value = flowEdges.value.map((edge) => ({
    ...edge,
    selected: edge.id === edgeId,
  }))
  if (edgeId) {
    selectedNodeId.value = ''
    flowNodes.value = flowNodes.value.map((node) => ({
      ...node,
      selected: false,
    }))
  }
}

function ensureSystemNodes(nodes = [], edges = []) {
  const normalizedNodes = nodes.map((node) => normalizeNode(clone(node)))
  const startSeed =
    normalizedNodes.find((node) => node.id === 'node-start') ||
    normalizedNodes.find((node) => node.data?.kind === 'start')
  const endSeed =
    normalizedNodes.find((node) => node.id === 'node-end') ||
    normalizedNodes.find((node) => node.data?.kind === 'end')
  const businessNodes = sortBusinessNodes(
    normalizedNodes.filter(
      (node) =>
        node.id !== 'node-start' &&
        node.id !== 'node-end' &&
        node.data?.kind !== 'start' &&
        node.data?.kind !== 'end'
    )
  ).map((node) => normalizeNode(node))
  const startNode = normalizeNode({
    ...createStartNode(),
    ...startSeed,
    id: 'node-start',
    data: {
      ...createStartNode().data,
      ...(startSeed?.data || {}),
      label: '开始',
      kind: 'start',
    },
    draggable: false,
  })
  const endNode = normalizeNode({
    ...createEndNode(),
    ...endSeed,
    id: 'node-end',
    data: {
      ...createEndNode().data,
      ...(endSeed?.data || {}),
      label: '结束',
      kind: 'end',
    },
    draggable: false,
  })

  const orderedNodes = [startNode, ...businessNodes, endNode]
  const validNodeIds = new Set(orderedNodes.map((node) => node.id))
  let nextEdges = edges
    .map((edge) =>
      createEdge(edge.source, edge.target, edge.label || '', {
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })
    )
    .filter((edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target))
    .filter((edge) => edge.target !== 'node-start' && edge.source !== 'node-end')
    .filter((edge) => edge.source !== edge.target)

  const uniqueEdgeMap = new Map()
  nextEdges.forEach((edge) => {
    uniqueEdgeMap.set(`${edge.source}-${edge.target}`, edge)
  })
  nextEdges = [...uniqueEdgeMap.values()]

  const positionedNodes = layoutNodesByGraph(orderedNodes, nextEdges)
  const positionedNodeMap = new Map(positionedNodes.map((node) => [node.id, node]))
  const normalizedEdges = nextEdges.map((edge) =>
    createEdge(edge.source, edge.target, edge.label || '', {
      ...resolveEdgeHandles(positionedNodeMap.get(edge.source), positionedNodeMap.get(edge.target)),
    })
  )

  return {
    nodes: positionedNodes,
    edges: normalizedEdges,
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

function syncEdgeForm(edge) {
  edgeForm.label = edge?.label || ''
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

function addNode(kind, options = {}) {
  const businessNodes = flowNodes.value.filter((node) => !['start', 'end'].includes(node.data?.kind))
  const index = businessNodes.length + 1
  const lastBusinessNode = businessNodes[businessNodes.length - 1]
  const hasCustomPosition = typeof options.x === 'number' && typeof options.y === 'number'
  const node = {
    id: `node-${Date.now()}`,
    type: 'default',
    position: {
      x: hasCustomPosition ? options.x : NODE_START_X + index * NODE_GAP_X,
      y: hasCustomPosition ? options.y : NODE_CANVAS_Y,
    },
    class: 'workflow-node-default',
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      label: hasCustomPosition ? `新节点-${index}` : `${kind}-${index}`,
      kind,
      prompt: `配置 ${kind} 节点逻辑`,
    },
  }

  if (hasCustomPosition) {
    flowNodes.value = [...flowNodes.value, normalizeNode(node)]
    syncNodeForm(node)
    setSelectedNode(node.id)
    openPropertyPanel()
    closeCreateNodeContextMenu()
    return
  }

  const normalized = ensureSystemNodes([...flowNodes.value, node], flowEdges.value)
  flowNodes.value = normalized.nodes
  flowEdges.value = normalized.edges
  syncNodeForm(flowNodes.value.find((item) => item.id === node.id) || null)
  setSelectedNode(node.id)
  closeCreateNodeContextMenu()
}

function addNodeAtContextPosition(kind) {
  addNode(kind, {
    x: createNodeContextMenu.flowX,
    y: createNodeContextMenu.flowY,
  })
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
      parentId: selectedNode.value.id,
    },
  })

  const nextEdges = [
    ...flowEdges.value,
    createEdge(selectedNode.value.id, childId, '', {
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
    }),
  ]

  const normalized = ensureSystemNodes([...flowNodes.value, childNode], nextEdges)
  flowNodes.value = normalized.nodes
  flowEdges.value = normalized.edges
  syncNodeForm(flowNodes.value.find((node) => node.id === childId) || null)
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
    ...flowEdges.value.filter(
      (edge) => !(edge.source === connection.source && edge.target === connection.target)
    ),
    createEdge(connection.source, connection.target, '', {
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
    }),
  ]

  const normalized = ensureSystemNodes(flowNodes.value, flowEdges.value)
  flowNodes.value = normalized.nodes
  flowEdges.value = normalized.edges
}

function layoutNodesHorizontally() {
  const normalized = ensureSystemNodes(flowNodes.value, flowEdges.value)
  flowNodes.value = normalized.nodes
  flowEdges.value = normalized.edges
}

function onNodeClick(payload) {
  syncNodeForm(payload.node)
  setSelectedNode(payload.node.id)
  closeCreateNodeContextMenu()
  openPropertyPanel()
  closeNodeContextMenu()
}

function onEdgeClick(eventOrPayload, edgePayload) {
  const edge = edgePayload || eventOrPayload?.edge || eventOrPayload
  const event = edgePayload ? eventOrPayload : eventOrPayload?.event
  if (!edge?.id) {
    return
  }

  event?.stopPropagation?.()
  syncEdgeForm(edge)
  setSelectedEdge(edge.id)
  closeCreateNodeContextMenu()
  closePropertyPanel()
  closeNodeContextMenu()
}

function onCanvasDoubleClick(event) {
  if (
    event.target?.closest('.workflow-zoom-controls') ||
    event.target?.closest('.workflow-canvas-toolbar') ||
    event.target?.closest('.ant-card-head') ||
    event.target?.closest('.vue-flow__node') ||
    event.target?.closest('.vue-flow__edge') ||
    !event.target?.closest('.vue-flow__pane') ||
    event.target?.closest('.workflow-context-menu') ||
    event.target?.closest('.workflow-hover-panel')
  ) {
    return
  }

  const flowPosition = getCanvasFlowPosition(event)
  addNode('tool', flowPosition)
}

function clearSelectedNode() {
  syncNodeForm(null)
  syncEdgeForm(null)
  setSelectedNode('')
  setSelectedEdge('')
  cancelEditingEdgeLabel()
  closeCreateNodeContextMenu()
  closePropertyPanel()
  closeNodeContextMenu()
  stopEditingNodeLabel()
  stopEditingNodePrompt()
}

function openNodeContextMenu(event, nodeId) {
  event.preventDefault()
  event.stopPropagation()
  setSelectedNode(nodeId)
  syncNodeForm(flowNodes.value.find((node) => node.id === nodeId) || null)
  closeCreateNodeContextMenu()
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
  stopEditingNodePrompt()
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

  updateNodeDataById(editingNodeId.value, () => ({
    label: nextLabel,
  }))

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

function startEditingNodePrompt(nodeId) {
  const node = flowNodes.value.find((item) => item.id === nodeId)
  if (!node) {
    return
  }

  editingNodePromptId.value = nodeId
  editingNodePrompt.value = node.data?.prompt || ''
  stopEditingNodeLabel()
  setSelectedNode(nodeId)
  syncNodeForm(node)
  closeNodeContextMenu()
  nextTick(() => {
    const input = document.querySelector(`textarea[data-node-prompt-editor="${nodeId}"]`)
    input?.focus?.()
    input?.select?.()
  })
}

function saveEditingNodePrompt() {
  if (!editingNodePromptId.value) {
    return
  }

  const nextPrompt = editingNodePrompt.value.trim()
  updateNodeDataById(editingNodePromptId.value, () => ({
    prompt: nextPrompt,
  }))

  if (selectedNodeId.value === editingNodePromptId.value) {
    nodeForm.prompt = nextPrompt
  }

  editingNodePromptId.value = ''
  editingNodePrompt.value = ''
}

function stopEditingNodePrompt() {
  editingNodePromptId.value = ''
  editingNodePrompt.value = ''
}

function removeNodeById(nodeId) {
  const node = flowNodes.value.find((item) => item.id === nodeId)
  if (!node) {
    return
  }

  if (['start', 'end'].includes(node.data?.kind)) {
    return message.warning('开始节点和结束节点不允许删除')
  }

  const incomingEdges = flowEdges.value.filter((edge) => edge.target === nodeId)
  const outgoingEdges = flowEdges.value.filter((edge) => edge.source === nodeId)
  const remainingNodes = flowNodes.value.filter((item) => item.id !== nodeId)
  const remainingEdges = flowEdges.value.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)

  if (incomingEdges.length && outgoingEdges.length) {
    incomingEdges.forEach((incomingEdge) => {
      outgoingEdges.forEach((outgoingEdge) => {
        if (incomingEdge.source !== outgoingEdge.target) {
          remainingEdges.push(
            createEdge(incomingEdge.source, outgoingEdge.target, outgoingEdge.label || incomingEdge.label || '', {
              sourceHandle: incomingEdge.sourceHandle || 'source-right',
              targetHandle: outgoingEdge.targetHandle || 'target-left',
            })
          )
        }
      })
    })
  } else if (incomingEdges.length && !outgoingEdges.length) {
    incomingEdges.forEach((incomingEdge) => {
      remainingEdges.push(
        createEdge(incomingEdge.source, 'node-end', incomingEdge.label || '', {
          sourceHandle: 'source-right',
          targetHandle: 'target-left',
        })
      )
    })
  }

  const normalized = ensureSystemNodes(remainingNodes, remainingEdges)
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

function updateSelectedEdge() {
  if (!selectedEdge.value) {
    return
  }

  const nextLabel = edgeForm.label.trim()
  flowEdges.value = flowEdges.value.map((edge) =>
    edge.id === selectedEdgeId.value
      ? {
          ...edge,
          label: nextLabel,
        }
      : edge
  )
  setSelectedEdge(selectedEdgeId.value)
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
    <div class="workflow-engine-layout workflow-engine-layout-fullscreen">
      <a-card title="流程引擎" :loading="loading" class="panel-card workflow-canvas-card workflow-stage-card">
        <template #extra>
          <div class="workflow-stage-header">
            <div class="workflow-topbar-meta">
              <span>画布优先模式</span>
              <span>创建节点时直接选择类型，点击节点或连线后在右侧编辑当前属性。</span>
            </div>
            <div class="workflow-stage-actions">
              <a-select
                v-model:value="selectedWorkflowId"
                class="workflow-select"
                placeholder="选择流程"
                :options="workflowOptions"
              />
              <a-button :loading="bindingSaving" @click="saveBinding">
                {{ currentBinding ? '更新绑定' : '绑定流程' }}
              </a-button>
              <a-button @click="layoutNodesHorizontally">流程整理</a-button>
              <a-button type="primary" :loading="saving" @click="createNewWorkflow">新建流程</a-button>
              <a-button :loading="saving" @click="saveWorkflow()">保存流程</a-button>
              <a-button type="primary" ghost :loading="saving" @click="saveWorkflow({ publish: true })">
                发布流程
              </a-button>
              <button type="button" class="workflow-close-button" @click="closeOrchestration">
                <CloseOutlined />
              </button>
            </div>
          </div>
        </template>

        <div
          ref="canvasShellRef"
          class="workflow-canvas-shell"
          @contextmenu="openCreateNodeContextMenu"
          @dblclick="onCanvasDoubleClick"
        >
          <div class="workflow-canvas-toolbar">
            <span>{{ currentWorkflow?.name || '未选择流程' }}</span>
            <span>{{ currentWorkflow?.status || 'draft' }}</span>
          </div>
          <div
            v-if="createNodeContextMenu.visible"
            class="workflow-context-menu workflow-context-menu-create"
            :style="{ left: `${createNodeContextMenu.x}px`, top: `${createNodeContextMenu.y}px` }"
          >
            <button
              v-for="item in palette"
              :key="item.kind"
              type="button"
              @click="addNodeAtContextPosition(item.kind)"
            >
              {{ item.label }}
            </button>
          </div>
          <div class="workflow-zoom-controls">
            <button type="button" class="workflow-zoom-button" @click="zoomInCanvas">+</button>
            <button type="button" class="workflow-zoom-percentage" @click="resetZoomCanvas">
              {{ zoomPercentage }}%
            </button>
            <button type="button" class="workflow-zoom-button" @click="zoomOutCanvas">-</button>
          </div>
          <div
            v-if="selectedNode && isPropertyPanelVisible"
            class="workflow-hover-panel workflow-hover-panel-right"
            :class="{ 'is-visible': isPropertyPanelVisible }"
          >
            <div class="workflow-hover-panel-header">
              <strong>{{ selectedNode?.data?.label }}</strong>
              <a-space size="small">
                <a-button size="small" @click="closePropertyPanel">关闭</a-button>
              </a-space>
            </div>
            <a-form layout="vertical">
              <div class="workflow-panel-tip">点击节点后显示当前节点属性，只保留和当前节点配置直接相关的内容。</div>
              <div class="workflow-node-actions">
                <a-button block @click="updateSelectedNode">保存当前节点配置</a-button>
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
            </a-form>
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
            :zoom-on-double-click="false"
            @pane-ready="onPaneReady"
            @viewport-change="onViewportChange"
            @connect="onConnect"
            @node-click="onNodeClick"
            @edge-click="onEdgeClick"
            @pane-click="clearSelectedNode"
          >
            <template #edge-editable="edgeProps">
              <BaseEdge
                :id="edgeProps.id"
                :path="getEditableEdgeMeta(edgeProps).path"
                :marker-end="edgeProps.markerEnd"
                :style="edgeProps.style"
              />
              <EdgeLabelRenderer>
                <div
                  class="workflow-edge-label-renderer nopan nodrag"
                  :style="{
                    transform: `translate(-50%, -50%) translate(${getEditableEdgeMeta(edgeProps).labelX}px, ${getEditableEdgeMeta(edgeProps).labelY}px)`,
                  }"
                >
                  <input
                    v-if="editingEdgeId === edgeProps.id"
                    v-model="editingEdgeLabel"
                    class="workflow-edge-inline-input"
                    :data-edge-editor="edgeProps.id"
                    placeholder="输入连线文案"
                    @click.stop
                    @dblclick.stop
                    @keyup.enter.stop="saveEditingEdgeLabel(edgeProps.id)"
                    @keyup.esc.stop="cancelEditingEdgeLabel"
                    @blur="saveEditingEdgeLabel(edgeProps.id)"
                  />
                  <button
                    v-else
                    type="button"
                    class="workflow-edge-label-chip"
                    :class="{
                      'is-empty': !(edgeProps.label || '').trim(),
                      'is-selected': edgeProps.selected,
                    }"
                    @click.stop="setSelectedEdge(edgeProps.id)"
                    @dblclick.stop="
                      startEditingEdgeLabel({
                        id: edgeProps.id,
                        label: edgeProps.label,
                        source: edgeProps.source,
                        target: edgeProps.target,
                        sourceHandle: edgeProps.sourceHandleId,
                        targetHandle: edgeProps.targetHandleId,
                      })
                    "
                  >
                    {{ (edgeProps.label || '').trim() || '双击编辑文案' }}
                  </button>
                </div>
              </EdgeLabelRenderer>
            </template>
            <template #node-default="{ id, data, selected }">
              <div
                class="workflow-node-card"
                :class="{ 'is-selected': selected }"
                @contextmenu="openNodeContextMenu($event, id)"
              >
                <Handle
                  v-if="data.kind !== 'start'"
                  id="target-top"
                  type="target"
                  :position="Position.Top"
                  class="workflow-node-handle"
                />
                <Handle
                  v-if="data.kind !== 'end'"
                  id="source-top"
                  type="source"
                  :position="Position.Top"
                  class="workflow-node-handle"
                />
                <Handle
                  v-if="data.kind !== 'start'"
                  id="target-right"
                  type="target"
                  :position="Position.Right"
                  class="workflow-node-handle"
                />
                <Handle
                  v-if="data.kind !== 'end'"
                  id="source-right"
                  type="source"
                  :position="Position.Right"
                  class="workflow-node-handle"
                />
                <Handle
                  v-if="data.kind !== 'start'"
                  id="target-bottom"
                  type="target"
                  :position="Position.Bottom"
                  class="workflow-node-handle"
                />
                <Handle
                  v-if="data.kind !== 'end'"
                  id="source-bottom"
                  type="source"
                  :position="Position.Bottom"
                  class="workflow-node-handle"
                />
                <Handle
                  v-if="data.kind !== 'start'"
                  id="target-left"
                  type="target"
                  :position="Position.Left"
                  class="workflow-node-handle"
                />
                <Handle
                  v-if="data.kind !== 'end'"
                  id="source-left"
                  type="source"
                  :position="Position.Left"
                  class="workflow-node-handle"
                />
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
                <div class="workflow-node-card-content" @dblclick.stop="startEditingNodePrompt(id)">
                  <textarea
                    v-if="editingNodePromptId === id"
                    v-model="editingNodePrompt"
                    class="workflow-node-inline-textarea"
                    :data-node-prompt-editor="id"
                    @click.stop
                    @dblclick.stop
                    @keyup.enter.exact.stop="saveEditingNodePrompt"
                    @keyup.esc.stop="stopEditingNodePrompt"
                    @blur="saveEditingNodePrompt"
                  />
                  <span v-else>{{ data.prompt || '双击编辑节点内容' }}</span>
                </div>
              </div>
            </template>
            <Background />
            <MiniMap />
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
    </div>
  </div>
</template>
