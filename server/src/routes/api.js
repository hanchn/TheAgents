const express = require('express');
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

router.get('/agents', async (req, res) => {
  const agents = await Agent.findAll({ order: [['updatedAt', 'DESC']] });
  res.success(agents);
});

router.post('/agents', async (req, res) => {
  const agent = await Agent.create({
    name: req.body.name,
    code: req.body.code,
    type: req.body.type || 'assistant',
    status: req.body.status || 'active',
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

module.exports = router;
