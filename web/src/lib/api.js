import axios from 'axios'

const client = axios.create({
  baseURL: 'http://localhost:4000/api',
  timeout: 8000,
})

export function getPublishedAgents() {
  return client.get('/agents/published')
}

export function getAgentPage(params) {
  return client.get('/agents', { params })
}

export function getAgentDetail(id) {
  return client.get(`/agents/${id}`)
}

export function createAgent(payload) {
  return client.post('/agents', payload)
}

export function updateAgent(id, payload) {
  return client.put(`/agents/${id}`, payload)
}

export function getWorkflows() {
  return client.get('/workflows')
}

export function createWorkflow(payload) {
  return client.post('/workflows', payload)
}

export function updateWorkflow(id, payload) {
  return client.put(`/workflows/${id}`, payload)
}

export function getBindings() {
  return client.get('/bindings')
}

export function createBinding(payload) {
  return client.post('/bindings', payload)
}

export function updateBinding(id, payload) {
  return client.put(`/bindings/${id}`, payload)
}

export function simulateAgentChat(payload) {
  return client.post('/chat/simulate', payload)
}

export default client
