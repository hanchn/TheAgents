const { v4: uuidv4 } = require('uuid');
const { sequelize, DataTypes } = require('./db');

const Agent = sequelize.define(
  'Agent',
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: () => uuidv4(),
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'copilot',
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'active',
    },
    endpoint: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    capabilities: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    config: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'agents',
  }
);

const Workflow = sequelize.define(
  'Workflow',
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: () => uuidv4(),
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'draft',
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    definition: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        nodes: [],
        edges: [],
      },
    },
  },
  {
    tableName: 'workflows',
  }
);

const AgentWorkflowBinding = sequelize.define(
  'AgentWorkflowBinding',
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: () => uuidv4(),
    },
    agentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    workflowId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'sync',
    },
    triggerType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'manual',
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'enabled',
    },
    inputMapping: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    outputMapping: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'agent_workflow_bindings',
  }
);

Agent.hasMany(AgentWorkflowBinding, { foreignKey: 'agentId', as: 'bindings' });
Workflow.hasMany(AgentWorkflowBinding, { foreignKey: 'workflowId', as: 'bindings' });
AgentWorkflowBinding.belongsTo(Agent, { foreignKey: 'agentId', as: 'agent' });
AgentWorkflowBinding.belongsTo(Workflow, { foreignKey: 'workflowId', as: 'workflow' });

module.exports = {
  sequelize,
  Agent,
  Workflow,
  AgentWorkflowBinding,
};
