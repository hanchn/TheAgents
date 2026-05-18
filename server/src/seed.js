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
  const workflowCount = await Workflow.count();
  if (workflowCount > 0) {
    return;
  }

  const workflow = await Workflow.create({
    name: '客服分诊流程',
    code: 'support-triage',
    status: 'published',
    version: 1,
    description: '对用户问题进行识别、路由和执行的标准流程。',
    definition: defaultWorkflowDefinition,
  });

  const agent = await Agent.create({
    name: 'Support Copilot',
    code: 'support-copilot',
    type: 'assistant',
    status: 'active',
    endpoint: 'http://localhost:4000/runtime/support-copilot',
    description: '对外提供客服问答和流程接入能力。',
    capabilities: ['faq', 'triage', 'workflow-binding'],
    config: {
      model: 'gpt-4.1',
      timeoutMs: 12000,
    },
  });

  await AgentWorkflowBinding.create({
    agentId: agent.id,
    workflowId: workflow.id,
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
  });
}

module.exports = {
  seedIfNeeded,
};
