const { Agent, Workflow, AgentWorkflowBinding } = require('./models');

const defaultWorkflowDefinition = {
  nodes: [
    {
      id: 'node-intent',
      type: 'default',
      position: { x: 120, y: 120 },
      data: {
        label: '意图识别',
        kind: 'intent',
        prompt: '分析用户输入，识别当前任务类型与约束。',
      },
    },
    {
      id: 'node-router',
      type: 'default',
      position: { x: 420, y: 120 },
      data: {
        label: '流程路由',
        kind: 'router',
        prompt: '根据业务规则决定进入哪个执行流程。',
      },
    },
    {
      id: 'node-executor',
      type: 'default',
      position: { x: 720, y: 120 },
      data: {
        label: '任务执行',
        kind: 'executor',
        prompt: '执行工具调用、知识检索与结果聚合。',
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'node-intent',
      target: 'node-router',
      label: '识别完成',
    },
    {
      id: 'edge-2',
      source: 'node-router',
      target: 'node-executor',
      label: '路由到执行',
    },
  ],
};

async function seedIfNeeded() {
  const [supportWorkflow] = await Workflow.findOrCreate({
    where: { code: 'support-triage' },
    defaults: {
      name: '客服分诊流程',
      code: 'support-triage',
      status: 'published',
      version: 1,
      description: '对用户问题进行识别、路由和执行的标准流程。',
      definition: defaultWorkflowDefinition,
    },
  });

  const [salesWorkflow] = await Workflow.findOrCreate({
    where: { code: 'sales-routing' },
    defaults: {
      name: '销售线索分发流程',
      code: 'sales-routing',
      status: 'published',
      version: 1,
      description: '识别销售意图并分发给对应渠道或顾问。',
      definition: {
        nodes: [
          {
            id: 'sales-intent',
            type: 'default',
            position: { x: 120, y: 180 },
            data: {
              label: '线索识别',
              kind: 'intent',
              prompt: '识别潜在客户意图、行业和预算区间。',
            },
          },
          {
            id: 'sales-score',
            type: 'default',
            position: { x: 420, y: 180 },
            data: {
              label: '线索评分',
              kind: 'router',
              prompt: '根据规则给线索打分并决定分配优先级。',
            },
          },
          {
            id: 'sales-handoff',
            type: 'default',
            position: { x: 720, y: 180 },
            data: {
              label: '顾问分配',
              kind: 'tool',
              prompt: '把线索交给合适的销售顾问或自动回复。',
            },
          },
        ],
        edges: [
          {
            id: 'sales-edge-1',
            source: 'sales-intent',
            target: 'sales-score',
            label: '进入评分',
          },
          {
            id: 'sales-edge-2',
            source: 'sales-score',
            target: 'sales-handoff',
            label: '分配顾问',
          },
        ],
      },
    },
  });

  const [supportAgent] = await Agent.findOrCreate({
    where: { code: 'support-copilot' },
    defaults: {
      name: 'Support Copilot',
      code: 'support-copilot',
      type: 'assistant',
      status: 'active',
      publishStatus: 'published',
      version: 3,
      owner: '客服中台',
      endpoint: 'http://localhost:4000/runtime/support-copilot',
      description: '对外提供客服问答和流程接入能力。',
      capabilities: ['faq', 'triage', 'workflow-binding'],
      config: {
        model: 'gpt-4.1',
        timeoutMs: 12000,
      },
    },
  });

  const [salesAgent] = await Agent.findOrCreate({
    where: { code: 'sales-router' },
    defaults: {
      name: 'Sales Router',
      code: 'sales-router',
      type: 'router',
      status: 'active',
      publishStatus: 'published',
      version: 2,
      owner: '销售增长',
      endpoint: 'http://localhost:4000/runtime/sales-router',
      description: '针对销售场景进行意图判断和顾问分配。',
      capabilities: ['lead-routing', 'crm-sync', 'workflow-binding'],
      config: {
        model: 'gpt-4.1-mini',
        timeoutMs: 10000,
      },
    },
  });

  await AgentWorkflowBinding.findOrCreate({
    where: {
      agentId: supportAgent.id,
      workflowId: supportWorkflow.id,
    },
    defaults: {
      mode: 'sync',
      triggerType: 'manual',
      status: 'enabled',
      inputMapping: {
        question: '$input.query',
        history: '$input.history',
      },
      outputMapping: {
        answer: '$workflow.answer',
        route: '$workflow.route',
      },
    },
  });

  await AgentWorkflowBinding.findOrCreate({
    where: {
      agentId: salesAgent.id,
      workflowId: salesWorkflow.id,
    },
    defaults: {
      mode: 'async',
      triggerType: 'event',
      status: 'enabled',
      inputMapping: {
        lead: '$input.lead',
        source: '$input.source',
      },
      outputMapping: {
        owner: '$workflow.owner',
        nextAction: '$workflow.nextAction',
      },
    },
  });

  await supportAgent.update({
    publishStatus: 'published',
    version: supportAgent.version || 3,
    owner: supportAgent.owner || '客服中台',
  });

  await salesAgent.update({
    publishStatus: 'published',
    version: salesAgent.version || 2,
    owner: salesAgent.owner || '销售增长',
  });
}

module.exports = {
  seedIfNeeded,
};
