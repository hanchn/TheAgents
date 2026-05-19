<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import {
  createAgent,
  getAgentDetail,
  getAgentPage,
  updateAgent,
} from '../lib/api'

const categoryOptions = [
  { value: 'cross_border', label: '国外（跨境）' },
  { value: 'medical_promotion', label: '医疗宣传' },
  { value: 'domestic_marketing', label: '国内营销' },
  { value: 'general', label: '未分类' },
]

function getCategoryLabel(value) {
  return categoryOptions.find((item) => item.value === value)?.label || '未分类'
}

const router = useRouter()
const loading = ref(false)
const detailLoading = ref(false)
const detailVisible = ref(false)
const formVisible = ref(false)
const saving = ref(false)
const agents = ref([])
const total = ref(0)
const detail = ref(null)
const editingId = ref('')

const filters = reactive({
  keyword: '',
  category: '',
  publishStatus: '',
  status: '',
  page: 1,
  pageSize: 8,
})

const agentForm = reactive({
  name: '',
  code: '',
  type: 'assistant',
  status: 'active',
  publishStatus: 'draft',
  version: 1,
  owner: '',
  category: 'general',
  endpoint: '',
  description: '',
  capabilitiesText: '',
  configText: '{\n  "model": "gpt-4.1",\n  "timeoutMs": 12000\n}',
})

const columns = [
  {
    title: 'Agent',
    dataIndex: 'name',
    key: 'name',
    width: 280,
  },
  {
    title: '编码',
    dataIndex: 'code',
    key: 'code',
    width: 180,
  },
  {
    title: '类型',
    dataIndex: 'type',
    key: 'type',
    width: 120,
  },
  {
    title: '分类',
    dataIndex: 'category',
    key: 'category',
    width: 140,
  },
  {
    title: '发布状态',
    dataIndex: 'publishStatus',
    key: 'publishStatus',
    width: 120,
  },
  {
    title: '运行状态',
    dataIndex: 'status',
    key: 'status',
    width: 120,
  },
  {
    title: '负责人',
    dataIndex: 'owner',
    key: 'owner',
    width: 140,
  },
  {
    title: '已发布流程数',
    dataIndex: 'publishedWorkflowCount',
    key: 'publishedWorkflowCount',
    width: 140,
  },
  {
    title: '操作',
    key: 'action',
    width: 220,
    fixed: 'right',
  },
]

const pagination = computed(() => ({
  current: filters.page,
  pageSize: filters.pageSize,
  total: total.value,
  showSizeChanger: true,
  showTotal: (value) => `共 ${value} 条`,
}))

async function loadList() {
  loading.value = true

  try {
    const response = await getAgentPage({
      page: filters.page,
      pageSize: filters.pageSize,
      keyword: filters.keyword,
      category: filters.category,
      publishStatus: filters.publishStatus,
      status: filters.status,
    })

    const payload = response.data.data || {}
    agents.value = Array.isArray(payload.list) ? payload.list : []
    total.value = Number(payload.total || 0)
  } catch (error) {
    message.error('获取 Agent 列表失败')
  } finally {
    loading.value = false
  }
}

async function showDetail(record) {
  detailVisible.value = true
  detailLoading.value = true

  try {
    const response = await getAgentDetail(record.id)
    detail.value = response.data.data || null
  } catch (error) {
    message.error('获取 Agent 详情失败')
  } finally {
    detailLoading.value = false
  }
}

function normalizeCode(text) {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
}

function resetForm() {
  editingId.value = ''
  agentForm.name = ''
  agentForm.code = ''
  agentForm.type = 'assistant'
  agentForm.status = 'active'
  agentForm.publishStatus = 'draft'
  agentForm.version = 1
  agentForm.owner = ''
  agentForm.category = 'general'
  agentForm.endpoint = ''
  agentForm.description = ''
  agentForm.capabilitiesText = ''
  agentForm.configText = '{\n  "model": "gpt-4.1",\n  "timeoutMs": 12000\n}'
}

function openCreate() {
  resetForm()
  formVisible.value = true
}

