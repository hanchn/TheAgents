<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { getAgentDetail, getAgentPage } from '../lib/api'

const loading = ref(false)
const detailLoading = ref(false)
const detailVisible = ref(false)
const agents = ref([])
const total = ref(0)
const detail = ref(null)

const filters = reactive({
  keyword: '',
  publishStatus: '',
  status: '',
  page: 1,
  pageSize: 8,
})

const columns = [
  {
    title: 'Agent',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: '编码',
    dataIndex: 'code',
    key: 'code',
  },
  {
    title: '类型',
    dataIndex: 'type',
    key: 'type',
  },
  {
    title: '发布状态',
    dataIndex: 'publishStatus',
    key: 'publishStatus',
  },
  {
    title: '运行状态',
    dataIndex: 'status',
    key: 'status',
  },
  {
    title: '负责人',
    dataIndex: 'owner',
    key: 'owner',
  },
  {
    title: '已发布流程数',
    dataIndex: 'publishedWorkflowCount',
    key: 'publishedWorkflowCount',
  },
  {
    title: '操作',
    key: 'action',
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
  filters.publishStatus = ''
  filters.status = ''
  filters.page = 1
  filters.pageSize = 8
  loadList()
}

onMounted(loadList)
</script>

<template>
  <div class="page-stack">
    <section class="hero-card">
      <div>
        <p class="brand-kicker">Agent Management</p>
        <h3>Agent 管理列表</h3>
        <p>支持分页、筛选和详情查看，方便你管理已经接入的平台 Agent。</p>
      </div>
    </section>

    <a-card title="筛选条件" class="panel-card">
      <div class="filter-grid">
        <a-input
          v-model:value="filters.keyword"
          placeholder="搜索名称 / 编码 / 负责人"
          @pressEnter="search"
        />
        <a-select
          v-model:value="filters.publishStatus"
          allow-clear
          placeholder="发布状态"
          :options="[
            { value: 'published', label: 'published' },
            { value: 'draft', label: 'draft' },
          ]"
        />
        <a-select
          v-model:value="filters.status"
          allow-clear
          placeholder="运行状态"
          :options="[
            { value: 'active', label: 'active' },
            { value: 'paused', label: 'paused' },
          ]"
        />
        <div class="filter-actions">
          <a-button type="primary" @click="search">查询</a-button>
          <a-button @click="reset">重置</a-button>
        </div>
      </div>
    </a-card>

    <a-card title="Agent 列表" class="panel-card">
      <a-table
        row-key="id"
        :columns="columns"
        :data-source="agents"
        :loading="loading"
        :pagination="pagination"
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

          <template v-if="column.key === 'status'">
            <a-tag :color="record.status === 'active' ? 'blue' : 'orange'">
              {{ record.status }}
            </a-tag>
          </template>

          <template v-if="column.key === 'action'">
            <a-button type="link" @click="showDetail(record)">查看详情</a-button>
          </template>
        </template>
      </a-table>
    </a-card>

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
              <span class="detail-label">发布与运行</span>
              <strong class="detail-value">{{ detail.publishStatus }} / {{ detail.status }}</strong>
              <span class="detail-desc">{{ detail.endpoint }}</span>
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
