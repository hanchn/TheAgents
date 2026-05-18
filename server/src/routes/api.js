const express = require('express');
const { Op } = require('sequelize');
const { Agent, Workflow, AgentWorkflowBinding } = require('../models');

const router = express.Router();

function parseJsonInput(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function buildWorkflowTrace(workflow) {
  const nodes = workflow?.definition?.nodes || [];

  return nodes.slice(0, 5).map((node, index) => ({
    step: index + 1,
    nodeId: node.id,
    label: node.data?.label || node.id,
    kind: node.data?.kind || 'task',
    prompt: node.data?.prompt || '',
  }));
}

function normalizeAgent(agent, bindings = []) {
  const activeBindings = bindings.filter((item) => item.status === 'enabled');
  const publishedBindings = activeBindings.filter((item) => item.workflow?.status === 'published');

  return {
    id: agent.id,
    name: agent.name,
    code: agent.code,
    type: agent.type,
    status: agent.status,
    publishStatus: agent.publishStatus,
    version: agent.version,
    owner: agent.owner,
    endpoint: agent.endpoint,
    description: agent.description,
    capabilities: agent.capabilities || [],
    config: agent.config || {},
    bindingCount: bindings.length,
    publishedWorkflowCount: publishedBindings.length,
    workflows: publishedBindings.map((item) => ({
      id: item.workflowId,
      name: item.workflow?.name || '',
      code: item.workflow?.code || '',
      version: item.workflow?.version || 1,
    })),
    updatedAt: agent.updatedAt,
    createdAt: agent.createdAt,
  };
}

async function loadBindingsByAgentIds(agentIds) {
  if (!agentIds.length) {
    return {};
  }

  const bindings = await AgentWorkflowBinding.findAll({
    where: {
      agentId: {
        [Op.in]: agentIds,
      },
    },
    include: [{ model: Workflow, as: 'workflow' }],
    order: [['updatedAt', 'DESC']],
  });

  return bindings.reduce((accumulator, binding) => {
    if (!accumulator[binding.agentId]) {
      accumulator[binding.agentId] = [];
    }

    accumulator[binding.agentId].push(binding);
    return accumulator;
  }, {});
}

router.get('/health', async (req, res) => {
  const [agentCount, workflowCount, bindingCount] = await Promise.all([
    Agent.count(),
    Workflow.count(),
    AgentWorkflowBinding.count(),
  ]);

  res.success({
    status: 'ok',
    counts: {
      agents: agentCount,
      workflows: workflowCount,
      bindings: bindingCount,
    },
  });
});

router.get('/dashboard', async (req, res) => {
  const [agents, workflows, bindings] = await Promise.all([
    Agent.findAll({ order: [['updatedAt', 'DESC']], limit: 5 }),
    Workflow.findAll({ order: [['updatedAt', 'DESC']], limit: 5 }),
    AgentWorkflowBinding.findAll({
      include: [
        { model: Agent, as: 'agent' },
        { model: Workflow, as: 'workflow' },
      ],
      order: [['updatedAt', 'DESC']],
      limit: 10,
    }),
  ]);

  res.success({
    agents,
    workflows,
    bindings: bindings.map((binding) => ({
      id: binding.id,
      status: binding.status,
      mode: binding.mode,
      triggerType: binding.triggerType,
      agentName: binding.agent?.name || '',
      workflowName: binding.workflow?.name || '',
      updatedAt: binding.updatedAt,
    })),
  });
});

router.get('/agents/published', async (req, res) => {
  const agents = await Agent.findAll({
    where: {
      publishStatus: 'published',
    },
    order: [['updatedAt', 'DESC']],
  });

  const bindingsMap = await loadBindingsByAgentIds(agents.map((item) => item.id));
  const list = agents
    .map((agent) => normalizeAgent(agent, bindingsMap[agent.id] || []))
    .filter((agent) => agent.publishedWorkflowCount > 0);

  res.success(list);
});

router.get('/agents', async (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 10);
  const keyword = (req.query.keyword || '').trim();
  const publishStatus = (req.query.publishStatus || '').trim();
  const status = (req.query.status || '').trim();

  const where = {};

  if (keyword) {
    where[Op.or] = [
      { name: { [Op.like]: `%${keyword}%` } },
      { code: { [Op.like]: `%${keyword}%` } },
      { owner: { [Op.like]: `%${keyword}%` } },
    ];
  }

  if (publishStatus) {
    where.publishStatus = publishStatus;
  }

  if (status) {
    where.status = status;
  }

  const result = await Agent.findAndCountAll({
    where,
    order: [['updatedAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const bindingsMap = await loadBindingsByAgentIds(result.rows.map((item) => item.id));
  const list = result.rows.map((agent) => normalizeAgent(agent, bindingsMap[agent.id] || []));

  res.pageSuccess(list, result.count, page, pageSize);
});

router.get('/agents/:id', async (req, res) => {
  const agent = await Agent.findByPk(req.params.id);
  if (!agent) {
    return res.fail(404, 'Agent 不存在');
  }

  const bindings = await AgentWorkflowBinding.findAll({
    where: {
      agentId: agent.id,
    },
    include: [{ model: Workflow, as: 'workflow' }],
    order: [['updatedAt', 'DESC']],
  });

  res.success({
    ...normalizeAgent(agent, bindings),
    bindings: bindings.map((binding) => ({
      id: binding.id,
      mode: binding.mode,
      triggerType: binding.triggerType,
      status: binding.status,
      workflowId: binding.workflowId,
      workflowName: binding.workflow?.name || '',
      workflowCode: binding.workflow?.code || '',
      workflowStatus: binding.workflow?.status || '',
      inputMapping: binding.inputMapping,
      outputMapping: binding.outputMapping,
      updatedAt: binding.updatedAt,
    })),
  });
});

router.post('/agents', async (req, res) => {
  const agent = await Agent.create({
    name: req.body.name,
    code: req.body.code,
    type: req.body.type || 'assistant',
    status: req.body.status || 'active',
    publishStatus: req.body.publishStatus || 'draft',
    version: req.body.version || 1,
    owner: req.body.owner || '',
    endpoint: req.body.endpoint || '',
    description: req.body.description || '',
    capabilities: parseJsonInput(req.body.capabilities, []),
    config: parseJsonInput(req.body.config, {}),
  });

  res.success(agent);
});

router.put('/agents/:id', async (req, res) => {
  const agent = await Agent.findByPk(req.params.id);
  if (!agent) {
    return res.fail(404, 'Agent 不存在');
  }

  await agent.update({
    name: req.body.name ?? agent.name,
    code: req.body.code ?? agent.code,
    type: req.body.type ?? agent.type,
    status: req.body.status ?? agent.status,
    publishStatus: req.body.publishStatus ?? agent.publishStatus,
    version: req.body.version ?? agent.version,
    owner: req.body.owner ?? agent.owner,
    endpoint: req.body.endpoint ?? agent.endpoint,
    description: req.body.description ?? agent.description,
    capabilities: parseJsonInput(req.body.capabilities, agent.capabilities),
    config: parseJsonInput(req.body.config, agent.config),
  });

  res.success(agent);
});

router.get('/workflows', async (req, res) => {
  const workflows = await Workflow.findAll({ order: [['updatedAt', 'DESC']] });
  res.success(workflows);
});

router.post('/workflows', async (req, res) => {
  const workflow = await Workflow.create({
    name: req.body.name,
    code: req.body.code,
    description: req.body.description || '',
    status: req.body.status || 'draft',
    version: req.body.version || 1,
    definition: parseJsonInput(req.body.definition, { nodes: [], edges: [] }),
  });

  res.success(workflow);
});

router.put('/workflows/:id', async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);
  if (!workflow) {
    return res.fail(404, '流程不存在');
  }

  const nextVersion = req.body.bumpVersion ? workflow.version + 1 : workflow.version;

  await workflow.update({
    name: req.body.name ?? workflow.name,
    code: req.body.code ?? workflow.code,
    description: req.body.description ?? workflow.description,
    status: req.body.status ?? workflow.status,
    version: nextVersion,
    definition: parseJsonInput(req.body.definition, workflow.definition),
  });

  res.success(workflow);
});

router.get('/bindings', async (req, res) => {
  const bindings = await AgentWorkflowBinding.findAll({
    include: [
      { model: Agent, as: 'agent' },
      { model: Workflow, as: 'workflow' },
    ],
    order: [['updatedAt', 'DESC']],
  });

  res.success(
    bindings.map((binding) => ({
      id: binding.id,
      agentId: binding.agentId,
      workflowId: binding.workflowId,
      mode: binding.mode,
      triggerType: binding.triggerType,
      status: binding.status,
      inputMapping: binding.inputMapping,
      outputMapping: binding.outputMapping,
      agentName: binding.agent?.name || '',
      workflowName: binding.workflow?.name || '',
      updatedAt: binding.updatedAt,
    }))
  );
});

router.post('/bindings', async (req, res) => {
  const binding = await AgentWorkflowBinding.create({
    agentId: req.body.agentId,
    workflowId: req.body.workflowId,
    mode: req.body.mode || 'sync',
    triggerType: req.body.triggerType || 'manual',
    status: req.body.status || 'enabled',
    inputMapping: parseJsonInput(req.body.inputMapping, {}),
    outputMapping: parseJsonInput(req.body.outputMapping, {}),
  });

  res.success(binding);
});

router.put('/bindings/:id', async (req, res) => {
  const binding = await AgentWorkflowBinding.findByPk(req.params.id);
  if (!binding) {
    return res.fail(404, '绑定关系不存在');
  }

  await binding.update({
    agentId: req.body.agentId ?? binding.agentId,
    workflowId: req.body.workflowId ?? binding.workflowId,
    mode: req.body.mode ?? binding.mode,
    triggerType: req.body.triggerType ?? binding.triggerType,
    status: req.body.status ?? binding.status,
    inputMapping: parseJsonInput(req.body.inputMapping, binding.inputMapping),
    outputMapping: parseJsonInput(req.body.outputMapping, binding.outputMapping),
  });

  res.success(binding);
});

router.post('/chat/simulate', async (req, res) => {
  const agent = await Agent.findByPk(req.body.agentId);
  if (!agent) {
    return res.fail(404, 'Agent 不存在');
  }

  const binding = await AgentWorkflowBinding.findOne({
    where: {
      agentId: agent.id,
      status: 'enabled',
    },
    include: [{ model: Workflow, as: 'workflow' }],
    order: [['updatedAt', 'DESC']],
  });

  const workflow = binding?.workflow || null;
  const trace = buildWorkflowTrace(workflow);
  const userMessage = req.body.message || '';

  const reply = workflow
    ? `${agent.name} 已接管请求，并按「${workflow.name}」执行。当前消息是「${userMessage}」，建议下一步优先进入「${trace[0]?.label || '起始节点'}」，最终输出会按绑定映射返回。`
    : `${agent.name} 已收到请求，但当前没有启用的流程绑定。请先在绑定台为这个 Agent 配置流程。`;

  res.success({
    agentId: agent.id,
    agentName: agent.name,
    workflowId: workflow?.id || '',
    workflowName: workflow?.name || '',
    reply,
    trace,
  });
});

module.exports = router;