function openEdit(record) {
  editingId.value = record.id
  agentForm.name = record.name || ''
  agentForm.code = record.code || ''
  agentForm.type = record.type || 'assistant'
  agentForm.status = record.status || 'active'
  agentForm.publishStatus = record.publishStatus || 'draft'
  agentForm.version = record.version || 1
  agentForm.owner = record.owner || ''
  agentForm.category = record.category || 'general'
  agentForm.endpoint = record.endpoint || ''
  agentForm.description = record.description || ''
  agentForm.capabilitiesText = Array.isArray(record.capabilities) ? record.capabilities.join(',') : ''
  agentForm.configText = JSON.stringify(record.config || {}, null, 2)
  formVisible.value = true
}

async function submitForm() {
  if (!agentForm.name.trim()) {
    return message.warning('请输入 Agent 名称')
  }

  saving.value = true

  try {
    const payload = {
      name: agentForm.name.trim(),
      code: normalizeCode(agentForm.code || agentForm.name),
      type: agentForm.type,
      status: agentForm.status,
      publishStatus: agentForm.publishStatus,
      version: Number(agentForm.version || 1),
      owner: agentForm.owner.trim(),
      category: agentForm.category,
      endpoint: agentForm.endpoint.trim(),
      description: agentForm.description.trim(),
      capabilities: agentForm.capabilitiesText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      config: agentForm.configText ? JSON.parse(agentForm.configText) : {},
    }

    if (editingId.value) {
      await updateAgent(editingId.value, payload)
      message.success('Agent 已更新')
    } else {
      await createAgent(payload)
      message.success('Agent 已创建')
    }

    formVisible.value = false
    resetForm()
    loadList()
  } catch (error) {
    message.error(error.response?.data?.message || error.message || '保存 Agent 失败')
  } finally {
    saving.value = false
  }
}

function handleTableChange(pageConfig) {
  filters.page = pageConfig.current
  filters.pageSize = pageConfig.pageSize
  loadList()
}

function search() {
  filters.page = 1
  loadList()
}

function reset() {
  filters.keyword = ''
  filters.category = ''
  filters.publishStatus = ''
  filters.status = ''
  filters.page = 1
  filters.pageSize = 8
  loadList()
}

function goOrchestrate(record) {
  router.push({
    path: '/workflow-orchestration',
    query: {
      agentId: record.id,
    },
  })
}

onMounted(loadList)
</script>

