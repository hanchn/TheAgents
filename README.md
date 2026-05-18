# Agent Workflow Workbench

一个本地可运行的前后端 MVP，用来管理 Agent 接入、流程设计和 Agent 与流程的绑定关系。

## 功能

- Agent 接入中心：维护 Agent 基础信息、能力声明、端点和运行配置
- 流程设计器：支持节点画布、节点属性编辑、流程保存与发布
- 流程绑定台：支持将不同 Agent 绑定到已编排流程，并配置输入输出映射
- 本地数据库：使用 `SQLite + Sequelize`，零外部依赖启动

## 目录

```text
.
├── server  # Express + Sequelize + SQLite
└── web     # Vue 3 + Vite + Ant Design Vue + Vue Flow
```

## 启动

### 1. 启动后端

```bash
cd server
npm install
npm run dev
```

后端默认地址：`http://localhost:4000`

### 2. 启动前端

```bash
cd web
npm install
npm run dev -- --host 0.0.0.0
```

前端默认地址：`http://localhost:5173`

## 默认数据

首次启动会自动写入一套演示数据：

- 1 个默认 Agent：`Support Copilot`
- 1 个默认流程：`客服分诊流程`
- 1 条默认绑定关系

## 当前数据模型

- `agents`
- `workflows`
- `agent_workflow_bindings`

数据库文件位于 `server/src/data/agent-workbench.sqlite`