<template>
  <div class="page-stack">
    <a-card title="Agent 搜索表单" class="panel-card">
      <div class="filter-grid">
        <div class="filter-field">
          <span class="filter-field-title">关键字</span>
          <a-input
            v-model:value="filters.keyword"
            placeholder="搜索名称 / 编码 / 负责人"
            @pressEnter="search"
          />
        </div>
        <div class="filter-field">
          <span class="filter-field-title">分类</span>
          <a-select
            v-model:value="filters.category"
            allow-clear
            placeholder="选择分类"
            :options="categoryOptions"
          />
        </div>
        <div class="filter-field">
          <span class="filter-field-title">发布状态</span>
          <a-select
            v-model:value="filters.publishStatus"
            allow-clear
            placeholder="选择发布状态"
            :options="[
              { value: 'published', label: 'published' },
              { value: 'draft', label: 'draft' },
            ]"
          />
        </div>
        <div class="filter-field">
          <span class="filter-field-title">运行状态</span>
          <a-select
            v-model:value="filters.status"
            allow-clear
            placeholder="选择运行状态"
            :options="[
              { value: 'active', label: 'active' },
              { value: 'paused', label: 'paused' },
            ]"
          />
        </div>
        <div class="filter-actions">
          <a-button type="primary" @click="search">查询</a-button>
          <a-button @click="reset">重置</a-button>
        </div>
      </div>
    </a-card>

    <a-card title="Agent 列表" class="panel-card">
      <template #extra>
        <a-button type="primary" @click="openCreate">创建 Agent</a-button>
      </template>
      <a-table
        row-key="id"
        :columns="columns"
        :data-source="agents"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1220 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="table-name-cell">
              <strong>{{ record.name }}</strong>
              <span>{{ record.description || '暂无描述' }}</span>
            </div>
          </template>

          <template v-if="column.key === 'publishStatus'">
            <a-tag :color="record.publishStatus === 'published' ? 'green' : 'default'">
              {{ record.publishStatus }}
            </a-tag>
          </template>

          <template v-if="column.key === 'category'">
            <a-tag color="purple">{{ getCategoryLabel(record.category) }}</a-tag>
          </template>

          <template v-if="column.key === 'status'">
            <a-tag :color="record.status === 'active' ? 'blue' : 'orange'">
              {{ record.status }}
            </a-tag>
          </template>

          <template v-if="column.key === 'action'">
            <a-button type="link" @click="openEdit(record)">编辑</a-button>
            <a-button type="link" @click="goOrchestrate(record)">去编排</a-button>
            <a-button type="link" @click="showDetail(record)">查看详情</a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="formVisible"
      :title="editingId ? '编辑 Agent' : '创建 Agent'"
      :confirm-loading="saving"
      width="760px"
      @ok="submitForm"
      @cancel="resetForm"
    >
      <a-form layout="vertical">
        <div class="agent-form-grid">
          <a-form-item label="名称">
            <a-input v-model:value="agentForm.name" />
          </a-form-item>
          <a-form-item label="编码">
            <a-input v-model:value="agentForm.code" />
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
          <a-form-item label="负责人">
            <a-input v-model:value="agentForm.owner" />
          </a-form-item>
          <a-form-item label="分类">
            <a-select v-model:value="agentForm.category" :options="categoryOptions" />
          </a-form-item>
          <a-form-item label="运行状态">
            <a-select
              v-model:value="agentForm.status"
              :options="[
                { value: 'active', label: 'active' },
                { value: 'paused', label: 'paused' },
              ]"
            />
          </a-form-item>
          <a-form-item label="发布状态">
            <a-select
              v-model:value="agentForm.publishStatus"
              :options="[
                { value: 'draft', label: 'draft' },
                { value: 'published', label: 'published' },
              ]"
            />
          </a-form-item>
          <a-form-item label="版本">
            <a-input-number v-model:value="agentForm.version" class="full-width" :min="1" />
          </a-form-item>
          <a-form-item label="Endpoint">
            <a-input v-model:value="agentForm.endpoint" />
          </a-form-item>
        </div>
        <a-form-item label="能力标签">
          <a-input v-model:value="agentForm.capabilitiesText" placeholder="faq,workflow-binding" />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model:value="agentForm.description" :rows="3" />
        </a-form-item>
        <a-form-item label="运行配置 JSON">
          <a-textarea v-model:value="agentForm.configText" :rows="8" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-drawer
      v-model:open="detailVisible"
      width="720"
      title="Agent 详情"
      :destroy-on-close="true"
    >
      <a-spin :spinning="detailLoading">
        <div v-if="detail" class="drawer-content">
          <div class="detail-grid">
            <div class="detail-card highlight">
              <span class="detail-label">Agent</span>
              <strong class="detail-value">{{ detail.name }}</strong>
              <span class="detail-desc">{{ detail.code }}</span>
            </div>
            <div class="detail-card">
              <span class="detail-label">负责人</span>
              <strong class="detail-value">{{ detail.owner || '未设置' }}</strong>
              <span class="detail-desc">版本 v{{ detail.version }}</span>
            </div>
            <div class="detail-card">
              <span class="detail-label">分类</span>
              <strong class="detail-value detail-value-small">{{ getCategoryLabel(detail.category) }}</strong>
              <span class="detail-desc">{{ detail.endpoint }}</span>
            </div>
            <div class="detail-card">
              <span class="detail-label">发布与运行</span>
              <strong class="detail-value">{{ detail.publishStatus }} / {{ detail.status }}</strong>
              <span class="detail-desc">版本 v{{ detail.version }}</span>
            </div>
          </div>

          <div class="meta-section">
            <div class="meta-block">
              <strong>描述</strong>
              <p>{{ detail.description || '暂无描述' }}</p>
            </div>
            <div class="meta-block">
              <strong>能力标签</strong>
              <div class="tag-row">
                <a-tag v-for="item in detail.capabilities || []" :key="item">{{ item }}</a-tag>
              </div>
            </div>
            <div class="meta-block">
              <strong>绑定流程</strong>
              <div class="binding-list">
                <div v-for="item in detail.bindings || []" :key="item.id" class="binding-item">
                  <div>
                    <strong>{{ item.workflowName }}</strong>
                    <span>{{ item.workflowCode }} · {{ item.workflowStatus }}</span>
                  </div>
                  <a-tag color="blue">{{ item.mode }}</a-tag>
                </div>
              </div>
            </div>
            <div class="meta-block">
              <strong>运行配置</strong>
              <pre>{{ JSON.stringify(detail.config || {}, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </a-spin>
    </a-drawer>
  </div>
</template>
